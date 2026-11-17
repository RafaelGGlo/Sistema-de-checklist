-- Remove a marcação visível dos registros fictícios, mantendo IDs e vínculos.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.limpar_marcacao_tcc(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT btrim(regexp_replace($1, '\[DEMO TCC( [0-9]+)?\]', '', 'g'));
$$;
UPDATE public.veiculos SET nome=pg_temp.limpar_marcacao_tcc(nome),
  motorista_atual=pg_temp.limpar_marcacao_tcc(motorista_atual),
  destino_atual=pg_temp.limpar_marcacao_tcc(destino_atual),
  ultimo_motorista=pg_temp.limpar_marcacao_tcc(ultimo_motorista),
  ultima_avaria=pg_temp.limpar_marcacao_tcc(ultima_avaria)
WHERE id LIKE 'demo-tcc-180-v%';
UPDATE public.usuarios SET nome=pg_temp.limpar_marcacao_tcc(nome)
WHERE email LIKE '%@demo-tcc.invalid';
UPDATE auth.users SET raw_user_meta_data=jsonb_set(raw_user_meta_data,'{nome}',to_jsonb(pg_temp.limpar_marcacao_tcc(raw_user_meta_data->>'nome')))
WHERE email LIKE '%@demo-tcc.invalid' AND raw_user_meta_data ? 'nome';
UPDATE public.viagens SET nome_veiculo=pg_temp.limpar_marcacao_tcc(nome_veiculo),
  motorista=pg_temp.limpar_marcacao_tcc(motorista),destino=pg_temp.limpar_marcacao_tcc(destino)
WHERE veiculo_id LIKE 'demo-tcc-180-v%';
UPDATE public.checklists SET nome_veiculo=pg_temp.limpar_marcacao_tcc(nome_veiculo),
  motorista=pg_temp.limpar_marcacao_tcc(motorista),obs_geral=pg_temp.limpar_marcacao_tcc(obs_geral),
  itens=replace(itens::text,'[DEMO TCC] ','')::jsonb
WHERE veiculo_id LIKE 'demo-tcc-180-v%';
UPDATE public.abastecimentos SET nome_veiculo=pg_temp.limpar_marcacao_tcc(nome_veiculo),
  motorista=pg_temp.limpar_marcacao_tcc(motorista),posto=pg_temp.limpar_marcacao_tcc(posto)
WHERE veiculo_id LIKE 'demo-tcc-180-v%';
UPDATE public.pedagios SET nome_veiculo=pg_temp.limpar_marcacao_tcc(nome_veiculo),
  motorista=pg_temp.limpar_marcacao_tcc(motorista),local=pg_temp.limpar_marcacao_tcc(local)
WHERE veiculo_id LIKE 'demo-tcc-180-v%';
COMMIT;
SELECT nome,placa,motorista_atual,destino_atual FROM public.veiculos WHERE id LIKE 'demo-tcc-180-v%' ORDER BY placa;
