# Registros da frota

O menu principal segue o uso da operação: Dashboard, Pátio e saídas, Registros e Usuários.
Registros reúne três consultas na mesma página: Viagens (diário de bordo), Checklists
(auditoria e assinaturas) e Combustível e pedágios.

Cada consulta começa nos últimos 7 dias e permite selecionar 15 ou 30 dias. A escolha
é independente por consulta e permanece enquanto o painel estiver aberto. O período
inclui o dia atual em Brasília, da meia-noite do primeiro dia até a meia-noite seguinte
ao dia atual. Viagens usam a data de saída; checklists, a data da inspeção; despesas,
a data do lançamento. Viagens em andamento anteriores ao período continuam acessíveis
em Pátio e saídas para registrar o retorno.

Somente a consulta selecionada é carregada e acompanhada por Realtime. O filtro é
aplicado no Supabase; a paginação busca todos os resultados do período em blocos de
200 linhas. A auditoria não baixa as fotos dos checklists na listagem. Os formulários
de despesas consultam as viagens do veículo e motorista escolhidos, independentemente
do período selecionado na lista.

## Estado anterior e backup

Commit anterior à reorganização: `6c142fe`.
Cópias locais em `C:/Users/Rafael/Documents/Projetos/Backups`:

- `Checklist-fontes-antes-registros-20261117.tar.gz`: arquivos do projeto, incluindo
  configurações locais e artefatos; exclui dependências instaladas, caches, diretórios
  de build, dist e .git, que têm cópia separada.
- `Checklist-codigo-6c142fe.zip`: código versionado antes da mudança.
- `Checklist-git-antes-registros-20261117.bundle`: histórico completo do Git.
- `Checklist-dados-antes-registros-20261117.json`: dados das seis tabelas da aplicação,
  usuários e identidades de autenticação, metadados de buckets e objetos do Storage.
  É uma exportação JSON dos dados, não um dump PostgreSQL. Arquivos binários do Storage
  e sessões de autenticação não fazem parte dessa exportação.

A reorganização não altera o banco de dados nem os três cenários de apresentação.

## Fotos na auditoria

Ao abrir Ver Checklist, o painel consulta as fotos somente daquela inspeção e
mostra Painel, Cabine, Lado Esquerdo, Lado Direito, Traseira e Frente, as mesmas
posições usadas no PDF do aplicativo. Clique na miniatura para ampliar dentro
da janela. Registros antigos sem imagens mostram Foto não anexada. Se a consulta
falhar, use Tentar novamente; fotos indisponíveis têm aviso próprio. A assinatura
permanece abaixo das fotos. Nenhuma alteração no banco ou no aplicativo é necessária.

O teste de navegador usa somente respostas simuladas, sem gravar dados reais.
Com o Vite em `http://127.0.0.1:3211`, execute `node tests/checklist-fotos.mjs`.
Se necessário, defina `PLAYWRIGHT_MODULE` com o módulo Playwright instalado e
`PLAYWRIGHT_EXECUTABLE_PATH` com o executável do Chromium disponível.

## Validação

```powershell
npm run build
npm run lint
node --test tests/dashboard.test.mjs tests/registros.test.mjs
```

Os testes cobrem datas de Brasília, limites de cada período, campos de data de todas
as consultas, paginação além de 200 registros e falhas sem resultados parciais.
