# Gerar APK no Windows

Requisitos: dependências npm instaladas, Android Studio com JDK e Android SDK, e `.env.local` com a URL e chave publicável do Supabase. A primeira execução baixa Gradle, NDK, SDK e outras dependências; as próximas reaproveitam o cache.

No PowerShell, dentro de `frota-app`:

```powershell
.\gerar-apk.ps1
```

O script conserva a chave de assinatura, prepara `android` e compila `assembleRelease` para celulares ARM64. O arquivo final fica em `apk/Frota-Junco.apk`. O código JavaScript fica embutido no APK, sem precisar de Expo Go ou servidor Metro. O acesso ao Supabase continua exigindo internet.

O aplicativo também recebe atualizações compatíveis pelo Expo Update. O GitHub publica essas atualizações ao enviar alterações para `main` e gera APKs para mudanças potencialmente nativas. Veja [ATUALIZACOES.md](ATUALIZACOES.md) para o fluxo completo.

Para instalar sem cabo, transfira o APK pelo Google Drive ou outro meio de sua preferência, baixe no celular e abra o arquivo para instalar.

Esta compilação local usa a assinatura de desenvolvimento padrão do projeto Android gerado, adequada para testes internos. A publicação em loja e a distribuição definitiva precisam de uma chave própria preservada. A assinatura local difere da usada pelo EAS: uma instalação feita pelo EAS pode não aceitar este APK como atualização.

Os diretórios `android` e `apk` são ignorados pelo Git. Depois de alterar plugins ou configuração nativa em `app.json`, execute `npx expo prebuild --platform android --no-install` antes de gerar outro APK. Não exclua o diretório Android sem guardar a chave se tiver configurado uma assinatura própria.
