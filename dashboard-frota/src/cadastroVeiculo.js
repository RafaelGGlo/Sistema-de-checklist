// Reserva espaço para os demais campos do documento do veículo.
const LIMITE_FOTO_BASE64 = 700000;

export async function prepararFotoVeiculo(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem para a foto.');
  }

  const url = URL.createObjectURL(file);
  try {
    const imagem = new Image();
    await new Promise((resolve, reject) => {
      imagem.onload = resolve;
      imagem.onerror = () => reject(new Error('Não foi possível abrir a foto. Tente uma imagem JPG ou PNG.'));
      imagem.src = url;
    });

    const escala = Math.min(1, 1000 / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Não foi possível preparar a foto neste navegador.');
    contexto.fillStyle = '#fff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);

    for (const qualidade of [0.8, 0.65, 0.5, 0.35]) {
      const foto = canvas.toDataURL('image/jpeg', qualidade);
      if (foto.length <= LIMITE_FOTO_BASE64) return foto;
    }
    throw new Error('A foto ainda está muito grande. Selecione uma imagem menor.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mensagemErroCadastro(error) {
  const codigo = error?.code;
  if (codigo === '42501' || codigo === 'PGRST301') {
    return 'O Supabase não autorizou o cadastro. Confira se sua conta está ativa e tem o perfil administrador.';
  }
  if (codigo === '23505') {
    return 'Já existe um veículo com essa placa.';
  }
  if (codigo === '23514' || codigo === '22P02') {
    return 'Confira a placa, o ano e o intervalo de revisão. A placa deve ter sete caracteres, como ABC1234 ou ABC1D23.';
  }
  if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
    return 'Não foi possível confirmar o cadastro. Verifique sua conexão e confira a lista de veículos antes de tentar novamente.';
  }
  if (codigo === 'resource-exhausted') {
    return 'O banco atingiu um limite de uso. Tente novamente mais tarde.';
  }
  return `Não foi possível salvar o veículo. ${error?.message || 'Confira sua conexão e tente novamente.'}${codigo ? ` Código: ${codigo}.` : ''}`;
}
