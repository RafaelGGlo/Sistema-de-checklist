import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { janelaPeriodo, resumirDashboard } from '../../dashboard-frota/src/lib/dashboardModelo.mjs';
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
  for (const file of ['002_supabase.sql', '006_corrigir_envio_checklist.sql', '007_lancamentos_painel.sql', '008_operacoes_motorista.sql', '009_bloqueio_revisao.sql', '013_apresentacao_tres_veiculos.sql']) {
    await db.exec(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
  }
  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
  const rows = async sql => (await db.query(sql)).rows;
  const atuais = await rows('SELECT * FROM public.veiculos ORDER BY id');
  const checklistsAtuais = await rows('SELECT * FROM public.checklists ORDER BY id');
  const viagemAtual = await rows('SELECT * FROM public.viagens ORDER BY id');
  const carga = await readFile(new URL('../014_historico_tres_veiculos.sql', import.meta.url), 'utf8');
  for (let rodada = 0; rodada < 2; rodada++) {
    await db.exec(carga);
    assert.deepEqual(await rows('SELECT * FROM public.veiculos ORDER BY id'), atuais);
    assert.deepEqual(await rows("SELECT * FROM public.checklists WHERE id LIKE 'apresentacao-%' ORDER BY id"), checklistsAtuais);
    assert.deepEqual(await rows("SELECT * FROM public.viagens WHERE id LIKE 'apresentacao-%' ORDER BY id"), viagemAtual);
    assert.equal(await scalar('SELECT count(*)::int FROM public.usuarios'), 3);
    assert.equal(await scalar('SELECT count(*)::int FROM public.checklists'), 540);
    assert.equal(await scalar("SELECT count(DISTINCT (realizado_em AT TIME ZONE 'America/Sao_Paulo')::date)::int FROM public.checklists"), 180);
    const viagens = await scalar("SELECT count(*)::int FROM public.viagens WHERE status='Finalizada'");
    assert.ok(viagens > 400);
    assert.equal(await scalar('SELECT count(*)::int FROM public.abastecimentos'), viagens);
    assert.equal(await scalar('SELECT count(*)::int FROM public.pedagios'), viagens);
    assert.equal(await scalar(`SELECT count(*)::int FROM (SELECT km,lag(km) OVER(PARTITION BY veiculo_id ORDER BY realizado_em) anterior FROM public.checklists) x WHERE km < anterior`), 0);
    assert.equal(await scalar(`SELECT count(*)::int FROM public.viagens t JOIN public.checklists c
      ON c.veiculo_id=t.veiculo_id AND (c.realizado_em AT TIME ZONE 'America/Sao_Paulo')::date=(t.saida_em AT TIME ZONE 'America/Sao_Paulo')::date
      WHERE c.status='Avaria' OR t.km_inicial>=c.proxima_revisao_km`), 0);
    assert.equal(await scalar(`SELECT count(*)::int FROM public.abastecimentos a JOIN public.viagens t ON t.id=a.viagem_id
      WHERE a.veiculo_id<>t.veiculo_id OR a.motorista_id<>t.motorista_id OR a.km<t.km_inicial OR a.km>t.km_final OR a.registrado_em<t.saida_em OR a.registrado_em>t.retorno_em`), 0);
    assert.equal(await scalar("SELECT count(*)::int FROM public.checklists WHERE assinatura IS NOT NULL OR fotos <> '{}'::jsonb"), 0);
    for (const dias of [7, 15, 30, 90, 180]) {
      const periodo = janelaPeriodo(dias);
      const entre = campo => `${campo} >= '${periodo.inicioISO}' AND ${campo} < '${periodo.fimISO}'`;
      const resumo = resumirDashboard({
        veiculos: atuais,
        viagens: await rows(`SELECT * FROM public.viagens WHERE ${entre('saida_em')}`),
        retornos: await rows(`SELECT * FROM public.viagens WHERE status='Finalizada' AND ${entre('retorno_em')}`),
        checklists: await rows(`SELECT * FROM public.checklists WHERE ${entre('realizado_em')}`),
        abastecimentos: await rows(`SELECT * FROM public.abastecimentos WHERE ${entre('registrado_em')}`),
        pedagios: await rows(`SELECT * FROM public.pedagios WHERE ${entre('registrado_em')}`),
      }, periodo);
      assert.equal(resumo.total, 3);
      assert.ok(resumo.km > 0 && resumo.combustivel > 0 && resumo.pedagio > 0);
      assert.equal(resumo.custos.length, 3);
      assert.ok(resumo.serie.some(dia => dia.combustivel > 0 && dia.pedagio > 0));
    }
  }
  console.log('PASS: histórico repetível de 180 dias, 3 veículos preservados, KM crescente, vínculos válidos e relatórios preenchidos em todos os períodos.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }
