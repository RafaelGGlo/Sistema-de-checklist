# Correção do envio após assinatura

O APK chama `public.frota_salvar_checklist(p_dados jsonb)`. A mensagem
`Could not find the function ... in the schema cache` ocorria porque essa função
não estava instalada no projeto Supabase. O arquivo local
`003_supabase_operacoes.sql` estava vazio.

Em uma base que já tem as tabelas, execute somente
`006_corrigir_envio_checklist.sql`. A correção cria a função, restringe sua execução
a contas autenticadas e pede a atualização do cache da API. Pode ser repetida e
preserva os registros existentes. Não exige reinstalar nem atualizar o APK.

`002_supabase.sql` é a instalação inicial das tabelas em uma base nova; não deve
ser executado novamente sobre a base existente. A correção 006 instala somente o
envio de checklist; as demais operações previstas no arquivo 003 são independentes.

A função identifica o motorista pela sessão, obtém nome e placa no banco,
valida os dados e grava checklist e KM na mesma transação. Mantém o veículo em
trânsito quando a inspeção ocorre durante uma viagem. A assinatura e as fotos
continuam no formato enviado pelo APK.

Teste local, com `@electric-sql/pglite` instalado e `PGLITE_MODULE` apontando para o
módulo quando necessário:

```powershell
node database/tests/checklist-envio.mjs
```

Em 06/11/2026 a correção foi aplicada ao projeto de produção e a API reconheceu
a função. Uma gravação completa foi validada dentro de uma transação desfeita
com `ROLLBACK`, sem manter o checklist de teste.
