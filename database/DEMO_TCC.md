# Base de demonstração do TCC — 180 dias

Período fixo: **21/05/2026 a 16/11/2026**, inclusive, em horário de Brasília.

A carga `010_demo_tcc_180_dias.sql` adiciona 8 motoristas, 8 caminhões, 1.440 checklists, 1.395 viagens (1.393 finalizadas e 2 em andamento), 1.393 abastecimentos e 1.393 pedágios. Os registros possuem placas TCC e IDs internos `demo-tcc-180-`, sem a marcação DEMO nos textos exibidos. Não altera os veículos nem os usuários que já existiam. Reexecutar preserva a base e as operações feitas durante a apresentação.

Os motoristas possuem perfis para vínculo dos lançamentos, sem senha, identidade de login ou e-mail real (`@frota.invalid`). Use sua conta existente para apresentar o painel/aplicativo. Checklists históricos não incluem fotos ou assinaturas inventadas; esses recursos podem ser demonstrados preenchendo uma nova inspeção no aplicativo.

| Placa | Caminhão | Exemplo para apresentação |
| --- | --- | --- |
| TCC1D01 | Volvo FH 460 | Óleo vencido há 650 KM; retido, sem saída até manutenção e atualização da próxima revisão |
| TCC2D02 | Scania R 450 | Manutenção corretiva de freios por vazamento; retido na oficina |
| TCC3D03 | Mercedes Actros 2651 | Pneu dianteiro esquerdo com corte; bloqueado até substituição |
| TCC4D04 | DAF XF 480 | Farol direito defeituoso; retido até reparo |
| TCC5D05 | Iveco S-Way 450 | Viagem em andamento; mostrar motorista, destino e retorno com KM |
| TCC6D06 | VW Constellation 24.280 | Segunda viagem em andamento, com outro motorista |
| TCC7D07 | Mercedes Atego 1719 | Disponível; alerta de revisão em 350 KM |
| TCC8D08 | Volvo VM 270 | Óleo e filtros trocados; disponível e revisão programada para mais 10.000 KM |

O intervalo de 10.000 KM é um parâmetro fictício da demonstração. O histórico alterna rotas, distâncias e despesas, com inspeções reprovadas sem saída e correção no dia seguinte. Os odômetros são crescentes e as despesas pertencem ao veículo/motorista da viagem.

## Roteiro

1. No Dashboard, selecionar **180 dias** e apresentar os indicadores e despesas semanais. Esses totais também incluem quaisquer dados que já existiam na base.
2. No Pátio, buscar `TCC1D01`: mostrar KM, limite de revisão e motivo da retenção. Explicar que a saída é bloqueada no banco para painel e aplicativo, inclusive se alguém apenas clicar em liberar sem atualizar a revisão.
3. Mostrar os casos de freio, pneu e farol. Abrir o último checklist para ver o item reprovado e a observação.
4. Mostrar `TCC7D07` para planejamento da manutenção e `TCC8D08` para a operação liberada após troca de óleo.
5. No Diário de Bordo, demonstrar retorno de uma das duas viagens ativas. Em Despesas, mostrar litros, custos e pedágios.

Para concluir a manutenção do exemplo de óleo: realizar a manutenção fictícia, preencher nova inspeção no aplicativo com a próxima revisão acima do KM atual e todos os itens corrigidos; então liberar o veículo no painel. O banco permite saída somente com revisão vigente. A aplicação não verifica fisicamente o serviço: o registro e a liberação representam a confirmação do responsável.

## Instalação em outra base

Após as migrações existentes (002, 006, 007 e 008), aplicar `009_bloqueio_revisao.sql` e `010_demo_tcc_180_dias.sql` pelo SQL Editor. A migração 009 valida novas viagens em andamento e não modifica viagens históricas finalizadas. Não reexecutar a instalação inicial 002 em uma base já configurada.

## Validação

`database/tests/demo-tcc.mjs` valida carga repetível, contagens, 180 datas, odômetros, vínculos das despesas, ausência de saída com inspeção reprovada, bloqueio de revisão no painel e aplicativo, e saída após atualização da manutenção. Usa PGlite e tabelas de Auth/Storage simuladas.

```powershell
$env:PGLITE_MODULE = ([System.Uri](Join-Path $env:TEMP 'checklist-painel-qa/node_modules/@electric-sql/pglite/dist/index.js')).AbsoluteUri
node database/tests/demo-tcc.mjs
node --test dashboard-frota/tests/dashboard.test.mjs
```
