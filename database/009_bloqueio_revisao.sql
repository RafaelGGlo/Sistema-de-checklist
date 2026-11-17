-- Impede saída com revisão vencida pelo painel, aplicativo e Data API.
BEGIN;
CREATE OR REPLACE FUNCTION public.frota_validar_saida_revisao()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.veiculos;
BEGIN
  IF NEW.status <> 'Em Andamento' THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.veiculos WHERE id = NEW.veiculo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo não encontrado.'; END IF;
  IF v.status IN ('Avaria', 'Manutenção') THEN
    RAISE EXCEPTION 'Saída bloqueada: veículo com avaria ou em manutenção. Resolva a pendência e solicite liberação.';
  END IF;
  IF v.proxima_revisao_km IS NOT NULL AND greatest(v.ultimo_km, NEW.km_inicial) >= v.proxima_revisao_km THEN
    RAISE EXCEPTION 'Saída bloqueada: troca de óleo/revisão vencida em % KM. Realize a manutenção e registre a próxima revisão antes de sair do pátio.', v.proxima_revisao_km;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.frota_validar_saida_revisao() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER frota_bloquear_saida_revisao
BEFORE INSERT OR UPDATE OF status, veiculo_id, km_inicial ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.frota_validar_saida_revisao();
COMMIT;
