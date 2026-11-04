import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Mantém JPEG/base64 usado pelo envio atual, com resolução suficiente para ler o KM.
export async function comprimirFoto(foto) {
  const contexto = ImageManipulator.manipulate(foto.uri);
  let imagem;
  try {
    if (Math.max(foto.width, foto.height) > 1600) {
      contexto.resize(foto.width >= foto.height ? { width: 1600 } : { height: 1600 });
    }
    imagem = await contexto.renderAsync();
    const resultado = await imagem.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
    if (!resultado.base64) throw new Error('Não foi possível preparar a imagem. Tente novamente.');
    // Evita exceder o limite por entrada do armazenamento local Android.
    if (resultado.base64.length > 900000) throw new Error('Imagem muito grande. Aproxime o enquadramento ou escolha outra foto.');
    return `data:image/jpeg;base64,${resultado.base64}`;
  } finally {
    imagem?.release();
    contexto.release();
  }
}
