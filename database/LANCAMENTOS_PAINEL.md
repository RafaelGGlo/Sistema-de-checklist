# Lançamentos pelo painel

O painel administrativo oferece:

- Pátio: registrar saída de veículo liberado; retornar uma viagem informando KM final; liberar veículo após resolver avarias/manutenção.
- Diário de Bordo: nova viagem com veículo, motorista ativo, destino e KM inicial; retorno com cálculo da distância.
- Despesas: combustível (litros, valor, data, KM e posto opcionais) e pedágios (valor, data, local opcional), com vínculo opcional a uma viagem do mesmo veículo e motorista.
- Auditoria: botão para abrir o aplicativo, onde o motorista preenche o checklist com fotos e assinatura; inspeções enviadas continuam disponíveis em Ver Checklist.

Em bases existentes com as tabelas de `002_supabase.sql`, execute apenas `007_lancamentos_painel.sql` no SQL Editor. A migração é transacional, repetível e não apaga registros. Cria quatro funções exclusivas de administradores ativos e três colunas opcionais (`abastecimentos.km`, `abastecimentos.posto`, `pedagios.local`). As funções usam as permissões e RLS existentes. Não dependem do arquivo 003. Esta migração foi aplicada ao projeto conectado em 16/11/2026.

Saída e retorno atualizam viagem e veículo na mesma transação. A saída bloqueia veículos com avaria/manutenção, viagens simultâneas para veículo/motorista e KM inferior ao último registrado. O retorno preserva avarias registradas durante a viagem. Liberação de avarias não encerra viagens: use Registrar retorno. Despesas não alteram o odômetro do veículo, pois podem ser lançadas posteriormente.

O aplicativo abre por padrão no mesmo host do painel, porta 8081. Para outro endereço, configure `VITE_MOTORISTA_URL` em `dashboard-frota/.env.local` e reinicie o Vite. O aplicativo exige seu próprio login.

O teste `database/tests/painel.mjs` usa PostgreSQL em memória, com identidades e tabelas de Auth/Storage simuladas. Cobre repetição da migração, bloqueio de motoristas/visitantes, KM, viagens duplicadas, retorno, avarias e despesas com/sem vínculo. Não grava dados na produção.

```powershell
npm install --prefix "$env:TEMP/checklist-painel-qa" @electric-sql/pglite
$env:PGLITE_MODULE = ([System.Uri](Join-Path $env:TEMP 'checklist-painel-qa/node_modules/@electric-sql/pglite/dist/index.js')).AbsoluteUri
node database/tests/painel.mjs
```
