-- Execute uma vez, em uma base vazia, pelo SQL Editor do Neon.
-- PostgreSQL. Modelo para acesso por API backend, nao diretamente pelo cliente.
-- Nao importa dados nem substitui Firebase Auth. Sem DROP de dados existentes.
BEGIN;
CREATE SCHEMA frota;
REVOKE ALL ON SCHEMA frota FROM PUBLIC;

-- IDs textuais permitem preservar os IDs dos documentos Firestore na importacao.
-- Novos registros recebem UUID em formato texto.
CREATE TABLE frota.usuarios (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auth_provedor text NOT NULL DEFAULT 'firebase',
  auth_uid text NOT NULL,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  email text NOT NULL CHECK (btrim(email) <> ''),
  perfil text NOT NULL CHECK (perfil IN ('administrador', 'motorista')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provedor, auth_uid)
);
CREATE UNIQUE INDEX usuarios_email_unico ON frota.usuarios (lower(email));

CREATE TABLE frota.veiculos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  placa text NOT NULL CHECK (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  tipo text NOT NULL,
  ano smallint CHECK (ano BETWEEN 1900 AND 2200),
  intervalo_revisao integer NOT NULL DEFAULT 30000 CHECK (intervalo_revisao > 0),
  proxima_revisao_km bigint CHECK (proxima_revisao_km >= 0),
  foto text,
  status text NOT NULL DEFAULT 'Liberado' CHECK (status IN ('Liberado', 'Em Trânsito', 'Avaria', 'Manutenção')),
  motorista_atual_id text REFERENCES frota.usuarios(id) ON DELETE RESTRICT,
  motorista_atual text,
  destino_atual text,
  hora_saida_atual timestamptz,
  ultimo_km bigint CHECK (ultimo_km >= 0),
  ultimo_motorista text,
  ultima_avaria text,
  ultima_atualizacao timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (placa)
);

CREATE TABLE frota.viagens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES frota.veiculos(id) ON DELETE RESTRICT,
  motorista_id text REFERENCES frota.usuarios(id) ON DELETE RESTRICT,
  motorista text NOT NULL,
  nome_veiculo text NOT NULL,
  placa text NOT NULL,
  destino text NOT NULL DEFAULT 'Em Rota',
  km_inicial bigint CHECK (km_inicial >= 0),
  km_final bigint CHECK (km_final >= 0),
  km_percorrido bigint GENERATED ALWAYS AS (km_final - km_inicial) STORED,
  saida_em timestamptz NOT NULL,
  retorno_em timestamptz,
  status text NOT NULL DEFAULT 'Em Andamento' CHECK (status IN ('Em Andamento', 'Finalizada')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (km_final IS NULL OR km_inicial IS NULL OR km_final >= km_inicial),
  CHECK (retorno_em IS NULL OR retorno_em >= saida_em),
  CHECK ((status = 'Em Andamento' AND retorno_em IS NULL) OR
         (status = 'Finalizada' AND retorno_em IS NOT NULL))
);
CREATE UNIQUE INDEX uma_viagem_ativa_por_veiculo ON frota.viagens(veiculo_id) WHERE status = 'Em Andamento';
CREATE UNIQUE INDEX uma_viagem_ativa_por_motorista ON frota.viagens(motorista_id) WHERE status = 'Em Andamento' AND motorista_id IS NOT NULL;
CREATE INDEX viagens_saida ON frota.viagens(saida_em DESC);
CREATE INDEX viagens_veiculo ON frota.viagens(veiculo_id, saida_em DESC);
CREATE INDEX viagens_motorista ON frota.viagens(motorista_id, status);

CREATE TABLE frota.checklists (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES frota.veiculos(id) ON DELETE RESTRICT,
  motorista_id text REFERENCES frota.usuarios(id) ON DELETE RESTRICT,
  motorista text NOT NULL,
  nome_veiculo text NOT NULL,
  placa text NOT NULL,
  km bigint NOT NULL CHECK (km >= 0),
  proxima_revisao_km bigint CHECK (proxima_revisao_km >= 0),
  status text NOT NULL CHECK (status IN ('Liberado', 'Avaria')),
  realizado_em timestamptz NOT NULL,
  obs_geral text,
  -- Preserva {label, valor, ok} e o campo obs da versao antiga.
  itens jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(itens) = 'array'),
  -- Chaves: painel, cabine, ldEsq, ldDir, traseira, frente.
  -- Aceita data URLs legadas; preferir chaves de arquivos em storage privado.
  fotos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fotos) = 'object'),
  assinatura text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklists_data ON frota.checklists(realizado_em DESC);
CREATE INDEX checklists_veiculo_data ON frota.checklists(veiculo_id, realizado_em DESC);
CREATE INDEX checklists_motorista ON frota.checklists(motorista_id);

CREATE TABLE frota.abastecimentos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES frota.veiculos(id) ON DELETE RESTRICT,
  viagem_id text REFERENCES frota.viagens(id) ON DELETE RESTRICT,
  motorista_id text REFERENCES frota.usuarios(id) ON DELETE RESTRICT,
  motorista text NOT NULL,
  nome_veiculo text NOT NULL,
  placa text NOT NULL,
  litros numeric(12,3) NOT NULL CHECK (litros > 0),
  valor_total numeric(14,2) NOT NULL CHECK (valor_total > 0),
  registrado_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX abastecimentos_data ON frota.abastecimentos(registrado_em DESC);
CREATE INDEX abastecimentos_veiculo ON frota.abastecimentos(veiculo_id);
CREATE INDEX abastecimentos_viagem ON frota.abastecimentos(viagem_id);
CREATE INDEX abastecimentos_motorista ON frota.abastecimentos(motorista_id);

CREATE TABLE frota.pedagios (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES frota.veiculos(id) ON DELETE RESTRICT,
  viagem_id text REFERENCES frota.viagens(id) ON DELETE RESTRICT,
  motorista_id text REFERENCES frota.usuarios(id) ON DELETE RESTRICT,
  motorista text NOT NULL,
  nome_veiculo text NOT NULL,
  placa text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  registrado_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedagios_data ON frota.pedagios(registrado_em DESC);
CREATE INDEX pedagios_veiculo ON frota.pedagios(veiculo_id);
CREATE INDEX pedagios_viagem ON frota.pedagios(viagem_id);
CREATE INDEX pedagios_motorista ON frota.pedagios(motorista_id);

-- Sem acesso publico. A API deve usar uma role propria com permissoes minimas.
REVOKE ALL ON ALL TABLES IN SCHEMA frota FROM PUBLIC;
COMMIT;
