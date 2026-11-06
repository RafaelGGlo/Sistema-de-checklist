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
  await db.exec(await readFile(new URL('../002_supabase.sql', import.meta.url), 'utf8'));
  const sql = await readFile(new URL('../006_corrigir_envio_checklist.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  const motorista = '11111111-1111-4111-8111-111111111111';
  const outro = '22222222-2222-4222-8222-222222222222';
  for (const id of [motorista, outro]) {
    await db.query('INSERT INTO auth.users VALUES ($1,$2,$3)', [id, `${id}@teste.local`, { nome: 'Motorista completo' }]);
  }
  await db.query('UPDATE public.usuarios SET ativo=true WHERE id=$1', [motorista]);
  await db.exec("INSERT INTO public.veiculos(id,nome,placa,tipo,ultimo_km) VALUES ('v1','Van real','ABC1234','Van',100)");
  const dados = { veiculoId: 'v1', km: '110', proximaRevisaoKm: '1000', motorista: 'Nome falsificado', status: 'Liberado',
    itens: Array.from({ length: 16 }, (_, i) => ({ label: `Item ${i}`, valor: 'BOM', ok: true })),
    fotos: { painel: 'data:image/jpeg;base64,AA==' }, assinatura: 'data:image/png;base64,AA==', obsGeral: 'Teste' };
  const enviar = valor => db.query('SELECT (public.frota_salvar_checklist($1)).*', [valor]);
  await assert.rejects(enviar(dados), /sessão expirada/);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [outro]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(enviar(dados), /inativa/);
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [motorista]);
  await db.exec('SET ROLE authenticated');
  for (const [patch, erro] of [[{ km: '99' }, /inferior/], [{ assinatura: '' }, /assinatura/],
    [{ itens: [] }, /16 itens/], [{ itens: {} }, /16 itens/], [{ km: 'abc' }, /KM válido/],
    [{ fotos: [] }, /Fotos inválidas/], [{ veiculoId: 'ausente' }, /indisponível/]]) {
    await assert.rejects(enviar({ ...dados, ...patch }), erro);
  }
  // Usar SELECT funcao, sem expansão do composto: PostgreSQL pode executar uma função
  // volátil repetidamente quando (funcao()).* aparece diretamente na projeção.
  const result = await db.query('SELECT public.frota_salvar_checklist($1) AS registro', [dados]);
  assert.ok(result.rows[0].registro);
  const rows = (await db.query('SELECT * FROM public.checklists')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].motorista, 'Motorista completo');
  assert.equal(rows[0].nome_veiculo, 'Van real');
  assert.equal(rows[0].assinatura, dados.assinatura);
  assert.equal(rows[0].fotos.painel, dados.fotos.painel);
  assert.equal((await db.query("SELECT ultimo_km FROM public.veiculos WHERE id='v1'")).rows[0].ultimo_km, 110);
  await db.exec('RESET ROLE');
  await db.query("UPDATE public.veiculos SET status='Em Trânsito',motorista_atual_id=$1 WHERE id='v1'", [outro]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(enviar(dados), /outro motorista/);
  await db.exec('RESET ROLE');
  await db.query("UPDATE public.veiculos SET motorista_atual_id=$1 WHERE id='v1'", [motorista]);
  await db.exec('SET ROLE authenticated');
  const avaria = structuredClone(dados); avaria.itens[0].valor = 'RUIM'; // status/ok do cliente não escondem avaria.
  await db.query('SELECT public.frota_salvar_checklist($1)', [avaria]);
  assert.equal((await db.query("SELECT status FROM public.veiculos WHERE id='v1'")).rows[0].status, 'Em Trânsito');
  assert.equal((await db.query("SELECT status FROM public.checklists WHERE status='Avaria'")).rows.length, 1);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(enviar(dados), /permission denied/);
  console.log('PASS: migração repetível, identidade validada, permissões, validação de dados, fotos/assinatura, atualização atômica de KM e avarias em trânsito.');
} finally { await db.close(); }
