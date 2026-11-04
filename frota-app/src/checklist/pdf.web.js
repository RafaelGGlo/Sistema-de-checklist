import * as Print from 'expo-print';
import { htmlChecklist } from './relatorio.mjs';

export async function gerarPdf(dados) { return htmlChecklist(dados); }
export async function compartilharPdf(html) { await Print.printAsync({ html }); }
