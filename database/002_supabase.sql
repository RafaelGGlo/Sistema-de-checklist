-- SUPABASE: execute uma vez em projeto novo, sem executar o SQL Neon.
BEGIN;
CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  email text,
  perfil text NOT NULL DEFAULT 'motorista' CHECK (perfil IN ('administrador', 'motorista')),
  ativo boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_email_unico ON public.usuarios(lower(email));
CREATE FUNCTION public.frota_criar_perfil() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.usuarios(id, nome, email)
  VALUES (NEW.id, COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'nome'), ''),
    NULLIF(split_part(NEW.email, '@', 1), ''), 'Motorista'), NEW.email);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.frota_criar_perfil() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER frota_novo_usuario AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.frota_criar_perfil();
INSERT INTO public.usuarios(id, nome, email)
SELECT id, COALESCE(NULLIF(btrim(raw_user_meta_data ->> 'nome'), ''),
  NULLIF(split_part(email, '@', 1), ''), 'Motorista'), email FROM auth.users;
CREATE FUNCTION public.frota_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND ativo AND perfil = 'administrador');
$$;
CREATE FUNCTION public.frota_ativo() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND ativo);
$$;
REVOKE ALL ON FUNCTION public.frota_admin(), public.frota_ativo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frota_admin(), public.frota_ativo() TO authenticated;

CREATE TABLE public.veiculos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  placa text NOT NULL CHECK (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  tipo text NOT NULL,
  ano smallint CHECK (ano BETWEEN 1900 AND 2200),
  intervalo_revisao integer NOT NULL DEFAULT 30000 CHECK (intervalo_revisao > 0),
  proxima_revisao_km bigint CHECK (proxima_revisao_km >= 0),
  foto text,
  status text NOT NULL DEFAULT 'Liberado' CHECK (status IN ('Liberado', 'Em Trânsito', 'Avaria', 'Manutenção')),
  motorista_atual_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
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

CREATE TABLE public.viagens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  motorista_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
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
CREATE UNIQUE INDEX uma_viagem_ativa_por_veiculo ON public.viagens(veiculo_id) WHERE status = 'Em Andamento';
CREATE UNIQUE INDEX uma_viagem_ativa_por_motorista ON public.viagens(motorista_id) WHERE status = 'Em Andamento' AND motorista_id IS NOT NULL;
CREATE INDEX viagens_saida ON public.viagens(saida_em DESC);
CREATE INDEX viagens_veiculo ON public.viagens(veiculo_id, saida_em DESC);
CREATE INDEX viagens_motorista ON public.viagens(motorista_id, status);

CREATE TABLE public.checklists (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  motorista_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
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
CREATE INDEX checklists_data ON public.checklists(realizado_em DESC);
CREATE INDEX checklists_veiculo_data ON public.checklists(veiculo_id, realizado_em DESC);
CREATE INDEX checklists_motorista ON public.checklists(motorista_id);

CREATE TABLE public.abastecimentos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  viagem_id text REFERENCES public.viagens(id) ON DELETE RESTRICT,
  motorista_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motorista text NOT NULL,
  nome_veiculo text NOT NULL,
  placa text NOT NULL,
  litros numeric(12,3) NOT NULL CHECK (litros > 0),
  valor_total numeric(14,2) NOT NULL CHECK (valor_total > 0),
  registrado_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX abastecimentos_data ON public.abastecimentos(registrado_em DESC);
CREATE INDEX abastecimentos_veiculo ON public.abastecimentos(veiculo_id);
CREATE INDEX abastecimentos_viagem ON public.abastecimentos(viagem_id);
CREATE INDEX abastecimentos_motorista ON public.abastecimentos(motorista_id);

CREATE TABLE public.pedagios (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  veiculo_id text NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  viagem_id text REFERENCES public.viagens(id) ON DELETE RESTRICT,
  motorista_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motorista text NOT NULL,
  nome_veiculo text NOT NULL,
  placa text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  registrado_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedagios_data ON public.pedagios(registrado_em DESC);
CREATE INDEX pedagios_veiculo ON public.pedagios(veiculo_id);
CREATE INDEX pedagios_viagem ON public.pedagios(viagem_id);
CREATE INDEX pedagios_motorista ON public.pedagios(motorista_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios','veiculos','viagens','checklists','abastecimentos','pedagios'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY frota_admin_total ON public.%I FOR ALL TO authenticated USING ((SELECT public.frota_admin())) WITH CHECK ((SELECT public.frota_admin()))', t);
  END LOOP;
END;
$$;
CREATE POLICY frota_perfil_proprio ON public.usuarios FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));
CREATE POLICY frota_veiculos_leitura ON public.veiculos FOR SELECT TO authenticated
USING ((SELECT public.frota_ativo()) AND ativo);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['viagens','checklists','abastecimentos','pedagios'] LOOP
    EXECUTE format('CREATE POLICY frota_historico_proprio ON public.%I FOR SELECT TO authenticated USING ((SELECT public.frota_ativo()) AND motorista_id = (SELECT auth.uid()))', t);
  END LOOP;
END;
$$;
-- Escritas dos motoristas: implementar RPC/Edge Function autenticada na integracao.
-- Nao permitir UPDATE irrestrito do veiculo pelo motorista.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('frota-arquivos', 'frota-arquivos', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']);
-- Caminho: UID/nome-unico.jpg. Arquivos privados.
CREATE POLICY frota_arquivos_ler ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'frota-arquivos' AND
  ((SELECT public.frota_admin()) OR ((SELECT public.frota_ativo()) AND
   (storage.foldername(name))[1] = (SELECT auth.uid())::text)));
CREATE POLICY frota_arquivos_enviar ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'frota-arquivos' AND (SELECT public.frota_ativo()) AND
  (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY frota_arquivos_admin_alterar ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'frota-arquivos' AND (SELECT public.frota_admin()))
WITH CHECK (bucket_id = 'frota-arquivos' AND (SELECT public.frota_admin()));
CREATE POLICY frota_arquivos_admin_excluir ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'frota-arquivos' AND (SELECT public.frota_admin()));
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['veiculos','viagens','checklists','abastecimentos','pedagios'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END;
$$;
COMMIT;


