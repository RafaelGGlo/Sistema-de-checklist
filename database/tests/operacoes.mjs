// Requer @electric-sql/pglite; PGLITE_MODULE aceita URL file: para instalacao externa.
// PostgreSQL local em memoria, com Auth/Storage simulados, sem tocar a base online.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  GRANT USAGE ON SCHEMA auth TO authenticated,anon;
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid,bucket_id text,name text);
  CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    'SELECT string_to_array($1,''/'')';
`);
await db.exec(await readFile(new URL('../002_supabase.sql', import.meta.url), 'utf8'));
const operations = await readFile(new URL('../003_supabase_operacoes.sql', import.meta.url), 'utf8');
await db.exec(operations);
await db.exec(operations); // Migração de funções pode ser repetida.
const deletionFix = await readFile(new URL('../004_corrigir_exclusao_usuarios.sql', import.meta.url), 'utf8');
await db.exec(deletionFix);
await db.exec(deletionFix);
const admin = '11111111-1111-4111-8111-111111111111';
const driver = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const inactive = '44444444-4444-4444-8444-444444444444';
for (const [id, nome] of [[admin,'Admin'],[driver,'Motorista'],[other,'Outro'],[inactive,'Inativo']]) {
  await db.query('INSERT INTO auth.users VALUES ($1,$2,$3)', [id, `${nome}@teste.local`, { nome, perfil: 'administrador' }]);
}
assert.equal((await db.query('SELECT perfil FROM public.usuarios WHERE id=$1',[driver])).rows[0].perfil, 'motorista');
await db.query("UPDATE public.usuarios SET ativo=true WHERE id <> $1", [inactive]);
await db.query("UPDATE public.usuarios SET perfil='administrador' WHERE id=$1", [admin]);
await db.exec("INSERT INTO public.veiculos(id,nome,placa,tipo,ultimo_km) VALUES('v1','Caminhao','ABC1D23','Caminhao',100),('v2','Van','DEF1234','Van',50)");
async function asUser(id) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('SET ROLE authenticated');
}
async function rejects(sql, params, pattern) {
  await assert.rejects(db.query(sql, params), pattern);
}
await asUser(inactive);
await rejects("SELECT public.frota_iniciar_viagem('v1')", [], /inativa/);
await asUser(driver);
assert.equal((await db.query('SELECT * FROM public.veiculos')).rows.length, 2);
assert.equal((await db.query('SELECT * FROM public.usuarios')).rows.length, 1);
await db.query("UPDATE public.usuarios SET perfil='administrador' WHERE id=$1",[driver]);
assert.equal((await db.query('SELECT perfil FROM public.usuarios')).rows[0].perfil,'motorista');
assert.equal((await db.query("UPDATE public.veiculos SET status='Em Trânsito' WHERE id='v1' RETURNING id")).rows.length,0);
// Sem policy de UPDATE, nenhuma linha pode ser alterada diretamente pelo motorista.
assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Liberado');
const trip = (await db.query("SELECT (public.frota_iniciar_viagem('v1')).id")).rows[0].id;
await rejects("SELECT public.frota_iniciar_viagem('v2')", [], /viagem em andamento/);
await asUser(other);
assert.equal((await db.query('SELECT * FROM public.viagens')).rows.length,0);
await rejects('SELECT public.frota_finalizar_viagem($1,120)',[trip],/autorizada/);
await rejects("SELECT public.frota_iniciar_viagem('v1')",[],/indisponível/);
await asUser(driver);
await rejects('SELECT public.frota_finalizar_viagem($1,99)',[trip],/inferior/);
await rejects("SELECT public.frota_registrar_despesa($1,'abastecimento',-1,10)",[trip],/positivo/);
await db.query("SELECT public.frota_registrar_despesa($1,'abastecimento',125.50,20)",[trip]);
await db.query("SELECT public.frota_registrar_despesa($1,'pedagio',12.50)",[trip]);
const checklist = {veiculoId:'v1', km:'110', proximaRevisaoKm:'30000', assinatura:'data:image/png;base64,AA==',
  itens:Array.from({length:16},(_,i)=>({label:`Item ${i}`,valor:i===0?'RUIM':'BOM',ok:i!==0})), fotos:{}, obsGeral:'Teste'};
await db.query('SELECT public.frota_salvar_checklist($1)',[checklist]);
assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Em Trânsito');
await db.query('SELECT public.frota_finalizar_viagem($1,120)',[trip]);
assert.equal((await db.query('SELECT km_percorrido FROM public.viagens')).rows[0].km_percorrido,20);
assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status,'Avaria');
await rejects('SELECT public.frota_finalizar_viagem($1,121)',[trip],/finalizada/);
await rejects("SELECT public.frota_liberar_veiculo('v1')",[],/administrador/);
await asUser(admin);
await db.query("SELECT public.frota_liberar_veiculo('v1')");
await db.query("SELECT public.frota_arquivar_veiculo('v1')");
assert.equal((await db.query("SELECT ativo FROM public.veiculos WHERE id='v1'")).rows[0].ativo,false);
assert.equal((await db.query('SELECT * FROM public.viagens')).rows.length,1);
await asUser(driver);
assert.equal((await db.query('SELECT * FROM public.veiculos')).rows.length,1);
await db.exec('RESET ROLE; SET ROLE anon');
await rejects('SELECT * FROM public.veiculos',[],/permission denied/);
await rejects("SELECT public.frota_iniciar_viagem('v2')",[],/permission denied/);
await db.exec('RESET ROLE');
await db.query('DELETE FROM auth.users WHERE id=$1', [driver]);
assert.equal((await db.query('SELECT * FROM public.usuarios WHERE id=$1',[driver])).rows.length,0);
assert.equal((await db.query('SELECT * FROM public.viagens')).rows.length,1);
assert.equal((await db.query('SELECT motorista_id FROM public.viagens')).rows[0].motorista_id,null);
assert.equal((await db.query('SELECT motorista FROM public.viagens')).rows[0].motorista,'Motorista');
assert.equal((await db.query('SELECT * FROM public.checklists')).rows.length,1);
assert.equal((await db.query('SELECT * FROM public.abastecimentos')).rows.length,1);
assert.equal((await db.query('SELECT * FROM public.pedagios')).rows.length,1);
await db.close();
console.log('PASS: schema, RPCs, RLS, perfis, despesas, KM, avarias, arquivamento e exclusao preservando historico.');
