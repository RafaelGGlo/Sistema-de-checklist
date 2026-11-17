-- Histórico fictício para os relatórios: mesmos três caminhões e motoristas.
-- Somente inclusão; não muda veículos, contas, checklists atuais nem a viagem aberta.
-- 179 dias anteriores ao cenário de apresentação + os registros já existentes do dia atual.
BEGIN;
DO $$
DECLARE
  n integer; d integer; j integer; dia date; hoje date; momento timestamptz;
  c public.checklists; km bigint; total_km bigint; distancia integer;
  defeito boolean; houve_reparo boolean; itens jsonb; motivo text; chave text;
  quantidade integer := 0; litros numeric; preco numeric; destino text;
  labels text[] := ARRAY['Óleo do Motor', 'Nível de Água', 'Fluido de Freio',
    'Pneu Dianteiro Esquerdo (DE)', 'Pneu Dianteiro Direito (DD)',
    'Pneu Traseiro Esquerdo (TE)', 'Pneu Traseiro Direito (TD)',
    'Farol Direito', 'Farol Esquerdo', 'Seta Esquerda', 'Seta Direita',
    'Iluminação Traseira Esquerda', 'Iluminação Traseira Direita',
    'Cadeado no Baú', 'Limpeza Geral', 'Limpeza da Cabine'];
  destinos text[] := ARRAY['Campinas/SP', 'Santos/SP', 'Sorocaba/SP', 'São José dos Campos/SP', 'Ribeirão Preto/SP', 'São Paulo/SP'];
