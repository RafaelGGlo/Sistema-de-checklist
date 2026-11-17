-- Base fictícia TCC: 21/05/2026 a 16/11/2026 (180 dias inclusivos).
-- Somente inclusão, transacional e repetível. Nunca sobrescreve registros existentes.
-- Motoristas sem senha/identidade de login; não envia e-mails nem cria credenciais.
BEGIN;
DO $$
DECLARE
  n integer; d integer; j integer; dia date; momento timestamptz;
  motorista_id uuid; motorista text; veiculo_id text; nome text; placa text;
  km bigint; revisao bigint; distancia integer; litros numeric; valor numeric;
  defeito integer; reparo boolean; motivo text; estado text; itens jsonb;
  viagem_id text; chave text; destino text; em_rota boolean;
  nomes text[] := ARRAY['Carlos Almeida','Ana Martins','João Ferreira','Mariana Costa','Paulo Ribeiro','Luciana Santos','Pedro Oliveira','Beatriz Lima'];
  caminhoes text[] := ARRAY['Volvo FH 460','Scania R 450','Mercedes Actros 2651','DAF XF 480','Iveco S-Way 450','VW Constellation 24.280','Mercedes Atego 1719','Volvo VM 270'];
  destinos text[] := ARRAY['Campinas/SP','Santos/SP','Sorocaba/SP','Ribeirão Preto/SP','São José dos Campos/SP','Curitiba/PR'];
  labels text[] := ARRAY['Óleo do Motor','Nível de Água','Fluido de Freio','Pneu Dianteiro Esquerdo (DE)','Pneu Dianteiro Direito (DD)','Pneu Traseiro Esquerdo (TE)','Pneu Traseiro Direito (TD)','Farol Direito','Farol Esquerdo','Seta Esquerda','Seta Direita','Iluminação Traseira Esquerda','Iluminação Traseira Direita','Cadeado no Baú','Limpeza Geral','Limpeza da Cabine'];
