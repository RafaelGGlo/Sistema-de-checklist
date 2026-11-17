import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid,bucket_id text,name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS 'SELECT string_to_array($1,''/'')';`);
  for (const file of ['002_supabase.sql','006_corrigir_envio_checklist.sql','007_lancamentos_painel.sql','008_operacoes_motorista.sql','009_bloqueio_revisao.sql','009_bloqueio_revisao.sql','010_demo_tcc_180_dias.sql','010_demo_tcc_180_dias.sql']) {
    await db.exec(await readFile(new URL(`../${file}`,import.meta.url),'utf8'));
  }
  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
  assert.equal(await scalar('SELECT count(*)::int FROM public.veiculos'),8);
  assert.equal(await scalar('SELECT count(*)::int FROM public.usuarios'),8);
  assert.equal(await scalar('SELECT count(*)::int FROM public.checklists'),1440);
  assert.equal(await scalar("SELECT count(DISTINCT (realizado_em AT TIME ZONE 'America/Sao_Paulo')::date)::int FROM public.checklists"),180);
  assert.equal(await scalar("SELECT count(*)::int FROM public.viagens WHERE status='Em Andamento'"),2);
  assert.equal(await scalar("SELECT count(*)::int FROM public.veiculos WHERE status IN ('Manutenção','Avaria')"),4);
  assert.equal(await scalar('SELECT count(*)::int FROM public.viagens WHERE km_final < km_inicial'),0);
  assert.equal(await scalar(`SELECT count(*)::int FROM public.viagens t JOIN public.checklists c ON c.veiculo_id=t.veiculo_id
    AND (c.realizado_em AT TIME ZONE 'America/Sao_Paulo')::date=(t.saida_em AT TIME ZONE 'America/Sao_Paulo')::date
    WHERE c.status='Avaria' OR t.km_inicial>=c.proxima_revisao_km`),0);
  assert.equal(await scalar(`SELECT count(*)::int FROM public.abastecimentos a JOIN public.viagens t ON t.id=a.viagem_id
    WHERE a.veiculo_id<>t.veiculo_id OR a.motorista_id<>t.motorista_id OR a.km<t.km_inicial OR a.km>t.km_final`),0);
  assert.equal(await scalar(`SELECT count(*)::int FROM (SELECT km,lag(km) OVER(PARTITION BY veiculo_id ORDER BY realizado_em) anterior FROM public.checklists) c WHERE km<anterior`),0);
  const admin='11111111-1111-4111-8111-111111111111';
  await db.query("INSERT INTO auth.users VALUES($1,'admin@teste.invalid','{}')",[admin]);
  await db.query("UPDATE public.usuarios SET ativo=true,perfil='administrador' WHERE id=$1",[admin]);
  const driver='d1800000-0000-4000-8000-000000000001';
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query("SELECT public.frota_painel_iniciar_viagem('demo-tcc-180-v1',$1,'Teste',200000)",[driver]),/indisponível/);
  // Mesmo após clicar em liberar, uma revisão vencida impede saída no banco.
  await db.query("SELECT public.frota_painel_liberar_veiculo('demo-tcc-180-v1')");
  const km=await scalar("SELECT ultimo_km FROM public.veiculos WHERE id='demo-tcc-180-v1'");
  await assert.rejects(db.query("SELECT public.frota_painel_iniciar_viagem('demo-tcc-180-v1',$1,'Teste',$2)",[driver,km]),/troca de óleo\/revisão vencida/);
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[driver]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query("SELECT public.frota_iniciar_viagem('demo-tcc-180-v1')"),/troca de óleo\/revisão vencida/);
  await db.exec('RESET ROLE');
  await db.query("UPDATE public.veiculos SET proxima_revisao_km=ultimo_km+10000 WHERE id='demo-tcc-180-v1'");
  await db.exec('SET ROLE authenticated');
  const trip=(await db.query("SELECT (public.frota_iniciar_viagem('demo-tcc-180-v1')).id")).rows[0].id;
  assert.ok(trip);
  console.log('OK: 180 dias, carga repetível, 8 motoristas, 8 caminhões, 1440 inspeções, odômetros, vínculos, bloqueio no painel e motorista, saída após manutenção.');
  await db.exec('RESET ROLE');
  console.log((await db.query(`SELECT 'viagens' tabela,count(*) FROM public.viagens WHERE id LIKE 'demo-tcc-180-t%'
    UNION ALL SELECT 'abastecimentos',count(*) FROM public.abastecimentos
    UNION ALL SELECT 'pedagios',count(*) FROM public.pedagios`)).rows);
} finally { await db.close(); }
