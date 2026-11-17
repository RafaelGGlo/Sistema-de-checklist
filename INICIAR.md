# Como iniciar o projeto

O repositório contém dois projetos independentes. Execute cada um em um terminal separado, a partir da pasta do repositório.

## Requisitos

- Node.js e npm (nesta máquina: Node 26.5.0 e npm 11.17.0).
- Internet para baixar dependências e acessar o Supabase.
- Usuário e senha cadastrados no Supabase Auth, com perfil ativo em `public.usuarios`.
- Para usar o aplicativo no celular: Expo Go compatível com SDK 57 ou uma development build compatível. Celular e computador devem estar na mesma rede para a conexão local.
- Android Studio/emulador é opcional para executar Android no computador. O simulador iOS requer macOS.

## Painel web

```powershell
cd dashboard-frota
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Abra http://localhost:5173. Nas próximas execuções, basta `npm run dev` dentro dessa pasta; repita `npm ci` ao atualizar as dependências do repositório.

Para iniciar esse mesmo painel no endereço http://127.0.0.1:3210/:

```powershell
cd dashboard-frota
npm run dev:3210
```

Esse comando mantém a porta 3210 e informa erro se ela estiver ocupada. O login é separado por endereço/porta; entre novamente com sua conta Supabase ao mudar de 5173 para 3210.

Principais dependências ativas: React 19, React DOM, React Router DOM, Supabase JS e Vite 8.

Para verificar a compilação: `npm run build`.

Os lançamentos administrativos de viagens e despesas usam `database/007_lancamentos_painel.sql` (já aplicado ao projeto conectado em 16/11/2026). Veja `database/LANCAMENTOS_PAINEL.md` para instalação em outra base e detalhes dos botões.

## Aplicativo dos motoristas

```powershell
cd frota-app
npm ci
npm start
```

O Expo apresenta o endereço e QR code no terminal. Use um cliente compatível com SDK 57. Para iniciar o servidor web: `npm run web`. Recursos nativos, como assinatura via WebView, precisam de validação em Android/iOS.

Principais dependências ativas: Expo 57, React Native 0.86.3, React 19.2.3, Supabase JS, React Navigation, AsyncStorage, Image Picker e Signature Canvas/WebView.

O ponto de entrada ativo é `frota-app/index.js`, que carrega `src/app/index.jsx`.

## Supabase e acesso

Os dois projetos usam `.env.local`, ignorado pelo Git, para a URL e chave publicável do Supabase. Há um `.env.example` em cada pasta. Na máquina atual, esses arquivos locais já foram configurados. Em outra máquina, copie os exemplos para `.env.local` e preencha-os antes de iniciar. Reinicie Vite/Expo após alterar as variáveis.

Na instalação inicial do banco execute `database/002_supabase.sql` uma vez. Se as seis tabelas já existem, NÃO execute novamente esse arquivo. Execute depois `database/003_supabase_operacoes.sql` para instalar as funções de viagens, checklists, despesas, liberação e arquivamento. Esse segundo arquivo pode ser repetido e preserva os dados.

O painel exige um administrador ativo; o aplicativo exige conta ativa. Entre com o e-mail e a senha do Supabase Auth. As funções SQL validam o ID autenticado e atualizam viagem/checklist e veículo na mesma transação. O aplicativo pede KM final no retorno. Fotos e assinaturas continuam sendo gravadas como data URLs no PostgreSQL nesta etapa; o bucket privado está disponível para uma migração posterior dos arquivos.

O arquivo antigo `frota-app/app.js` ainda contém a implementação Firebase e não é carregado pela entrada ativa. As rotas `/modelo/*` continuam sendo demonstrações com dados locais. Os dados e usuários do Firebase não são importados automaticamente.

Para parar um servidor iniciado no terminal, pressione Ctrl+C.

Referências: https://vite.dev/guide/ e https://docs.expo.dev/versions/v57.0.0/.

## Verificações da instalação

As dependências foram instaladas com npm nos dois projetos. O painel passou em `npm run build` e `npm run lint`. As dependências do aplicativo foram alinhadas com `npx expo install --fix`; a verificação `npx expo install --check` passou.

O npm reportou 19 vulnerabilidades na árvore de dependências do aplicativo (5 baixas, 3 moderadas, 10 altas e 1 crítica). A correção dessas vulnerabilidades continua pendente; não foi executado `npm audit fix --force`.
