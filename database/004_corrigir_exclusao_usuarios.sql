-- Execute este arquivo no SQL Editor do seu Supabase.
-- Corrige os vinculos que impediam excluir contas em Authentication > Users.
-- Nao exclui contas automaticamente, nao apaga viagens/checklists/despesas.
BEGIN;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS veiculos_motorista_atual_id_fkey;
ALTER TABLE public.veiculos ADD CONSTRAINT veiculos_motorista_atual_id_fkey
  FOREIGN KEY (motorista_atual_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.viagens DROP CONSTRAINT IF EXISTS viagens_motorista_id_fkey;
ALTER TABLE public.viagens ADD CONSTRAINT viagens_motorista_id_fkey
  FOREIGN KEY (motorista_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_motorista_id_fkey;
ALTER TABLE public.checklists ADD CONSTRAINT checklists_motorista_id_fkey
  FOREIGN KEY (motorista_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.abastecimentos DROP CONSTRAINT IF EXISTS abastecimentos_motorista_id_fkey;
ALTER TABLE public.abastecimentos ADD CONSTRAINT abastecimentos_motorista_id_fkey
  FOREIGN KEY (motorista_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.pedagios DROP CONSTRAINT IF EXISTS pedagios_motorista_id_fkey;
ALTER TABLE public.pedagios ADD CONSTRAINT pedagios_motorista_id_fkey
  FOREIGN KEY (motorista_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
COMMIT;
