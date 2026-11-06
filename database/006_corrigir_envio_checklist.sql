-- Instala a RPC usada pelo APK atual. Pode ser repetido sem apagar dados.
BEGIN;
CREATE OR REPLACE FUNCTION public.frota_salvar_checklist(p_dados jsonb)
RETURNS public.checklists
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario public.usuarios%ROWTYPE;
  veiculo public.veiculos%ROWTYPE;
  registro public.checklists%ROWTYPE;
  km_atual bigint;
  revisao bigint;
  situacao text;
  avarias text;
BEGIN
  SELECT * INTO usuario FROM public.usuarios WHERE id = auth.uid() AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta inativa ou sessão expirada. Entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Checklist inválido.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_dados->>'km', '') !~ '^[0-9]{1,15}$' THEN
    RAISE EXCEPTION 'Informe um KM válido.' USING ERRCODE = '22023';
  END IF;
  km_atual := (p_dados->>'km')::bigint;
  IF COALESCE(p_dados->>'proximaRevisaoKm', '') NOT IN ('', '-') THEN
    IF (p_dados->>'proximaRevisaoKm') !~ '^[0-9]{1,15}$' THEN
      RAISE EXCEPTION 'Informe um KM de revisão válido.' USING ERRCODE = '22023';
    END IF;
    revisao := (p_dados->>'proximaRevisaoKm')::bigint;
  END IF;
  IF jsonb_typeof(p_dados->'itens') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Confira os 16 itens do checklist.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_dados->'itens') <> 16 THEN
    RAISE EXCEPTION 'Confira os 16 itens do checklist.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_dados->'itens') i
    WHERE jsonb_typeof(i) IS DISTINCT FROM 'object'
      OR COALESCE(btrim(i->>'label'), '') = ''
      OR COALESCE(btrim(i->>'valor'), '') = ''
      OR jsonb_typeof(i->'ok') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Existem avaliações inválidas no checklist.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_dados->>'assinatura', '') !~ '^data:image/png;base64,[A-Za-z0-9+/=\s]+$' THEN
    RAISE EXCEPTION 'Registre sua assinatura antes de enviar.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_dados->'fotos') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Fotos inválidas.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO veiculo FROM public.veiculos
    WHERE id = p_dados->>'veiculoId' AND ativo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo indisponível.' USING ERRCODE = '22023';
  END IF;
  IF veiculo.motorista_atual_id IS NOT NULL AND veiculo.motorista_atual_id <> usuario.id
     AND usuario.perfil <> 'administrador' THEN
    RAISE EXCEPTION 'Veículo em uso por outro motorista.' USING ERRCODE = '42501';
  END IF;
  IF km_atual < COALESCE(veiculo.ultimo_km, 0) THEN
    RAISE EXCEPTION 'O KM informado é inferior ao último registrado.' USING ERRCODE = '22023';
  END IF;
  -- Calcula avarias pelas avaliações; ignora status e identidade enviados pelo cliente.
  SELECT string_agg(i->>'label', ', ') INTO avarias
    FROM jsonb_array_elements(p_dados->'itens') i
    WHERE i->>'ok' = 'false' OR i->>'valor' IN ('RUIM', 'DEFEITO', 'NAO')
       OR i->>'valor' LIKE 'QUEIMADO%';
  situacao := CASE WHEN avarias IS NULL THEN 'Liberado' ELSE 'Avaria' END;
  INSERT INTO public.checklists(veiculo_id, motorista_id, motorista, nome_veiculo, placa,
    km, proxima_revisao_km, status, realizado_em, obs_geral, itens, fotos, assinatura)
  VALUES (veiculo.id, usuario.id, usuario.nome, veiculo.nome, veiculo.placa,
    km_atual, revisao, situacao, now(), p_dados->>'obsGeral',
    p_dados->'itens', p_dados->'fotos', p_dados->>'assinatura') RETURNING * INTO registro;
  UPDATE public.veiculos SET ultimo_km = km_atual,
    proxima_revisao_km = COALESCE(revisao, proxima_revisao_km),
    ultimo_motorista = usuario.nome, ultima_atualizacao = now(),
    ultima_avaria = COALESCE(avarias, ultima_avaria),
    status = CASE WHEN status IN ('Em Trânsito', 'Manutenção') THEN status
      WHEN status = 'Avaria' OR situacao = 'Avaria' THEN 'Avaria' ELSE 'Liberado' END
    WHERE id = veiculo.id;
  RETURN registro;
END;
$$;
REVOKE ALL ON FUNCTION public.frota_salvar_checklist(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frota_salvar_checklist(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
