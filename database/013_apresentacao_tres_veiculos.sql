-- REINICIA OS DADOS OPERACIONAIS, conforme solicitado para a apresentação.
-- Apaga viagens, despesas, checklists e veículos anteriores.
-- Mantém administradores e somente três perfis de motoristas de demonstração.
-- Executar novamente reinicia também as operações feitas na apresentação.
BEGIN;
DO $$
DECLARE
  ids uuid[] := ARRAY[
    'd1800000-0000-4000-8000-000000000001'::uuid,
    'd1800000-0000-4000-8000-000000000002'::uuid,
    'd1800000-0000-4000-8000-000000000003'::uuid
  ];
  nomes text[] := ARRAY['Carlos Almeida', 'Ana Martins', 'João Ferreira'];
  caminhoes text[] := ARRAY['Volvo FH 460', 'Mercedes Atego 1719', 'Iveco S-Way 450'];
  placas text[] := ARRAY['APR1A01', 'APR2A02', 'APR3A03'];
  kms bigint[] := ARRAY[120000, 85000, 64000];
  labels text[] := ARRAY['Óleo do Motor', 'Nível de Água', 'Fluido de Freio',
    'Pneu Dianteiro Esquerdo (DE)', 'Pneu Dianteiro Direito (DD)',
    'Pneu Traseiro Esquerdo (TE)', 'Pneu Traseiro Direito (TD)',
    'Farol Direito', 'Farol Esquerdo', 'Seta Esquerda', 'Seta Direita',
    'Iluminação Traseira Esquerda', 'Iluminação Traseira Direita',
    'Cadeado no Baú', 'Limpeza Geral', 'Limpeza da Cabine'];
  n integer; j integer; itens jsonb; veiculo text; motivo text;
BEGIN
  -- Não altera uma conta administrativa que eventualmente use um desses IDs.
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = ANY(ids) AND perfil <> 'motorista') THEN
    RAISE EXCEPTION 'Um ID reservado para motorista pertence a outro perfil.';
  END IF;
  DELETE FROM public.abastecimentos;
  DELETE FROM public.pedagios;
  DELETE FROM public.checklists;
  DELETE FROM public.viagens;
  DELETE FROM public.veiculos;
  DELETE FROM auth.users WHERE id IN (
    SELECT id FROM public.usuarios WHERE perfil = 'motorista' AND NOT (id = ANY(ids))
  );

  FOR n IN 1..3 LOOP
    INSERT INTO auth.users(id, email, raw_user_meta_data)
      VALUES(ids[n], 'motorista' || n || '@frota.invalid', jsonb_build_object('nome', nomes[n]))
      ON CONFLICT (id) DO NOTHING;
    UPDATE public.usuarios SET nome = nomes[n], ativo = true WHERE id = ids[n];
    veiculo := 'apresentacao-v' || n;
    motivo := CASE WHEN n = 3
      THEN 'Farol direito com defeito. Saída bloqueada até reparo e liberação do responsável.'
      ELSE 'Inspeção aprovada. Revisão em dia e veículo apto para operação.' END;
    INSERT INTO public.veiculos(id, nome, placa, tipo, ano, intervalo_revisao,
      ultimo_km, proxima_revisao_km, status, ultimo_motorista, ultima_avaria, ultima_atualizacao)
    VALUES(veiculo, caminhoes[n], placas[n], 'Caminhão', 2024, 10000,
      kms[n], kms[n] + 10000, CASE WHEN n = 3 THEN 'Avaria' ELSE 'Liberado' END,
      nomes[n], CASE WHEN n = 3 THEN motivo ELSE NULL END, now() - interval '1 hour');
    itens := '[]'::jsonb;
    FOR j IN 1..16 LOOP
      itens := itens || jsonb_build_array(jsonb_build_object('id', 'item-' || j,
        'label', labels[j], 'ok', NOT (n = 3 AND j = 8),
        'valor', CASE WHEN n = 3 AND j = 8 THEN 'DEFEITO'
          WHEN j = 14 THEN 'SIM' WHEN j BETWEEN 8 AND 13 THEN 'OK' ELSE 'BOM' END,
        'obs', CASE WHEN n = 3 AND j = 8 THEN motivo ELSE '' END));
    END LOOP;
    INSERT INTO public.checklists(id, veiculo_id, motorista_id, motorista, nome_veiculo,
      placa, km, proxima_revisao_km, status, realizado_em, obs_geral, itens, fotos)
    VALUES('apresentacao-c' || n, veiculo, ids[n], nomes[n], caminhoes[n], placas[n],
      kms[n], kms[n] + 10000, CASE WHEN n = 3 THEN 'Avaria' ELSE 'Liberado' END,
      now() - interval '1 hour', motivo, itens, '{}');
  END LOOP;
  INSERT INTO public.viagens(id, veiculo_id, motorista_id, motorista, nome_veiculo,
    placa, destino, km_inicial, saida_em, status)
  VALUES('apresentacao-viagem1', 'apresentacao-v1', ids[1], nomes[1], caminhoes[1],
    placas[1], 'Campinas/SP', kms[1], now() - interval '30 minutes', 'Em Andamento');
  UPDATE public.veiculos SET status = 'Em Trânsito', motorista_atual_id = ids[1],
    motorista_atual = nomes[1], destino_atual = 'Campinas/SP',
    hora_saida_atual = now() - interval '30 minutes', ultima_atualizacao = now() - interval '30 minutes'
    WHERE id = 'apresentacao-v1';

  IF (SELECT count(*) FROM public.veiculos) <> 3
    OR (SELECT count(*) FROM public.usuarios WHERE perfil = 'motorista') <> 3
    OR (SELECT count(DISTINCT status) FROM public.veiculos) <> 3 THEN
    RAISE EXCEPTION 'A base não corresponde aos três cenários solicitados.';
  END IF;
END;
$$;
COMMIT;
