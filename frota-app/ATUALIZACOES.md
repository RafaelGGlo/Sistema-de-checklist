# Atualizações do Frota Junco

## Para usar no dia a dia

Instale uma vez o APK preparado para atualizações automáticas. O APK antigo, anterior a esta configuração, não recebe essas atualizações.

Depois, o fluxo é:

1. Alterar o aplicativo em `frota-app`.
2. Fazer commit e enviar para a branch `main` do GitHub.
3. O GitHub Actions instala as dependências, testa as regras do checklist e publica no Expo, no canal `production`.
4. Com internet, o celular verifica e baixa a atualização ao abrir o aplicativo. A versão baixada entra em uso na próxima abertura completa. Também aparece **Atualizar agora** no login ou na tela inicial, quando for seguro reiniciar.

O botão não aparece durante um checklist, captura de foto, viagem, preenchimento de KM de retorno ou modal de lançamento. O aplicativo não força uma reinicialização enquanto estiver aberto. Sem internet ou se o serviço falhar, continua usando a versão instalada.

Exemplo, na pasta raiz `Checlist`:

```powershell
git add frota-app/src
git commit -m "Melhora a tela do checklist"
git push origin main
```

Inclua também quaisquer outros arquivos necessários à alteração, como imagens, dependências e configuração. Não envie senhas, arquivos `.env.local`, chaves privadas ou APKs para o Git.

Enviar para outra branch não publica para os motoristas. Uma alteração só chega à produção ao entrar na `main`. Alterações apenas no dashboard ou banco de dados não acionam os workflows do aplicativo.

## Onde acompanhar

- [Execuções do GitHub Actions](https://github.com/RafaelGGlo/Sistema-de-checklist/actions).
- [Baixar o APK mais recente](https://github.com/RafaelGGlo/Sistema-de-checklist/releases/latest/download/Frota-Junco.apk).
- [Painel do projeto Expo](https://expo.dev/accounts/rafagglo/projects/frota-app).

O link de download só passa a existir depois da primeira execução bem-sucedida de **Gerar APK**. Se o repositório for privado, é necessário estar conectado a uma conta GitHub com acesso. Também é possível baixar o artefato `Frota-Junco-APK` dentro da execução do workflow.

## Quando precisa de APK novo

Telas, textos, regras em JavaScript e imagens comuns podem ser entregues pelo Expo Update, sem nova instalação.

Trocas de SDK, bibliotecas nativas, permissões, ícone, plugins e configurações nativas podem exigir outro APK. O `runtimeVersion` usa a política **fingerprint** do Expo: cada APK só aceita atualizações compatíveis com sua parte nativa. Isso evita entregar código de uma biblioteca nova a um celular que ainda não tem essa biblioteca.

O workflow **Gerar APK** é acionado automaticamente por alterações em `app.json`, `app.config.*`, dependências, configuração do fingerprint, plugins e assets. Ele compila na infraestrutura do GitHub, conserva a assinatura configurada e publica o arquivo em Releases. A regra é conservadora: algumas alterações apenas em imagens também podem gerar APK.

Antes de publicar o APK, o workflow confere se seu runtime embutido coincide com o calculado para as atualizações. Arquivos temporários do compilador Kotlin são excluídos desse cálculo, para manter o resultado estável durante a compilação.

Nesse caso, baixe e instale o novo APK. A distribuição por arquivo não permite instalar um APK silenciosamente em um Android comum: o sistema pede confirmação. Depois da instalação, as atualizações compatíveis voltam a chegar pelo Expo. Publicar na Play Store é uma etapa separada, não configurada aqui.

O APK gerado é ARM64. Para suportar aparelhos Android de 32 bits, será necessária outra configuração de compilação.

## Configuração da automação

Os workflows ficam em:

- `.github/workflows/atualizar-app.yml`: publicação em pushes na `main` que alterem `frota-app`, com opção de execução manual.
- `.github/workflows/gerar-apk.yml`: APK para mudanças potencialmente nativas, com opção de execução manual.

O GitHub armazena dois **Repository secrets**:

- `EXPO_TOKEN`: token do Expo usado somente na automação. Está limitado à conta `rafagglo`, com permissões `VIEW`, `PUBLISH`, `RUN` e `ADMIN`; a leitura do ambiente de produção também exige acesso administrativo nessa integração.
- `ANDROID_KEYSTORE_BASE64`: cópia codificada da chave que assina o APK local, para manter compatibilidade de instalação. Base64 não é criptografia; o valor fica protegido como secret do GitHub.

Não coloque os valores desses secrets no código, em mensagens ou nos logs. Se precisar substituir o token, crie outro no [painel de tokens do Expo](https://expo.dev/settings/access-tokens) e atualize `EXPO_TOKEN` nas [configurações do GitHub](https://github.com/RafaelGGlo/Sistema-de-checklist/settings/secrets/actions).

A assinatura preservada é a chave de desenvolvimento do projeto atual, para distribuição interna. Ela permite continuar atualizando o APK local correspondente. Um APK antigo assinado pelo EAS com outra chave pode rejeitar a instalação por conflito de assinatura. Uma futura publicação em loja exige planejar uma chave de distribuição própria e preservá-la.

As variáveis `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ficam no ambiente **production** do projeto Expo. São configurações públicas destinadas ao cliente, não chaves administrativas. A segurança dos dados continua dependendo das regras do Supabase. O workflow usa esse mesmo ambiente para publicar atualizações e gerar APKs.

Não há cobrança de compilação do EAS Build nesse fluxo, pois o APK é compilado no GitHub Actions. O GitHub Actions e o Expo Update têm limites e condições dos respectivos planos; esta configuração não contrata um plano pago.

## Validar e recuperar

Depois de instalar o APK novo, publique uma pequena mudança de texto na `main`, confira o workflow verde e abra o aplicativo com internet. Aguarde o download e use **Atualizar agora**, ou feche completamente e abra novamente. Confirmar esse teste no aparelho é necessário para validar o fluxo completo no seu celular.

Se uma atualização tiver problema, reverta o commit de JavaScript e envie o revert para a `main`: o workflow publica novamente a versão corrigida. A atualização de correção precisa manter runtime compatível com os aparelhos afetados. Não basta reverter uma dependência nativa e esperar que todos os APKs recebam a mesma atualização.

Para gerar um APK local de emergência:

```powershell
cd frota-app
.\gerar-apk.ps1
```

O script conserva a chave local antes de regenerar o Android e salva o APK em `apk/Frota-Junco.apk`. Não apague a chave de assinatura nem sua cópia de segurança.

Referências: [configuração do Expo Update](https://docs.expo.dev/eas-update/getting-started/), [integração com GitHub Actions](https://docs.expo.dev/eas-update/github-actions/) e [compatibilidade de runtime](https://docs.expo.dev/eas-update/runtime-versions/).
