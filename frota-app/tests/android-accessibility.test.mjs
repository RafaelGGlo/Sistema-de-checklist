import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const android = await readFile(join(root, 'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.kt'), 'utf8');
function rolesNativos(nome) {
  const trecho = android.split(`enum class ${nome} {`)[1]?.split('public companion object')[0];
  assert.ok(trecho, `Enum Android ${nome} não encontrado`);
  return new Set([...trecho.matchAll(/^\s*([A-Z][A-Z0-9_]*),?;?\s*$/gm)].map(([, valor]) => valor.toLowerCase()));
}
const permitidos = { accessibilityRole: rolesNativos('AccessibilityRole'), role: rolesNativos('Role') };
async function* arquivos(pasta) {
  for (const item of await readdir(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, item.name);
    if (item.isDirectory()) yield* arquivos(caminho);
    else if (/\.(js|jsx)$/.test(item.name)) yield caminho;
  }
}
function valores(node) {
  if (node?.type === 'StringLiteral') return [node.value];
  if (node?.type === 'JSXExpressionContainer') return valores(node.expression);
  if (node?.type === 'ConditionalExpression') return [...valores(node.consequent), ...valores(node.alternate)];
  return [];
}
function* atributos(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXAttribute' && permitidos[node.name.name]) yield node;
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) { for (const item of child) yield* atributos(item); }
    else if (child && typeof child === 'object') yield* atributos(child);
  }
}

test('papéis de acessibilidade de todas as telas são aceitos pelo Android instalado', async () => {
  const invalidos = [];
  for await (const arquivo of arquivos(join(root, 'src'))) {
    const ast = parse(await readFile(arquivo, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    for (const atributo of atributos(ast)) {
      for (const valor of valores(atributo.value)) {
        if (!permitidos[atributo.name.name].has(valor)) {
          invalidos.push(`${relative(root, arquivo)}:${atributo.loc.start.line} ${atributo.name.name}="${valor}"`);
        }
      }
    }
  }
  assert.deepEqual(invalidos, [], 'Esses valores causam erro nativo ao montar a tela Android');
});
