// O renderizador nativo evita decodificar as fotos e a assinatura PNG no Hermes.
// Se o WebView do aparelho falhar, a geração binária continua disponível.
export async function gerarPdfNativo(dados, { imprimir, guardar, gerarBinario, limiteMs = 30000 }) {
  let timer;
  try {
    const resultado = await Promise.race([
      imprimir(dados),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('A impressão demorou demais.')), limiteMs); }),
    ]);
    if (!resultado?.uri || !(resultado.numberOfPages > 0)) throw new Error('A impressão não produziu páginas.');
    return await guardar(resultado.uri, dados);
  } catch (erroNativo) {
    try { return await gerarBinario(dados); }
    catch (erroBinario) {
      console.error('Falha ao gerar PDF', { nativo: erroNativo.message, binario: erroBinario.message });
      throw new Error(`Não foi possível gerar o PDF neste aparelho. ${erroBinario.message || erroNativo.message}`);
    }
  } finally { clearTimeout(timer); }
}
