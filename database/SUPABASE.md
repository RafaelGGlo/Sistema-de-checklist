# Banco da frota no Supabase

Use somente `002_supabase.sql` em um projeto Supabase novo. O nome 002 identifica uma alternativa ao script Neon, e não uma migração que depende dele. O arquivo cria seis tabelas no schema public, índices, relacionamentos, integração com auth.users, RLS, bucket privado e publicação Realtime das tabelas operacionais.

## Instalação

1. Abra seu projeto Supabase → SQL Editor → New query.
2. Cole todo o conteúdo de `002_supabase.sql` e execute Run uma vez. Não execute sobre tabelas existentes com os mesmos nomes. O script é transacional e não apaga dados.
3. Em Authentication → Users, crie sua conta de acesso por e-mail/senha. O perfil será criado automaticamente, inicialmente inativo. Os usuários que já existiam no Auth também recebem perfil inativo.
4. No SQL Editor, substitua o e-mail abaixo pelo e-mail dessa conta e execute:

```sql
UPDATE public.usuarios
SET perfil = 'administrador', ativo = true
WHERE id = (SELECT id FROM auth.users WHERE lower(email) = lower('SEU_EMAIL_AQUI'))
RETURNING id, nome, perfil, ativo;
```

Se não retornar linha, confira o e-mail e a criação da conta no Auth. Esse comando não cria usuário ou senha. Não execute comandos administrativos no aplicativo.

5. Para cada motorista, crie uma conta no Authentication e ative seu perfil:

```sql
UPDATE public.usuarios
SET nome = 'Nome completo do motorista', ativo = true
WHERE id = (SELECT id FROM auth.users WHERE lower(email) = lower('EMAIL_DO_MOTORISTA'))
RETURNING id, nome, perfil, ativo;
```

6. Confira a criação:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('usuarios','veiculos','viagens','checklists','abastecimentos','pedagios')
ORDER BY tablename;
```

## Dados e permissões

- `usuarios`: UUID vinculado ao Supabase Auth; nome, e-mail, perfil e situação. O cliente não promove nem ativa a própria conta. O administrador ativo gerencia os perfis.
- `veiculos`: nome, placa, tipo, ano, foto, revisão, KM, motorista, destino e situação atual. Placas sem hífen ou espaços, em maiúsculas.
- `viagens`: veículo, motorista, destino, saída/retorno, KM inicial/final e distância calculada. Índices impedem duas viagens ativas por veículo ou motorista identificado.
- `checklists`: veículo, motorista, KM, revisão, status, observações, 16 itens em JSONB, seis fotos em JSONB e assinatura. Mantém a estrutura do aplicativo existente.
- `abastecimentos`: veículo, motorista, viagem opcional, litros, valor total e data.
- `pedagios`: veículo, motorista, viagem opcional, valor e data.

Administradores ativos gerenciam as tabelas. Motoristas ativos consultam os veículos ativos e somente o próprio histórico. Visitantes não acessam as tabelas. Execute agora `003_supabase_operacoes.sql` para instalar as RPCs que permitem aos motoristas iniciar/finalizar viagens, registrar checklists e lançar despesas. A gravação direta nas tabelas continua bloqueada para motoristas; as funções validam identidade e atualizam os registros relacionados na mesma transação. O arquivo 003 também instala liberação e arquivamento de veículos para administradores e pode ser executado novamente sem apagar dados.

Os históricos mantêm nome e placa como retrato do registro. IDs operacionais são texto para preservar IDs Firestore na importação; os vínculos a usuários usam UUID do Supabase. `motorista_id` aceita NULL para dados legados: esses registros ficam visíveis apenas para administradores até serem conciliados. Não vincule usuários pelo primeiro nome.

O bucket `frota-arquivos` é privado, aceita imagens JPEG/PNG/WebP de até 10 MiB, em caminhos `UID/nome-unico.jpg`. Cada motorista ativo envia/lê sua pasta; administradores leem todas e podem alterar/excluir. Fotos cadastrais de veículos enviadas pelo administrador precisam ser exibidas aos motoristas por um endpoint autorizado que gere URL assinada. Os campos foto/assinatura aceitam base64 legado, mas novos arquivos devem usar chaves do bucket e URLs assinadas para exibição. Não use URL pública desse bucket.

## O que ainda depende do código

As entradas ativas dos dois aplicativos foram adaptadas para Supabase Auth e Data API/RPC, com configuração por `.env.local`, adaptação dos campos e datas, assinaturas Realtime e atualização periódica a cada 15 segundos. O aplicativo identifica o motorista por UUID e exige KM final no retorno. O painel arquiva veículos para preservar o histórico e impede arquivamento/liberação durante uma viagem. O código exige as funções do arquivo 003 instaladas na base remota. Use URL do projeto e chave publicável no cliente; chave service_role/secret somente no servidor. A implementação antiga `frota-app/app.js` não é carregada.

Fotos e assinaturas continuam como base64 nos campos PostgreSQL nesta integração para preservar a interface atual. A transferência para Storage privado e exibição por URLs assinadas continua sendo uma melhoria posterior. Não foram importados registros nem senhas Firebase.

As páginas `/modelo/*` continuam sendo demonstrações locais e não são conectadas por este SQL. Campos exclusivos do modelo, como Local da despesa, não pertencem ao fluxo real atual e não foram adicionados silenciosamente.

Os scripts 002 e 003 foram executados em PostgreSQL local em memória via PGlite, com Auth/Storage simulados. Os testes em `tests/operacoes.mjs` verificam perfis inativos, RLS por usuário, tentativa de promoção de perfil, início/retorno, KM inválido, despesas, avarias durante viagem, arquivamento e bloqueio de visitantes. Isso não substitui o teste com Supabase Auth/Realtime reais. A URL/chave publicável respondeu a `/auth/v1/settings`; a tentativa de leitura anônima de veículos foi negada. Login real ainda precisa ser validado com a conta do usuário. A chave publicável não autoriza instalar funções SQL no banco remoto: executar 003 pelo SQL Editor.

Para repetir o teste sem adicionar dependências aos aplicativos (PowerShell):

```powershell
npm install --prefix "$env:TEMP/frota-sql-validation" @electric-sql/pglite
$env:PGLITE_MODULE = ([System.Uri](Join-Path $env:TEMP 'frota-sql-validation/node_modules/@electric-sql/pglite/dist/index.js')).AbsoluteUri
node database/tests/operacoes.mjs
```

Referências oficiais:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