BEGIN
  -- Se a carga já existe, não repete nem desfaz operações realizadas na apresentação.
  IF EXISTS (SELECT 1 FROM public.veiculos WHERE id LIKE 'demo-tcc-180-v%') THEN
    IF (SELECT count(*) FROM public.veiculos WHERE id LIKE 'demo-tcc-180-v%') <> 8
       OR (SELECT count(*) FROM public.checklists WHERE id LIKE 'demo-tcc-180-c%') <> 1440 THEN
      RAISE EXCEPTION 'Base TCC parcial ou alterada. Confira os registros antes de executar novamente.';
    END IF;
    RAISE NOTICE 'Base TCC já instalada; registros preservados.';
    RETURN;
  END IF;
  FOR n IN 1..8 LOOP
    motorista_id := ('d1800000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    motorista := nomes[n];
    veiculo_id := 'demo-tcc-180-v' || n;
    nome := caminhoes[n];
    placa := 'TCC' || n || 'D' || lpad(n::text,2,'0');
    INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES(motorista_id,'motorista' || n || '@frota.invalid',jsonb_build_object('nome',motorista,'demo_tcc',true));
    -- O gatilho existente cria o perfil em public.usuarios.
    UPDATE public.usuarios SET ativo=true,perfil='motorista',criado_em='2026-05-21T06:00:00-03:00' WHERE id=motorista_id;
    km := 85000 + n * 22000; revisao := km + 10000; reparo := false;
    INSERT INTO public.veiculos(id,nome,placa,tipo,ano,intervalo_revisao,ultimo_km,proxima_revisao_km,criado_em)
      VALUES(veiculo_id,nome,placa,'Caminhão',2020+n%6,10000,km,revisao,'2026-05-21T06:00:00-03:00');
    FOR d IN 0..179 LOOP
      dia := date '2026-05-21' + d;
      momento := (dia + time '06:00') AT TIME ZONE 'America/Sao_Paulo';
      chave := n || '-' || to_char(dia,'YYYYMMDD');
      defeito := 0; motivo := 'Inspeção aprovada. Veículo apto para operação.';
      IF reparo THEN
        revisao := km + 10000; reparo := false;
        motivo := 'Manutenção concluída: pendência corrigida, óleo e filtros substituídos; próxima revisão registrada. Liberação após conferência do responsável.';
      ELSIF d < 179 AND km + 500 >= revisao THEN
        defeito := 1; reparo := true;
        motivo := 'Troca preventiva de óleo e filtros: rota excederia o limite da revisão. Saída suspensa para manutenção.';
      ELSIF d < 179 AND (d+n*3)%37=0 THEN
        defeito := (ARRAY[3,4,8,10])[1+(d+n)%4]; reparo := true;
        motivo := '' || labels[defeito] || ' com defeito. Saída bloqueada; encaminhar para oficina. Retorno à operação somente após reparo e liberação.';
      END IF;
      IF d=179 THEN
        CASE n
          WHEN 1 THEN
            revisao := km-650; defeito := 1;
            motivo := 'TROCA DE ÓLEO VENCIDA há 650 KM. Não autorizado a sair do pátio. Trocar óleo e filtros, registrar a próxima revisão e obter liberação do responsável.';
          WHEN 2 THEN
            defeito := 3;
            motivo := 'Manutenção corretiva do sistema de freios: vazamento no circuito. Retido na oficina, sem autorização de saída até conclusão e liberação.';
          WHEN 3 THEN
            defeito := 4;
            motivo := 'Pneu dianteiro esquerdo com corte e desgaste acentuado. Saída bloqueada até substituição e nova inspeção.';
          WHEN 4 THEN
            defeito := 8;
            motivo := 'Farol direito com defeito. Veículo retido no pátio até reparo da iluminação e liberação.';
          WHEN 7 THEN
            revisao := km+350;
            motivo := 'Revisão próxima: faltam 350 KM. Planejar troca de óleo antes de uma rota que atinja o limite.';
          WHEN 8 THEN
            revisao := km+10000;
            motivo := 'Óleo e filtros trocados hoje. Inspeção aprovada e próxima revisão cadastrada. Veículo liberado para nova saída.';
          ELSE NULL;
        END CASE;
      END IF;
      itens := '[]'::jsonb;
      FOR j IN 1..16 LOOP
        valor := NULL;
        itens := itens || jsonb_build_array(jsonb_build_object('id','item-'||j,'label',labels[j],
          'valor',CASE WHEN j=defeito THEN CASE WHEN j BETWEEN 8 AND 13 THEN 'DEFEITO' ELSE 'RUIM' END
            WHEN j=14 THEN 'SIM' WHEN j BETWEEN 8 AND 13 THEN 'OK' ELSE 'BOM' END,
          'ok',j<>defeito,'obs',CASE WHEN j=defeito THEN motivo ELSE '' END));
      END LOOP;
      INSERT INTO public.checklists(id,veiculo_id,motorista_id,motorista,nome_veiculo,placa,km,proxima_revisao_km,status,realizado_em,obs_geral,itens,fotos,criado_em)
        VALUES('demo-tcc-180-c'||chave,veiculo_id,motorista_id,motorista,nome,placa,km,revisao,
          CASE WHEN defeito=0 THEN 'Liberado' ELSE 'Avaria' END,momento,motivo,itens,'{}',momento);
      estado := CASE WHEN defeito=0 THEN 'Liberado' WHEN d=179 AND n<=2 THEN 'Manutenção' ELSE 'Avaria' END;
      UPDATE public.veiculos SET status=estado,ultimo_km=km,proxima_revisao_km=revisao,
        ultima_avaria=CASE WHEN defeito<>0 THEN motivo ELSE NULL END,ultimo_motorista=motorista,
        ultima_atualizacao=momento WHERE id=veiculo_id;
      em_rota := d=179 AND n IN (5,6);
      -- Nos dias de avaria/manutenção não existe saída. Dois caminhões estão em rota no último dia.
      IF defeito=0 AND (d<179 OR em_rota) THEN
        distancia := 90 + ((d*31+n*47)%350);
        destino := destinos[1+(d+n)%6] || '';
        viagem_id := 'demo-tcc-180-t'||chave;
        INSERT INTO public.viagens(id,veiculo_id,motorista_id,motorista,nome_veiculo,placa,destino,km_inicial,km_final,saida_em,retorno_em,status,criado_em)
          VALUES(viagem_id,veiculo_id,motorista_id,motorista,nome,placa,destino,km,CASE WHEN em_rota THEN NULL ELSE km+distancia END,
            momento+interval '1 hour',CASE WHEN em_rota THEN NULL ELSE momento+interval '12 hours' END,
            CASE WHEN em_rota THEN 'Em Andamento' ELSE 'Finalizada' END,momento+interval '1 hour');
        IF NOT em_rota THEN
          litros := round(distancia::numeric/(2.5+n::numeric/10),3);
          valor := round(litros*(6.05+(d%7)::numeric/20),2);
          INSERT INTO public.abastecimentos(id,veiculo_id,viagem_id,motorista_id,motorista,nome_veiculo,placa,litros,valor_total,registrado_em,km,posto,criado_em)
            VALUES('demo-tcc-180-a'||chave,veiculo_id,viagem_id,motorista_id,motorista,nome,placa,litros,valor,
              momento+interval '6 hours',km+distancia/2,'Posto Estrada '||1+d%4||'',momento+interval '6 hours');
          INSERT INTO public.pedagios(id,veiculo_id,viagem_id,motorista_id,motorista,nome_veiculo,placa,valor,registrado_em,local,criado_em)
            VALUES('demo-tcc-180-p'||chave,veiculo_id,viagem_id,motorista_id,motorista,nome,placa,18.90+(d+n)%6*12.40,
              momento+interval '4 hours','Praça '||1+(d+n)%5||'',momento+interval '4 hours');
          km := km+distancia;
        END IF;
        UPDATE public.veiculos SET status=CASE WHEN em_rota THEN 'Em Trânsito' ELSE 'Liberado' END,
          ultimo_km=km,ultima_atualizacao=CASE WHEN em_rota THEN momento+interval '1 hour' ELSE momento+interval '12 hours' END,
          motorista_atual_id=CASE WHEN em_rota THEN motorista_id ELSE NULL END,
          motorista_atual=CASE WHEN em_rota THEN motorista ELSE NULL END,
          destino_atual=CASE WHEN em_rota THEN destino ELSE NULL END,
          hora_saida_atual=CASE WHEN em_rota THEN momento+interval '1 hour' ELSE NULL END WHERE id=veiculo_id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
COMMIT;
SELECT 'veiculos' AS tabela,count(*) AS registros FROM public.veiculos WHERE id LIKE 'demo-tcc-180-v%'
UNION ALL SELECT 'motoristas',count(*) FROM public.usuarios WHERE email LIKE '%@frota.invalid'
UNION ALL SELECT 'checklists',count(*) FROM public.checklists WHERE id LIKE 'demo-tcc-180-c%'
UNION ALL SELECT 'viagens',count(*) FROM public.viagens WHERE id LIKE 'demo-tcc-180-t%'
UNION ALL SELECT 'abastecimentos',count(*) FROM public.abastecimentos WHERE id LIKE 'demo-tcc-180-a%'
UNION ALL SELECT 'pedagios',count(*) FROM public.pedagios WHERE id LIKE 'demo-tcc-180-p%';
