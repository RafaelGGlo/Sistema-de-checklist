# Checklist compacto e captura sequencial

## Análise do fluxo anterior

A entrada ativa é `index.js` → `src/app/index.jsx`. O checklist era um componente local nesse arquivo, aberto pelo menu Fazer Checklist depois da seleção do veículo. Não havia telas ou campo de tipo separados para saída/chegada. Há 16 avaliações: Níveis & Fluidos (3), Estado dos Pneus (4), Iluminação & Faróis (6, incluindo setas), Segurança do Baú (1) e Limpeza & Conservação (2).

As avaliações iniciavam em BOM, OK ou SIM. As setas queimadas exibiam o detalhe FRENTE/TRASEIRA. A observação geral só aparecia após SIM. Não existia campo ou estrutura separada para fotografias de defeitos.

Há **seis**, não cinco, posições de fotografia: `painel`, `cabine`, `ldEsq`, `ldDir`, `traseira`, `frente`. A tela anterior não bloqueava o envio por fotos ausentes. Esse comportamento foi preservado: não foi criada uma obrigação nova. O progresso das avaliações agora conta revisões explícitas, sem confundir os valores iniciais com itens conferidos; ele também não impõe uma validação nova.

O KM continua obrigatório, e repetir o último KM continua exigindo confirmação. O campo da próxima revisão conserva a indicação visual e o comportamento anteriores, incluindo o valor `-` quando vazio. A assinatura precede o envio. As regras de avaria, os nomes e a ordem das avaliações permanecem iguais, inclusive REGULAR sem avaria.

O envio continua chamando `salvarChecklist` em `src/lib/frota.js`, que invoca `frota_salvar_checklist` no Supabase. Nenhuma API, tabela, regra de acesso, RPC ou autenticação foi modificada nesta tarefa.

## Implementação

- `src/checklist/ChecklistScreen.jsx`: categorias recolhíveis, linhas compactas (lado a lado a partir de 380 px), controles com pelo menos 44 px de altura, contadores e progresso. A marcação em grupo exige confirmação e permite alterações individuais posteriores. Campos condicionais das setas e observação mantidos. Rodapé com acesso à assinatura.
- `src/checklist/CameraSequence.jsx`: uma CameraView permanece montada entre as fotos; após Tirar foto, o motorista pode Refazer ou Usar foto. Confirmar guarda a imagem e avança automaticamente. A última confirmação fecha a câmera. Sair antes mantém as fotos confirmadas; Continuar captura usa somente as posições restantes. A câmera é liberada enquanto o app está em segundo plano e reiniciada no retorno. Há tratamento de permissão negada, bloqueio de captura dupla e erro de abertura.
- `src/checklist/imagens.js`: ImageManipulator gera JPEG com dimensão máxima de 1600 px e qualidade 0,6, em data URI/base64 compatível com o contrato existente. Há limite de 900 mil caracteres por foto, com erro explícito em vez de tentar persistir uma imagem excessiva. A nitidez real do painel deve ser conferida em aparelho.
- `src/checklist/useChecklistDraft.js`: AsyncStorage por usuário autenticado e veículo, com uma entrada para os campos e uma para cada foto. A fila serializa as gravações e só limpa o rascunho depois que o servidor confirma o checklist. Erros de persistência local mostram aviso; fotos ainda em memória continuam disponíveis enquanto a tela está aberta. Rascunhos ocupam espaço no aparelho e não são sincronizados entre dispositivos.
- `src/checklist/model.mjs`: catálogo real, progresso, restauração e transformação para o mesmo payload anterior.
- `src/app/index.jsx`: apenas extrai o checklist e importa sua nova implementação; as outras telas mantêm seu funcionamento.
- `app.json`, `package.json`, `package-lock.json`: `expo-camera ~57.0.6` e `expo-image-manipulator ~57.0.21`, instalados pelas versões compatíveis com Expo SDK 57, mais configuração de câmera.

Galeria: seleção de várias imagens, limitada às posições que faltam (ou seis quando todas já existem). Antes de gravar, uma revisão mostra o destino de cada imagem e permite cancelar. A associação segue a ordem retornada pelo seletor; conferir a revisão é necessário. Cada posição também permite seleção ou captura individual, sem trocar as demais.

## Validação

```powershell
node --test frota-app/tests/checklist-model.test.mjs
# Exportar a versão web antes do teste de interface:
cd frota-app
npx expo export --platform web --output-dir ../artifacts/checklist-web
cd ..
node frota-app/tests/checklist-browser.mjs
```

O teste de navegador requer Playwright; `PLAYWRIGHT_MODULE` aceita a URL file: de uma instalação externa. Ele serve a exportação em 127.0.0.1:8084, simula todas as respostas do Supabase e usa a câmera sintética do Chromium. Não cria, atualiza ou envia registros reais. Verifica marcação em grupo com confirmação/cancelamento, alteração individual, detalhe das setas, KM, seis capturas, permanência da câmera, refazer, interromper/retomar, importação múltipla, ausência de envio durante captura e recuperação após voltar/recarregar.

Resultados: cinco testes do modelo passaram; teste de navegador passou; oxlint nos arquivos alterados passou; exportações Android e web passaram; `expo install --check` passou. Layout inspecionado em 320, 390 e 480 px, com capturas em `artifacts/checklist-*.png`.

`npx tsc --noEmit` continua bloqueado por sete diagnósticos em arquivos antigos do template: `_layout.tsx`, `app-tabs.tsx`, `app-tabs.web.tsx`, `external-link.tsx`, `animated-icon.web.tsx` e `constants/theme.ts`. Referem-se a Expo Router ausente, declarações de CSS ausentes e um parâmetro sem tipo. Esses arquivos não fazem parte do checklist e não foram alterados.

## Conferir no Android real

É necessário gerar e instalar **um APK novo**, pois expo-camera é uma dependência nativa nova. O projeto Android local foi regenerado, mas um APK desta entrega não foi gerado ou instalado.

Validar em aparelho: permissão concedida/negada permanentemente, segundo plano durante captura, interrupção pelo sistema, nitidez do KM, seleção múltipla da galeria do fabricante, rotação do sensor, assinatura por toque e envio autenticado ao Supabase. A assinatura continua usando react-native-signature-canvas; no navegador a tela informa que a assinatura deve ser feita no Android. O teste web não substitui assinatura, câmera ou envio no dispositivo real.
