# Gestão de usuários

## Exclusão com confirmação

A listagem oferece Excluir com diálogo identificando nome e email, aviso de exclusão permanente, Cancelar como foco inicial e confirmação explícita. Durante a requisição os botões e Escape ficam bloqueados; falhas mantêm o diálogo aberto. A própria conta não pode ser excluída, tanto na interface quanto no handler.

A ação `excluir` na Edge Function valida a sessão e o perfil de administrador ativo antes de chamar `auth.admin.deleteUser`. Não remove apenas o perfil público: exclui a conta Auth, cujo vínculo em cascata remove o perfil e preserva os registros operacionais com motorista_id nulo. Confira os vínculos usando `004_corrigir_exclusao_usuarios.sql` se o banco antigo impedir a remoção. Arquivos de Storage pertencentes ao usuário podem exigir tratamento no Supabase antes da exclusão; falhas são exibidas sem informar sucesso.

**Publicação pendente:** a função remota retornou 404 e não há credencial administrativa de deploy disponível nesta sessão. Execute com Supabase CLI autenticado, na raiz: `supabase functions deploy gerenciar-usuarios --project-ref kzllceyjvnmifpyvdjnb`. Confirme o project ref com a URL em `.env.local` antes de executar. Sem a função publicada, a interface exibe indisponibilidade e não exclui contas. Nunca coloque service_role no cliente.

Validação: 16 testes do handler, teste de navegador com cancelamento, confirmação, falha, proteção da própria conta e exclusão simulada; lint e build passaram. Nenhuma conta real foi excluída.

## Correção da edição (04/11/2026)

O endpoint remoto `gerenciar-usuarios` retornou 404 NOT_FOUND. A edição de nome, perfil e situação agora usa a Data API de `public.usuarios` com a sessão autenticada do administrador e as policies RLS existentes. Antes da atualização, verifica conta ativa e administradora, valida os campos e impede retirar o próprio acesso pela aplicação. Não altera email, senha ou estrutura do banco. A publicação da Edge Function descrita abaixo continua necessária para **criar novas contas**, mas não para editar contas existentes. Os trechos abaixo que descrevem edição pela função referem-se ao handler mantido por compatibilidade.

Validação: lint e build do painel, teste de navegador com rede simulada (incluindo PATCH de usuário) e 13 testes do handler passaram. A gravação na conta real depende de testar o salvamento com a sessão do usuário no painel.

A aba **Usuários** está no painel real (`dashboard-frota`), depois do login administrativo. Segue o tema escuro e azul do painel. Permite listar, buscar, filtrar, cadastrar e editar nome, perfil e situação. E-mail e senha são definidos somente no cadastro; não há alteração de e-mail ou senha nesta tela.

## Compatibilidade e revisão

Não há migração de estrutura nem alteração de dados existentes nesta entrega. A integração usa os campos de `public.usuarios` definidos em `002_supabase.sql`: `id`, `nome`, `email`, `perfil`, `ativo`, `criado_em`. Os perfis continuam sendo `motorista` e `administrador`.

A criação usa Supabase Auth Admin API no servidor. O trigger existente `frota_novo_usuario` cria o perfil inativo como motorista; a função atualiza nome, perfil e situação com a sessão do administrador e as regras RLS existentes. Se essa atualização falhar, tenta remover somente a conta recém-criada. Uma falha dessa compensação é informada na interface para conferência manual. Não usa cadastro público nem troca a sessão do administrador.

Na revisão, o Supabase remoto respondeu ao endpoint de configurações, e a leitura anônima de `usuarios` retornou 401 por falta de permissão. Não havia credencial administrativa de deploy no ambiente. Portanto, o schema e as policies remotos ainda precisam ser conferidos com `005_verificar_usuarios.sql` (somente leitura). Não é possível concluir quais usuários existem a partir da chave publicável.

**Divergência anterior encontrada:** `003_supabase_operacoes.sql` está vazio no workspace, apesar de `SUPABASE.md` mencionar funções operacionais nele. Esta funcionalidade de usuários não depende dele e não o reconstitui.

