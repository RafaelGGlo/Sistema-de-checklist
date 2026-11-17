// Verifica a integração de perfis com o SQL existente, sem alterar o banco remoto.
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
  const admin = '11111111-1111-4111-8111-111111111111';
  const motorista = '22222222-2222-4222-8222-222222222222';
  for (const [id, nome] of [[admin, 'Admin'], [motorista, 'Motorista']]) {
    await db.query('INSERT INTO auth.users VALUES ($1,$2,$3)', [id, `${nome}@teste.local`, { nome, perfil: 'administrador', ativo: true }]);
  }
  const perfil = (await db.query('SELECT * FROM public.usuarios WHERE id=$1', [motorista])).rows[0];
  assert.equal(perfil.nome, 'Motorista');
  assert.equal(perfil.perfil, 'motorista');
  assert.equal(perfil.ativo, false); // Metadata enviada ao Auth não concede acesso.
  await db.query("UPDATE public.usuarios SET perfil='administrador',ativo=true WHERE id=$1", [admin]);
  const asUser = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('SET ROLE authenticated');
  };
  await asUser(admin);
  assert.equal((await db.query('SELECT id,nome,email,perfil,ativo,criado_em FROM public.usuarios')).rows.length, 2);
  const ativado = (await db.query("UPDATE public.usuarios SET nome='Nome atualizado',perfil='motorista',ativo=true WHERE id=$1 RETURNING *", [motorista])).rows[0];
  assert.equal(ativado.ativo, true);
  assert.equal(ativado.nome, 'Nome atualizado');
  await asUser(motorista);
  assert.equal((await db.query('SELECT * FROM public.usuarios')).rows.length, 1);
  assert.equal((await db.query("UPDATE public.usuarios SET perfil='administrador' WHERE id=$1 RETURNING id", [motorista])).rows.length, 0);
  await asUser(admin);
  await db.query('UPDATE public.usuarios SET ativo=false WHERE id=$1', [motorista]);
  await asUser(motorista);
  assert.equal((await db.query('SELECT public.frota_ativo() AS ativo')).rows[0].ativo, false);
  assert.equal((await db.query('SELECT public.frota_admin() AS admin')).rows[0].admin, false);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM public.usuarios'), /permission denied/);
  console.log('PASS: colunas existentes, trigger, perfil padrão, listagem e edição administrativa, isolamento de motorista, desativação e bloqueio anônimo.');
} finally { await db.close(); }
