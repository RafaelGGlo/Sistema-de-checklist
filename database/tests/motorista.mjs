import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
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
  for (const file of ['002_supabase.sql','006_corrigir_envio_checklist.sql','007_lancamentos_painel.sql','008_operacoes_motorista.sql','008_operacoes_motorista.sql']) {
    await db.exec(await readFile(new URL(`../${file}`,import.meta.url),'utf8'));
  }
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const inactive = '33333333-3333-4333-8333-333333333333';
  for (const [id,nome] of [[a,'Motorista A'],[b,'Motorista B'],[inactive,'Inativo']]) {
    await db.query('INSERT INTO auth.users VALUES($1,$2,$3)',[id,`${id}@teste.local`,{nome}]);
  }
  await db.query('UPDATE public.usuarios SET ativo=true WHERE id <> $1',[inactive]);
  await db.exec("INSERT INTO public.veiculos(id,nome,placa,tipo,ultimo_km) VALUES('v1','Van','ABC1234','Van',100),('v2','Truck','DEF1234','Truck',20),('v3','Sem KM','GHI1234','Van',NULL)");
  const asUser = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
    await db.exec('SET ROLE authenticated');
  };
  await asUser(inactive);
  await assert.rejects(db.query("SELECT public.frota_iniciar_viagem('v1')"), /inativa/);
  await asUser(a);
  await assert.rejects(db.query("SELECT public.frota_iniciar_viagem('v3')"), /checklist/);
  const trip = (await db.query("SELECT (public.frota_iniciar_viagem('v1')).id")).rows[0].id;
  assert.equal((await db.query("SELECT motorista_atual_id FROM public.veiculos WHERE id='v1'")).rows[0].motorista_atual_id,a);
  await assert.rejects(db.query("SELECT public.frota_iniciar_viagem('v2')"), /andamento/);
  await asUser(b);
  assert.equal((await db.query('SELECT * FROM public.viagens')).rows.length,0);
  await assert.rejects(db.query('SELECT public.frota_finalizar_viagem($1,150)',[trip]), /autorizada/);
  await assert.rejects(db.query("SELECT public.frota_registrar_despesa($1,'pedagio',10)",[trip]), /autorizada/);
  await assert.rejects(db.query("SELECT public.frota_iniciar_viagem('v1')"), /indisponível/);
  await asUser(a);
  await assert.rejects(db.query('SELECT public.frota_finalizar_viagem($1,99)',[trip]), /inferior/);
  await assert.rejects(db.query("SELECT public.frota_registrar_despesa($1,'abastecimento',100,0)",[trip]), /positiva/);
  await assert.rejects(db.query("SELECT public.frota_registrar_despesa($1,'pedagio',-1)",[trip]), /positivo/);
  await assert.rejects(db.query("SELECT public.frota_registrar_despesa($1,'outro',10)",[trip]), /inválido/);
  await db.query("SELECT public.frota_registrar_despesa($1,'abastecimento',125.50,20.5)",[trip]);
  await db.query("SELECT public.frota_registrar_despesa($1,'pedagio',12.50)",[trip]);
  assert.equal((await db.query('SELECT motorista FROM public.abastecimentos')).rows[0].motorista,'Motorista A');
  await db.query('SELECT public.frota_salvar_checklist($1)',[{veiculoId:'v1',km:'110',assinatura:'data:image/png;base64,AA==',fotos:{},
    itens:Array.from({length:16},(_,i)=>({label:`Item ${i}`,valor:i===0?'RUIM':'BOM',ok:i!==0}))}]);
  await assert.rejects(db.query('SELECT public.frota_finalizar_viagem($1,105)',[trip]), /inferior/);
  await db.query('SELECT public.frota_finalizar_viagem($1,150)',[trip]);
  const vehicle = (await db.query("SELECT * FROM public.veiculos WHERE id='v1'")).rows[0];
  assert.equal(vehicle.status,'Avaria'); assert.equal(vehicle.ultimo_km,150); assert.equal(vehicle.motorista_atual_id,null);
  assert.equal((await db.query('SELECT km_percorrido FROM public.viagens')).rows[0].km_percorrido,50);
  await assert.rejects(db.query('SELECT public.frota_finalizar_viagem($1,160)',[trip]), /finalizada/);
  await assert.rejects(db.query("SELECT public.frota_registrar_despesa($1,'pedagio',10)",[trip]), /finalizada/);
  // Uma avaria reparada antes de nova saída não volta a bloquear o veículo no retorno.
  await db.exec('RESET ROLE');
  await db.exec("UPDATE public.veiculos SET status='Liberado',ultima_avaria=NULL WHERE id='v1'");
  await asUser(a);
  const second = (await db.query("SELECT (public.frota_iniciar_viagem('v1')).id")).rows[0].id;
  await db.query('SELECT public.frota_finalizar_viagem($1,160)',[second]);
  assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Liberado');
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query("SELECT public.frota_iniciar_viagem('v2')"), /permission denied/);
  console.log('OK: operações do motorista, isolamento por conta, KM, despesas, avarias e migração repetível.');
} finally { await db.close(); }
