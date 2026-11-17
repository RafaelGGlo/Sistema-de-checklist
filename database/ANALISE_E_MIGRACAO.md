# Análise do projeto e criação do banco online

## Conclusão

O banco atual já é online: Firestore do projeto `projeto-logistica-junco-698b4`, com Firebase Authentication por e-mail/senha. Trocar para PostgreSQL exige modificar os dois aplicativos; executar o SQL sozinho não muda a conexão e não transfere os registros existentes.

Recomendo Supabase se a prioridade for substituir o conjunto Firebase com menos serviços separados: oferece PostgreSQL, Auth, Storage e Realtime. Neon é uma boa escolha se você quer PostgreSQL com uma API própria. Para uma primeira migração ao Neon, recomendo manter Firebase Auth, validar seus tokens na API e substituir somente o Firestore. Não há necessidade de trocar a autenticação junto com os dados.

Fontes oficiais consultadas:
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/getting-started/architecture
- https://github.com/neondatabase/website/blob/main/content/docs/get-started/connect-neon.md

## O que foi identificado no código

| Área | Arquivo | Comportamento |
|---|---|---|
| Painel principal | `dashboard-frota/src/App.jsx` | Login Firebase; acompanha veículos, viagens, checklists, abastecimentos e pedágios com `onSnapshot`; cadastra/exclui veículos e libera avarias |
| Entrada web | `dashboard-frota/src/main.jsx` | Abre o painel ou o modelo conforme a URL |
| Páginas de modelo | `dashboard-frota/src/pages/PaginasFrota.jsx` | Rotas `/modelo/*`, dados fictícios e CRUD em `localStorage`; não estão conectadas ao Firestore |
| Aplicativo ativo | `frota-app/index.js` → `src/app/index.jsx` | Login, viagens, despesas, inspeção com 16 itens, seis fotos e assinatura |
| Versão antiga | `frota-app/app.js` | Outra implementação do aplicativo; não é carregada pelo ponto de entrada atual |
| Restos do template | `frota-app/src/app/_layout.tsx`, `explore.tsx`, componentes | Estrutura de Expo Router que não governa a entrada atual; há imports de `expo-router` sem dependência correspondente no package.json |
| Fotos de veículos | `dashboard-frota/src/cadastroVeiculo.js` | Redimensiona e comprime a imagem, salvando data URL/base64 no documento |

Não foi encontrado backend próprio, schema SQL, migração ou regras Firestore no repositório. O bucket está na configuração Firebase, mas os fluxos analisados gravam as imagens como base64 no Firestore. A análise cobre o código próprio e suas entradas/configurações; não inclui uma auditoria das dependências nem acesso à base remota ou às regras publicadas.

## Problemas que a migração deve resolver

1. **Identidade do motorista:** o app procura viagens pelo primeiro nome salvo no AsyncStorage. Pessoas com nomes iguais podem se confundir. Usar UID autenticado e `motorista_id`; o nome fica apenas como retrato histórico.
2. **Operações incompletas:** iniciar/finalizar viagem e salvar checklist fazem gravações separadas. Uma falha intermediária pode deixar o veículo divergente da viagem. A API deverá executar cada operação em uma transação, bloqueando a linha do veículo com `SELECT ... FOR UPDATE` e verificando disponibilidade.
3. **Concorrência:** não há garantia no banco visível no código de uma única viagem ativa por veículo. O SQL inclui índices únicos parciais para veículo e motorista identificado.
4. **Datas:** o painel ordena checklists e despesas por textos `dd/mm/aaaa`, o que não representa ordem cronológica. O novo modelo usa `timestamptz`, exibido no fuso `America/Sao_Paulo`.
5. **KM de retorno:** o fluxo ativo encerra a viagem sem preencher `kmFinal` ou `kmPercorrido`. O schema permite esses valores nulos para preservar os dados existentes, mas o fluxo deve passar a solicitar KM final e atualizar o veículo na mesma transação.
6. **Valores monetários:** `Number('12,50')` resulta em NaN. Normalizar entradas brasileiras e validar valores positivos na API. No banco, usar `numeric` em vez de ponto flutuante.
7. **Situação do veículo:** o checklist pode marcar um veículo em trânsito como liberado; o retorno pode apagar a situação de avaria. Definir regras para separar disponibilidade e avaria ou validar a transição na API. O SQL inicial mantém os status atuais, mas não implementa sozinho essa regra.
8. **Revisão:** o painel calcula ciclos por `intervaloRevisao`, enquanto o app alerta por `proximaRevisaoKm`. Unificar a regra; ambos os campos estão preservados.
9. **Sessão:** a tela inicial do app se baseia na presença do nome no AsyncStorage. Deve acompanhar a sessão autenticada. Autorizações precisam ser verificadas no servidor.
10. **Exclusão:** o painel exclui veículos fisicamente, mesmo com histórico. O SQL impede exclusão com referências; adaptar a ação para `ativo = false`.
11. **Arquivos:** seis fotos e assinatura dentro do documento aumentam o volume. Usar armazenamento privado de arquivos e guardar apenas suas chaves; a API gera URLs temporárias para visualização. O SQL aceita os base64 antigos durante a transição.
12. **Modelo local:** as rotas `/modelo` não compartilham os dados reais e têm outros campos/status. O SQL cobre a operação real; essas telas precisam ser integradas explicitamente, inclusive seus campos extras como Local e Data de auditoria, se forem virar produto.

## Modelo proposto

O arquivo `001_schema_postgres.sql` cria o schema privado `frota` e seis tabelas: `usuarios`, `veiculos`, `viagens`, `checklists`, `abastecimentos`, `pedagios`.

