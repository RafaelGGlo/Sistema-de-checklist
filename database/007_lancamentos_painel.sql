-- Ações do painel administrativo. Repetível; preserva o histórico existente.
BEGIN;
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS km bigint CHECK (km >= 0);
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS posto text;
ALTER TABLE public.pedagios ADD COLUMN IF NOT EXISTS local text;

CREATE OR REPLACE FUNCTION public.frota_painel_iniciar_viagem(
  p_veiculo_id text, p_motorista_id uuid, p_destino text, p_km_inicial bigint
) RETURNS public.viagens LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.veiculos; m public.usuarios; registro public.viagens;
BEGIN
  IF NOT public.frota_admin() THEN RAISE EXCEPTION 'Acesso exclusivo de administrador.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM public.usuarios WHERE id = p_motorista_id AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecione um motorista ativo.'; END IF;
  SELECT * INTO v FROM public.veiculos WHERE id = p_veiculo_id AND ativo FOR UPDATE;
  IF NOT FOUND OR v.status <> 'Liberado' THEN RAISE EXCEPTION 'Veículo indisponível. Libere as avarias antes de registrar a saída.'; END IF;
  IF EXISTS (SELECT 1 FROM public.viagens WHERE status = 'Em Andamento' AND (veiculo_id = v.id OR motorista_id = m.id)) THEN
    RAISE EXCEPTION 'Veículo ou motorista já possui viagem em andamento.';
  END IF;
  IF p_km_inicial IS NULL OR p_km_inicial < COALESCE(v.ultimo_km, 0) THEN RAISE EXCEPTION 'KM inicial inferior ao último registrado.'; END IF;
  IF COALESCE(btrim(p_destino), '') = '' THEN RAISE EXCEPTION 'Informe o destino.'; END IF;
  INSERT INTO public.viagens(veiculo_id, motorista_id, motorista, nome_veiculo, placa, destino, km_inicial, saida_em)
  VALUES(v.id, m.id, m.nome, v.nome, v.placa, btrim(p_destino), p_km_inicial, now()) RETURNING * INTO registro;
  UPDATE public.veiculos SET status = 'Em Trânsito', motorista_atual_id = m.id, motorista_atual = m.nome,
    destino_atual = btrim(p_destino), hora_saida_atual = registro.saida_em,
    ultimo_km = p_km_inicial, ultimo_motorista = m.nome, ultima_atualizacao = now() WHERE id = v.id;
  RETURN registro;
END;
$$;