## Publicação da função

1. Execute `database/005_verificar_usuarios.sql` no SQL Editor do mesmo projeto usado em `dashboard-frota/.env.local`. Confira as seis colunas, RLS ativo, policy administrativa para leitura/atualização e trigger de criação de perfil. Se houver diferenças, reconcilie com a estrutura real antes de publicar; não reexecute `002_supabase.sql` sobre banco existente.
2. Com Supabase CLI autenticado, na raiz do projeto:

```powershell
supabase functions deploy gerenciar-usuarios --project-ref SEU_PROJECT_REF
```

O `supabase/config.toml` desativa apenas a verificação de JWT do gateway para esta função. O handler exige Bearer token e valida-o com `auth.getUser(token)` antes de consultar se o solicitante é administrador ativo. Isso permite validar também tokens com novas chaves de assinatura.

As variáveis de servidor são `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, fornecidas no ambiente hospedado de Edge Functions. Nunca copie a service role para arquivos `VITE_*` ou para o app móvel. Referência: https://supabase.com/docs/reference/javascript/auth-admin-createuser

Não é necessário instalar SQL novo para a tela. A conta do primeiro administrador precisa continuar existindo e ativa. Pela tela/função, um administrador não pode desativar ou rebaixar a própria conta; as policies administrativas preexistentes não são alteradas por esta entrega.

Contas são criadas com e-mail confirmado e senha inicial definida pelo administrador, sem envio de e-mail. As regras de senha do Supabase também se aplicam. Contas inativas continuam existindo no Auth, mas o app e RLS bloqueiam seu acesso aos dados. A edição não apaga histórico nem vínculos operacionais.

## Validação

```powershell
node --test supabase/functions/gerenciar-usuarios/handler.test.mjs
npm --prefix dashboard-frota run lint
npm --prefix dashboard-frota run build
```

Os testes do handler simulam o SDK e verificam autenticação, autorização, criação, edição, validação e compensação. Não substituem teste no Supabase real. Depois do deploy, entre como administrador, crie uma conta de motorista de teste, confira nome/perfil/situação, entre no app com essa conta, tente acessar o painel e confirme o bloqueio. Desative a conta e confirme que ela perde acesso aos dados. Valide também criação de administrador e rejeição de e-mail duplicado.

Também foram validados:

- `database/tests/usuarios.mjs`: executa o schema existente em PGlite e verifica trigger, colunas, valores padrão, leitura/edição administrativa, RLS do motorista e desativação. Requer `@electric-sql/pglite`; `PGLITE_MODULE` aceita a URL `file:` de uma instalação externa.
- `dashboard-frota/tests/usuarios.mjs`: teste em Chromium com todas as requisições ao Supabase simuladas, incluindo login, busca, criação, edição, falhas, proteção da própria conta e diálogo. Requer `@playwright/test` e Vite na porta 3211; `PLAYWRIGHT_MODULE` aceita a URL `file:` do `index.mjs` do pacote. As imagens em `artifacts/usuarios-*.png` usam dados fictícios.

As dependências de validação foram instaladas fora do repositório, na pasta temporária `frota-usuarios-validation`, sem adicionar pacotes aos aplicativos. Para repetir nesta máquina:

```powershell
$env:PGLITE_MODULE = ([System.Uri](Join-Path $env:TEMP 'frota-usuarios-validation/node_modules/@electric-sql/pglite/dist/index.js')).AbsoluteUri
node database/tests/usuarios.mjs
# Em outro terminal: npm --prefix dashboard-frota run dev -- --host 127.0.0.1 --port 3211 --strictPort
$env:PLAYWRIGHT_MODULE = ([System.Uri](Join-Path $env:TEMP 'frota-usuarios-validation/node_modules/@playwright/test/index.mjs')).AbsoluteUri
node dashboard-frota/tests/usuarios.mjs
```
