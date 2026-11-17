-- Remove DEMO do e-mail exibido no painel, sem alterar credenciais de login.
BEGIN;
UPDATE public.usuarios SET email=replace(email,'@demo-tcc.invalid','@frota.invalid')
WHERE id::text LIKE 'd1800000-0000-4000-8000-%' AND email LIKE '%@demo-tcc.invalid';
COMMIT;
WITH registros AS (
 SELECT 'veiculos' tabela,to_jsonb(v)-ARRAY['id','foto'] dados FROM public.veiculos v
 UNION ALL SELECT 'usuarios',to_jsonb(u)-'id' FROM public.usuarios u
 UNION ALL SELECT 'viagens',to_jsonb(t)-ARRAY['id','veiculo_id','motorista_id'] FROM public.viagens t
 UNION ALL SELECT 'checklists',to_jsonb(c)-ARRAY['id','veiculo_id','motorista_id','fotos','assinatura'] FROM public.checklists c
 UNION ALL SELECT 'abastecimentos',to_jsonb(a)-ARRAY['id','veiculo_id','motorista_id','viagem_id'] FROM public.abastecimentos a
 UNION ALL SELECT 'pedagios',to_jsonb(p)-ARRAY['id','veiculo_id','motorista_id','viagem_id'] FROM public.pedagios p
)
SELECT tabela,count(*) FILTER(WHERE dados::text ILIKE '%demo%') AS marcacoes_restantes
FROM registros GROUP BY tabela ORDER BY tabela;