`usuarios` é nova: guarda perfil e vínculo com o provedor de autenticação; não guarda senha. O papel de administrador só pode ser atribuído por uma operação administrativa confiável. Os IDs textuais preservam IDs Firestore. Novos IDs são UUIDs. Nome e placa nos históricos são retratos do momento do registro. Itens e fotos de checklist usam JSONB para preservar a estrutura existente, inclusive o campo `obs` da versão antiga.

Há chaves estrangeiras, placa única, limites para KM/valores, índices para as consultas atuais e restrição de viagem ativa. `motorista_id` e `viagem_id` nas despesas são opcionais para permitir importar registros antigos sem inventar associações. Depois da conciliação, a API deve exigir identidade nos novos registros. O banco não impede duas viagens por primeiro nome quando `motorista_id` está ausente.

O script é para instalação única em base vazia: não apaga tabelas, e uma segunda execução falha e reverte a transação. Não é um script de atualização de uma instalação existente. O acesso é por API backend, sem permissões públicas; não contém políticas para acesso direto pelo SDK Supabase. Para esse outro desenho, preparar RLS, permissões e integração Auth antes de expor tabelas.

## Executar no Neon

1. Crie um projeto no console do Neon e selecione a base/branch de destino. O provedor cria o banco; não é necessário executar `CREATE DATABASE` dentro deste script.
2. Abra o SQL Editor nessa base vazia e execute o conteúdo completo de `001_schema_postgres.sql`.
3. Confira as tabelas:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'frota' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

4. Configure a connection string somente no ambiente do backend (`DATABASE_URL`), usando SSL e o endpoint apropriado ao runtime. Para muitas conexões curtas, o Neon documenta o endpoint pooled, com `-pooler` no hostname.
5. Crie uma role própria para a API com as permissões necessárias. Não distribua credenciais do proprietário. Não coloque a connection string em `VITE_*`, `EXPO_PUBLIC_*`, código React ou aplicativo mobile.

O schema não provisiona a role da API nem concede acesso a ela. A API deve verificar token, usuário ativo e perfil, limitar motoristas aos seus registros e permitir as ações administrativas apenas ao perfil adequado. Consultas devem usar parâmetros.

## Mapeamento dos dados existentes

| Firestore | PostgreSQL |
|---|---|
| ID do documento | `id`, preservado como texto |
| `veiculoId`, `nomeVeiculo` | `veiculo_id`, `nome_veiculo` |
| `motorista` | `motorista` e vínculo conciliado em `motorista_id` |
| `intervaloRevisao`, `proximaRevisaoKm` | `intervalo_revisao`, `proxima_revisao_km` |
| `motoristaAtual`, `destinoAtual`, `horaSaidaAtual` | `motorista_atual`, `destino_atual`, `hora_saida_atual` |
| `ultimoKm`, `ultimoMotorista`, `ultimaAvaria`, `ultimaAtualizacao` | `ultimo_km`, `ultimo_motorista`, `ultima_avaria`, `ultima_atualizacao` |
| `kmInicial`, `kmFinal`, `kmPercorrido` | `km_inicial`, `km_final`, `km_percorrido` calculado pelo banco |
| `dataHoraSaidaTimestamp` | `saida_em` |
| `dataHoraRetorno` | `retorno_em`, com conversão explícita de data brasileira |
| `dataHoraCriacao` do checklist | `realizado_em` |
| `dataRegistroTimestamp` das despesas | `registrado_em` |
| `valorTotal`, `obsGeral` | `valor_total`, `obs_geral` |
| `foto`, `fotos`, `assinatura`, `itens` | campos de mesmo nome |

Converter `'-'` e strings vazias para NULL somente nos campos opcionais; normalizar placas removendo hífen/espaços e convertendo para maiúsculas. Datas ISO têm preferência; datas brasileiras precisam ser interpretadas no fuso de São Paulo, sem depender de `new Date(textoBR)`. Ano/KM devem virar números inteiros. Não inserir `km_percorrido`, pois é coluna gerada. Registros sem referência, placa duplicada ou duas viagens ativas exigem conciliação antes da carga.

## Ordem de migração

1. Exportar as cinco coleções com seus IDs e obter a lista de usuários/UIDs com acesso autorizado. Não deduzir UID por primeiro nome. Fazer backup e inventário de contagens e totais.
2. Criar a base com o SQL, importar usuários e veículos, depois viagens, checklists e despesas. Campos opcionais sem origem confiável ficam nulos. Fotos/assinaturas devem ser preservadas ou transferidas para storage privado.
3. Criar API autenticada para veículos, início/retorno de viagens, checklists e despesas. As operações compostas precisam de transações; o script cria a estrutura, não esses endpoints.
4. Substituir `collection`, `addDoc`, `updateDoc`, `deleteDoc`, `getDocs` e `onSnapshot` nas duas entradas ativas por chamadas à API. Manter compatibilidade dos campos de UI por um adaptador snake_case ↔ camelCase e formatação de datas.
5. Definir atualização do painel por polling, SSE/WebSocket ou serviço realtime autorizado. O SQL sozinho não substitui `onSnapshot` nem o cache/reconexão do Firestore.
6. Validar login, permissões, colisões de viagem, falha intermediária, retorno/KM, checklist com fotos/assinatura, despesas e exportação. Comparar contagens, somas e histórico com o backup.
7. Fazer o corte com gravações antigas suspensas ou uma estratégia explícita de sincronização e rollback. Só desativar Firestore após validar a aplicação na nova base.

## Limites desta entrega

Foram preparados a análise e o SQL de criação. Não houve acesso ao console Neon, consulta/exportação do Firestore, criação de conta, importação de usuários/dados ou alteração das conexões dos aplicativos. O SQL precisa ser executado em PostgreSQL para validar a instalação no destino; não foi executado contra um banco nesta entrega.
