-- Diagnóstico somente leitura. Não instala nem altera objetos.
-- Execute no SQL Editor do projeto conectado ao painel antes do deploy.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
ORDER BY ordinal_position;

SELECT c.relrowsecurity AS rls_ativo
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'usuarios';

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios';

SELECT t.tgname, pg_get_triggerdef(t.oid) AS definicao,
  pg_get_functiondef(t.tgfoid) AS funcao
FROM pg_trigger t
WHERE t.tgrelid = 'auth.users'::regclass AND t.tgname = 'frota_novo_usuario';

SELECT pg_get_functiondef(to_regprocedure('public.frota_admin()')) AS autorizacao_admin;

SELECT perfil, ativo, count(*) AS quantidade
FROM public.usuarios GROUP BY perfil, ativo ORDER BY perfil, ativo;
