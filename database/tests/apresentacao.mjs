import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT null::uuid';
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid,bucket_id text,name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS 'SELECT string_to_array($1,''/'')';`);
  for (const file of ['002_supabase.sql', '006_corrigir_envio_checklist.sql', '007_lancamentos_painel.sql', '008_operacoes_motorista.sql', '009_bloqueio_revisao.sql', '010_demo_tcc_180_dias.sql']) {
    await db.exec(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
  }
  const admin = '11111111-1111-4111-8111-111111111111';
  await db.query("INSERT INTO auth.users VALUES($1,'admin@teste.invalid','{}')", [admin]);
  await db.query("UPDATE public.usuarios SET perfil='administrador',ativo=true WHERE id=$1", [admin]);
  const reset = await readFile(new URL('../013_apresentacao_tres_veiculos.sql', import.meta.url), 'utf8');
  for (let pass = 0; pass < 2; pass++) {
    await db.exec(reset);
    const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
    assert.equal(await scalar('SELECT count(*)::int FROM public.veiculos'), 3);
    assert.equal(await scalar("SELECT count(*)::int FROM public.usuarios WHERE perfil='motorista' AND ativo"), 3);
    assert.equal(await scalar("SELECT count(*)::int FROM public.usuarios WHERE perfil='administrador' AND ativo"), 1);
    assert.deepEqual((await db.query('SELECT status FROM public.veiculos ORDER BY id')).rows.map(v => v.status), ['Em Trânsito', 'Liberado', 'Avaria']);
    assert.equal(await scalar('SELECT count(*)::int FROM public.checklists'), 3);
    assert.equal(await scalar('SELECT count(*)::int FROM public.viagens'), 1);
    assert.equal(await scalar("SELECT count(*)::int FROM public.viagens t JOIN public.veiculos v ON v.id=t.veiculo_id WHERE t.status='Em Andamento' AND v.motorista_atual_id=t.motorista_id AND v.hora_saida_atual=t.saida_em"), 1);
    assert.equal(await scalar('SELECT count(*)::int FROM public.veiculos WHERE ultimo_km >= proxima_revisao_km'), 0);
    assert.equal(await scalar("SELECT count(*)::int FROM public.checklists WHERE status='Avaria' AND itens @> '[{\"label\":\"Farol Direito\",\"ok\":false}]'"), 1);
    await assert.rejects(db.exec("INSERT INTO public.viagens(veiculo_id,motorista,nome_veiculo,placa,saida_em) VALUES('apresentacao-v3','João','Iveco','APR3A03',now())"), /avaria/);
  }
  console.log('PASS: reinício repetível, três situações e motoristas, administrador preservado, viagem coerente e avaria bloqueada.');
} finally { await db.close(); }