BEGIN
  -- Usa a data original da apresentação para não deslocar a carga ao reexecutar.
  SELECT min((realizado_em AT TIME ZONE 'America/Sao_Paulo')::date) INTO hoje
    FROM public.checklists WHERE id IN ('apresentacao-c1', 'apresentacao-c2', 'apresentacao-c3');
  IF hoje IS NULL OR (SELECT count(*) FROM public.checklists
    WHERE id IN ('apresentacao-c1', 'apresentacao-c2', 'apresentacao-c3')) <> 3
    OR (SELECT count(*) FROM public.veiculos) <> 3 THEN
    RAISE EXCEPTION 'Esta carga exige os três veículos e checklists originais da apresentação.';
  END IF;
  FOR n IN 1..3 LOOP
    FOR d IN 1..179 LOOP
      dia := hoje - 180 + d;
      IF extract(isodow FROM dia) <> 7 AND (d + n * 7) % 37 <> 0 THEN
        quantidade := quantidade + 1;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.checklists WHERE id LIKE 'hist3-%') THEN
    IF (SELECT count(*) FROM public.checklists WHERE id LIKE 'hist3-%') <> 537
      OR (SELECT count(*) FROM public.viagens WHERE id LIKE 'hist3-%') <> quantidade
      OR (SELECT count(*) FROM public.abastecimentos WHERE id LIKE 'hist3-%') <> quantidade
      OR (SELECT count(*) FROM public.pedagios WHERE id LIKE 'hist3-%') <> quantidade THEN
      RAISE EXCEPTION 'Histórico parcial ou alterado. Confira antes de aplicar novamente.';
    END IF;
    RAISE NOTICE 'Histórico completo já instalado; dados e operações atuais preservados.';
    RETURN;
  END IF;

  FOR n IN 1..3 LOOP
    SELECT * INTO STRICT c FROM public.checklists WHERE id = 'apresentacao-c' || n;
    IF c.veiculo_id <> 'apresentacao-v' || n OR c.motorista_id IS NULL THEN
      RAISE EXCEPTION 'Vínculos originais da apresentação foram alterados.';
    END IF;
    total_km := 0;
    FOR d IN 1..179 LOOP
      dia := hoje - 180 + d;
      IF extract(isodow FROM dia) <> 7 AND (d + n * 7) % 37 <> 0 THEN
        total_km := total_km + 80 + (d * 31 + n * 47) % 220;
      END IF;
    END LOOP;
    km := c.km - total_km;
    IF km < 0 THEN RAISE EXCEPTION 'KM atual insuficiente para construir o histórico.'; END IF;
    houve_reparo := false;
    FOR d IN 1..179 LOOP
      dia := hoje - 180 + d;
      momento := (dia + time '06:00') AT TIME ZONE 'America/Sao_Paulo';
      chave := 'hist3-' || n || '-' || to_char(dia, 'YYYYMMDD');
      defeito := (d + n * 7) % 37 = 0;
      distancia := CASE WHEN NOT defeito AND extract(isodow FROM dia) <> 7
        THEN 80 + (d * 31 + n * 47) % 220 ELSE 0 END;
      motivo := CASE WHEN defeito THEN 'Farol direito com defeito. Veículo retido para reparo, sem saída neste dia.'
        WHEN houve_reparo THEN 'Farol reparado e conferido. Inspeção aprovada para retorno à operação.'
        WHEN d % 30 = 0 THEN 'Manutenção preventiva e troca de óleo concluídas. Inspeção aprovada.'
        ELSE 'Inspeção aprovada. Veículo apto para operação.' END;
      itens := '[]'::jsonb;
      FOR j IN 1..16 LOOP
        itens := itens || jsonb_build_array(jsonb_build_object('id', 'item-' || j,
          'label', labels[j], 'ok', NOT (defeito AND j = 8),
          'valor', CASE WHEN defeito AND j = 8 THEN 'DEFEITO' WHEN j = 14 THEN 'SIM'
            WHEN j BETWEEN 8 AND 13 THEN 'OK' ELSE 'BOM' END,
          'obs', CASE WHEN defeito AND j = 8 THEN motivo ELSE '' END));
      END LOOP;
      INSERT INTO public.checklists(id, veiculo_id, motorista_id, motorista, nome_veiculo,
        placa, km, proxima_revisao_km, status, realizado_em, obs_geral, itens, fotos, criado_em)
      VALUES(chave || '-c', c.veiculo_id, c.motorista_id, c.motorista, c.nome_veiculo,
        c.placa, km, km + 10000, CASE WHEN defeito THEN 'Avaria' ELSE 'Liberado' END,
        momento, motivo, itens, '{}', momento);

      IF distancia > 0 THEN
        destino := destinos[1 + (d + n) % 6];
        INSERT INTO public.viagens(id, veiculo_id, motorista_id, motorista, nome_veiculo,
          placa, destino, km_inicial, km_final, saida_em, retorno_em, status, criado_em)
        VALUES(chave || '-v', c.veiculo_id, c.motorista_id, c.motorista, c.nome_veiculo,
          c.placa, destino, km, km + distancia, momento + interval '1 hour',
          momento + interval '11 hours', 'Finalizada', momento + interval '1 hour');
        litros := round(distancia::numeric / (2.6 + n::numeric / 10), 3);
        preco := 5.75 + (d % 11)::numeric / 20 + n::numeric / 10;
        INSERT INTO public.abastecimentos(id, veiculo_id, viagem_id, motorista_id, motorista,
          nome_veiculo, placa, litros, valor_total, registrado_em, km, posto, criado_em)
        VALUES(chave || '-a', c.veiculo_id, chave || '-v', c.motorista_id, c.motorista,
          c.nome_veiculo, c.placa, litros, round(litros * preco, 2),
          momento + interval '5 hours', km + distancia / 2,
          'Posto Estrada ' || (1 + d % 4), momento + interval '5 hours');
        INSERT INTO public.pedagios(id, veiculo_id, viagem_id, motorista_id, motorista,
          nome_veiculo, placa, valor, registrado_em, local, criado_em)
        VALUES(chave || '-p', c.veiculo_id, chave || '-v', c.motorista_id, c.motorista,
          c.nome_veiculo, c.placa, 12.90 + ((d + n) % 6) * 7.40,
          momento + interval '3 hours', 'Praça ' || (1 + (d + n) % 5), momento + interval '3 hours');
        km := km + distancia;
      END IF;
      houve_reparo := defeito;
    END LOOP;
    IF km <> c.km THEN RAISE EXCEPTION 'Histórico não termina no KM atual do veículo.'; END IF;
  END LOOP;
END;
$$;
COMMIT;
