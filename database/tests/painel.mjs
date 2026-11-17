import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid,bucket_id text,name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS 'SELECT string_to_array($1,''/'')';
  `);
  await db.exec(await readFile(new URL('../002_supabase.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../007_lancamentos_painel.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const admin = '11111111-1111-4111-8111-111111111111';
  const driver = '22222222-2222-4222-8222-222222222222';
  const inactive = '33333333-3333-4333-8333-333333333333';
  for (const [id,nome] of [[admin,'Admin'],[driver,'Motorista'],[inactive,'Inativo']]) {
    await db.query('INSERT INTO auth.users VALUES ($1,$2,$3)', [id, `${nome}@teste.local`, { nome }]);
  }
  await db.query("UPDATE public.usuarios SET ativo = id <> $1, perfil = CASE WHEN id = $2 THEN 'administrador' ELSE 'motorista' END", [inactive,admin]);
  await db.exec("INSERT INTO public.veiculos(id,nome,placa,tipo,ultimo_km) VALUES('v1','Caminhão','ABC1D23','Caminhão',100),('v2','Van','DEF1234','Van',50)");
  const asUser = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('SET ROLE authenticated');
  };
  await asUser(driver);
  await assert.rejects(db.query("SELECT public.frota_painel_iniciar_viagem('v1',$1,'Entrega',100)",[driver]), /administrador/);
  await assert.rejects(db.query("SELECT public.frota_painel_registrar_despesa('v1',$1,'pedagio',10,now())",[driver]), /administrador/);
  await assert.rejects(db.query("SELECT public.frota_painel_finalizar_viagem('qualquer',110)"), /administrador/);
  await assert.rejects(db.query("SELECT public.frota_painel_liberar_veiculo('v1')"), /administrador/);
  await asUser(admin);
  await assert.rejects(db.query("SELECT public.frota_painel_iniciar_viagem('v1',$1,'Entrega',99)",[driver]), /inferior/);
  await assert.rejects(db.query("SELECT public.frota_painel_iniciar_viagem('v1',$1,'Entrega',100)",[inactive]), /ativo/);
  const trip = (await db.query("SELECT (public.frota_painel_iniciar_viagem('v1',$1,'Entrega',100)).id",[driver])).rows[0].id;
  assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status, 'Em Trânsito');
  await assert.rejects(db.query("SELECT public.frota_painel_iniciar_viagem('v2',$1,'Entrega',100)",[driver]), /andamento/);
  await assert.rejects(db.query("SELECT public.frota_painel_liberar_veiculo('v1')"), /retorno/);
  await assert.rejects(db.query('SELECT public.frota_painel_finalizar_viagem($1,99)',[trip]), /inferior/);
  await assert.rejects(db.query("SELECT public.frota_painel_registrar_despesa('v1',$1,'abastecimento',0,now(),10)",[driver]), /positivo/);
  await assert.rejects(db.query("SELECT public.frota_painel_registrar_despesa('v1',$1,'abastecimento',100,now(),0)",[driver]), /litros/);
  await assert.rejects(db.query("SELECT public.frota_painel_registrar_despesa('v2',$1,'pedagio',10,now(),NULL,NULL,NULL,$2)",[driver,trip]), /não pertence/);
  await db.query("SELECT public.frota_painel_registrar_despesa('v1',$1,'abastecimento',150.50,now(),25.125,110,'Posto Teste',$2)",[driver,trip]);
  await db.query("SELECT public.frota_painel_registrar_despesa('v1',$1,'pedagio',12.50,now(),NULL,NULL,'Praça Teste')",[driver]);
  assert.equal((await db.query('SELECT posto FROM public.abastecimentos')).rows[0].posto, 'Posto Teste');
  assert.equal((await db.query('SELECT local FROM public.pedagios')).rows[0].local, 'Praça Teste');
  await db.query('SELECT public.frota_painel_finalizar_viagem($1,130)',[trip]);
  assert.equal((await db.query('SELECT km_percorrido FROM public.viagens')).rows[0].km_percorrido,30);
  assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Liberado');
  await assert.rejects(db.query('SELECT public.frota_painel_finalizar_viagem($1,140)',[trip]), /finalizada/);
  const second = (await db.query("SELECT (public.frota_painel_iniciar_viagem('v1',$1,'Outra entrega',130)).id",[driver])).rows[0].id;
  await db.query("INSERT INTO public.checklists(veiculo_id,motorista,nome_veiculo,placa,km,status,realizado_em) VALUES('v1','Motorista','Caminhão','ABC1D23',140,'Avaria',now())");
  await db.query('SELECT public.frota_painel_finalizar_viagem($1,150)',[second]);
  assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Avaria');
  await db.query("SELECT public.frota_painel_liberar_veiculo('v1')");
  const third = (await db.query("SELECT (public.frota_painel_iniciar_viagem('v1',$1,'Após reparo',150)).id",[driver])).rows[0].id;
  await db.query('SELECT public.frota_painel_finalizar_viagem($1,160)',[third]);
  assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Liberado');
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query("SELECT public.frota_painel_liberar_veiculo('v1')"), /permission denied/);
  console.log('OK: migração repetível, permissões, saída/retorno, KM, avarias e despesas do painel.');
} finally { await db.close(); }
