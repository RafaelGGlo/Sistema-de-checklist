# Análise e definição do Dashboard

## Necessidade

O administrador precisava abrir Pátio, Diário de Bordo, Auditoria e Despesas para entender a operação. A nova tela reúne disponibilidade atual, movimento no período, custos e pendências, com acesso às ações existentes.

## Conteúdo definido

- Frota ativa, veículos disponíveis, em trânsito e retidos por avaria/manutenção.
- Saídas realizadas no período e KM das viagens que retornaram no período. São datas diferentes: uma viagem iniciada antes do período pode ter retornado dentro dele.
- Despesas totais, combustível, litros e pedágios pela data de registro, com gráfico diário (7/30 dias) ou semanal (90 dias) e tabela acessível de valores.
- Quantidade de checklists e inspeções com avaria, sem confundir inspeções históricas com veículos atualmente retidos.
- Alertas atuais de avaria, manutenção, KM ausente e revisão programada vencida/próxima (até 1.000 KM). Não se infere revisão vencida apenas pelo múltiplo do intervalo, pois isso não informa se a manutenção já foi feita.
- Veículos em trânsito com motorista, destino e horário; maiores despesas por veículo; atalhos para viagem, combustível e pedágio.

## Dados e comportamento

Usa as seis consultas às tabelas existentes do Supabase, com as permissões do administrador. As consultas do Dashboard são independentes dos limites de 50/100 registros das listagens antigas. Buscam páginas de até 200 linhas, ordenadas por ID, usando a contagem total da API. Os indicadores só aparecem depois de todas as consultas concluírem; uma falha não é apresentada como valor zero.

Os períodos incluem hoje e os 6/29/89 dias anteriores, em America/Sao_Paulo. Datas futuras são excluídas. A disponibilidade considera a situação atual de todos os veículos ativos, independentemente do filtro de período. Os custos históricos incluem despesas de veículos posteriormente arquivados. Os totais são de valores registrados: não representam pagamentos conciliados nem um custo por KM, pois as despesas não precisam estar vinculadas a viagens.

Atualiza ao abrir a tela, trocar o período, salvar uma operação, voltar à janela, pelo botão Atualizar e a cada 30 segundos enquanto a página está visível. Falhas durante atualização mantêm o último resultado com aviso explícito. Consultas são canceladas ao sair. Mudanças simultâneas no banco entre páginas podem refletir instantes ligeiramente diferentes; uma atualização posterior converge para o estado atual.

Não exige migração do banco nem adiciona dependências. O Dashboard é a primeira opção do menu e a tela inicial após login. O layout se adapta à largura disponível no painel.

## Verificação

`node --test tests/dashboard.test.mjs` verifica datas no fuso de Brasília, retornos que cruzam o período, despesas, agrupamento semanal, avarias, manutenção e ausência de KM/revisão. `npm run build` e `npm run lint` validam a integração.