CREATE OR REPLACE FUNCTION public.frota_painel_finalizar_viagem(p_viagem_id text, p_km_final bigint)
RETURNS public.viagens LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.veiculos; t public.viagens; c public.checklists;
BEGIN
  IF NOT public.frota_admin() THEN RAISE EXCEPTION 'Acesso exclusivo de administrador.' USING ERRCODE = '42501'; END IF;
  -- Mesma ordem de bloqueio do cadastro: motorista, veículo, viagem.
  SELECT * INTO t FROM public.viagens WHERE id = p_viagem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada.'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id = t.motorista_id FOR UPDATE;
  SELECT * INTO v FROM public.veiculos WHERE id = t.veiculo_id FOR UPDATE;
  SELECT * INTO t FROM public.viagens WHERE id = p_viagem_id FOR UPDATE;
  IF t.status <> 'Em Andamento' THEN RAISE EXCEPTION 'Esta viagem já foi finalizada.'; END IF;
  IF p_km_final IS NULL OR p_km_final < greatest(COALESCE(t.km_inicial, 0), COALESCE(v.ultimo_km, 0)) THEN
    RAISE EXCEPTION 'KM final inferior ao último registrado.';
  END IF;
  SELECT * INTO c FROM public.checklists WHERE veiculo_id = v.id ORDER BY realizado_em DESC LIMIT 1;
  UPDATE public.viagens SET km_final = p_km_final, retorno_em = now(), status = 'Finalizada' WHERE id = t.id RETURNING * INTO t;
  UPDATE public.veiculos SET status = CASE WHEN v.status = 'Manutenção' THEN 'Manutenção'
    WHEN v.status = 'Avaria' OR (c.status = 'Avaria' AND c.realizado_em >= t.saida_em) THEN 'Avaria' ELSE 'Liberado' END,
    ultimo_km = p_km_final, ultimo_motorista = t.motorista, ultima_atualizacao = now(),
    motorista_atual_id = NULL, motorista_atual = NULL, destino_atual = NULL, hora_saida_atual = NULL WHERE id = v.id;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.frota_painel_registrar_despesa(
  p_veiculo_id text, p_motorista_id uuid, p_tipo text, p_valor numeric,
  p_registrado_em timestamptz, p_litros numeric DEFAULT NULL, p_km bigint DEFAULT NULL,
  p_local text DEFAULT NULL, p_viagem_id text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.veiculos; m public.usuarios; registro_id text;
BEGIN
  IF NOT public.frota_admin() THEN RAISE EXCEPTION 'Acesso exclusivo de administrador.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.veiculos WHERE id = p_veiculo_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecione um veículo ativo.'; END IF;
  SELECT * INTO m FROM public.usuarios WHERE id = p_motorista_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecione um motorista ativo.'; END IF;
  IF p_viagem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.viagens WHERE id = p_viagem_id AND veiculo_id = v.id AND motorista_id = m.id) THEN
    RAISE EXCEPTION 'A viagem não pertence ao veículo e motorista selecionados.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um valor positivo.'; END IF;
  IF p_registrado_em IS NULL OR NOT isfinite(p_registrado_em) THEN RAISE EXCEPTION 'Informe a data do lançamento.'; END IF;
  IF p_km < 0 THEN RAISE EXCEPTION 'KM inválido.'; END IF;
  IF p_tipo = 'abastecimento' THEN
    IF p_litros IS NULL OR p_litros <= 0 OR p_litros::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe os litros abastecidos.'; END IF;
    INSERT INTO public.abastecimentos(veiculo_id, motorista_id, motorista, nome_veiculo, placa, viagem_id, litros, valor_total, registrado_em, km, posto)
    VALUES(v.id, m.id, m.nome, v.nome, v.placa, p_viagem_id, p_litros, p_valor, p_registrado_em, p_km, nullif(btrim(p_local), '')) RETURNING id INTO registro_id;
  ELSIF p_tipo = 'pedagio' THEN
    INSERT INTO public.pedagios(veiculo_id, motorista_id, motorista, nome_veiculo, placa, viagem_id, valor, registrado_em, local)
    VALUES(v.id, m.id, m.nome, v.nome, v.placa, p_viagem_id, p_valor, p_registrado_em, nullif(btrim(p_local), '')) RETURNING id INTO registro_id;
  ELSE RAISE EXCEPTION 'Tipo de despesa inválido.';
  END IF;
  RETURN registro_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.frota_painel_liberar_veiculo(p_veiculo_id text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.veiculos;
BEGIN
  IF NOT public.frota_admin() THEN RAISE EXCEPTION 'Acesso exclusivo de administrador.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.veiculos WHERE id = p_veiculo_id AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo não encontrado.'; END IF;
  IF v.status = 'Em Trânsito' OR EXISTS (SELECT 1 FROM public.viagens WHERE veiculo_id = v.id AND status = 'Em Andamento') THEN
    RAISE EXCEPTION 'Registre o retorno da viagem com o KM final antes de liberar o veículo.';
  END IF;
  UPDATE public.veiculos SET status = 'Liberado', ultima_avaria = NULL, ultima_atualizacao = now() WHERE id = v.id;
END;
$$;

REVOKE ALL ON FUNCTION public.frota_painel_liberar_veiculo(text), public.frota_painel_iniciar_viagem(text,uuid,text,bigint),
  public.frota_painel_finalizar_viagem(text,bigint),
  public.frota_painel_registrar_despesa(text,uuid,text,numeric,timestamptz,numeric,bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frota_painel_liberar_veiculo(text), public.frota_painel_iniciar_viagem(text,uuid,text,bigint),
  public.frota_painel_finalizar_viagem(text,bigint),
  public.frota_painel_registrar_despesa(text,uuid,text,numeric,timestamptz,numeric,bigint,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
