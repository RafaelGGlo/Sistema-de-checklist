-- Operações chamadas pelo aplicativo atual do motorista. Repetível, sem apagar dados.
BEGIN;
CREATE OR REPLACE FUNCTION public.frota_iniciar_viagem(p_veiculo_id text)
RETURNS public.viagens LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.usuarios; v public.veiculos; registro public.viagens;
BEGIN
  SELECT * INTO u FROM public.usuarios WHERE id = auth.uid() AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta inativa ou sessão expirada.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.viagens WHERE motorista_id = u.id AND status = 'Em Andamento') THEN
    RAISE EXCEPTION 'Você já possui uma viagem em andamento.';
  END IF;
  SELECT * INTO v FROM public.veiculos WHERE id = p_veiculo_id AND ativo FOR UPDATE;
  IF NOT FOUND OR v.status <> 'Liberado' OR EXISTS (SELECT 1 FROM public.viagens WHERE veiculo_id = p_veiculo_id AND status = 'Em Andamento') THEN
    RAISE EXCEPTION 'Veículo indisponível. Atualize a lista e confira as avarias no painel.';
  END IF;
  IF v.ultimo_km IS NULL THEN RAISE EXCEPTION 'Registre o KM do veículo no checklist antes de iniciar a viagem.'; END IF;
  INSERT INTO public.viagens(veiculo_id, motorista_id, motorista, nome_veiculo, placa, destino, km_inicial, saida_em)
  VALUES(v.id, u.id, u.nome, v.nome, v.placa, 'Em Rota', v.ultimo_km, now()) RETURNING * INTO registro;
  UPDATE public.veiculos SET status = 'Em Trânsito', motorista_atual_id = u.id, motorista_atual = u.nome,
    destino_atual = registro.destino, hora_saida_atual = registro.saida_em,
    ultimo_motorista = u.nome, ultima_atualizacao = now() WHERE id = v.id;
  RETURN registro;
END;
$$;

CREATE OR REPLACE FUNCTION public.frota_finalizar_viagem(p_viagem_id text, p_km_final bigint)
RETURNS public.viagens LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.usuarios; v public.veiculos; t public.viagens; c public.checklists;
BEGIN
  SELECT * INTO u FROM public.usuarios WHERE id = auth.uid() AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta inativa ou sessão expirada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.viagens WHERE id = p_viagem_id AND motorista_id = u.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada ou não autorizada.' USING ERRCODE = '42501'; END IF;
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
    ultimo_km = p_km_final, ultimo_motorista = u.nome, ultima_atualizacao = now(),
    motorista_atual_id = NULL, motorista_atual = NULL, destino_atual = NULL, hora_saida_atual = NULL WHERE id = v.id;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.frota_registrar_despesa(
  p_viagem_id text, p_tipo text, p_valor numeric, p_litros numeric DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.usuarios; t public.viagens; registro_id text;
BEGIN
  SELECT * INTO u FROM public.usuarios WHERE id = auth.uid() AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta inativa ou sessão expirada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.viagens WHERE id = p_viagem_id AND motorista_id = u.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada ou não autorizada.' USING ERRCODE = '42501'; END IF;
  IF t.status <> 'Em Andamento' THEN RAISE EXCEPTION 'A viagem já foi finalizada. Solicite o lançamento pelo painel.'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um valor positivo.'; END IF;
  IF p_tipo = 'abastecimento' THEN
    IF p_litros IS NULL OR p_litros <= 0 OR p_litros::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe uma quantidade positiva de litros.'; END IF;
    INSERT INTO public.abastecimentos(veiculo_id, motorista_id, motorista, nome_veiculo, placa, viagem_id, litros, valor_total, registrado_em)
    VALUES(t.veiculo_id, u.id, u.nome, t.nome_veiculo, t.placa, t.id, p_litros, p_valor, now()) RETURNING id INTO registro_id;
  ELSIF p_tipo = 'pedagio' THEN
    INSERT INTO public.pedagios(veiculo_id, motorista_id, motorista, nome_veiculo, placa, viagem_id, valor, registrado_em)
    VALUES(t.veiculo_id, u.id, u.nome, t.nome_veiculo, t.placa, t.id, p_valor, now()) RETURNING id INTO registro_id;
  ELSE RAISE EXCEPTION 'Tipo de despesa inválido.';
  END IF;
  RETURN registro_id;
END;
$$;
REVOKE ALL ON FUNCTION public.frota_iniciar_viagem(text), public.frota_finalizar_viagem(text,bigint),
  public.frota_registrar_despesa(text,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frota_iniciar_viagem(text), public.frota_finalizar_viagem(text,bigint),
  public.frota_registrar_despesa(text,text,numeric,numeric) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
