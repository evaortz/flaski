// El service worker guarda la app para abrirla sin conexión: si falta un archivo en su lista,
// la app no arranca offline. Esta prueba lo comprueba siguiendo los imports desde js/app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rel = p => relative(ROOT, p).replaceAll('\\', '/');

async function modulesFrom(entry) {
  const seen = new Set();
  const visit = async file => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) await visit(normalize(join(dirname(file), m[1])));
  };
  await visit(join(ROOT, entry));
  return [...seen].map(rel);
}

test('el service worker guarda todos los módulos que carga la app', async () => {
  const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const shell = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]));
  const missing = (await modulesFrom('js/app.js')).filter(f => !shell.has(f));
  assert.deepEqual(missing, [], 'añade estos archivos a SHELL en sw.js');
});

test('la app no carga código de fuera (para abrir sin conexión)', async () => {
  for (const f of await modulesFrom('js/app.js')) {
    const src = await readFile(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /(?:from\s+|import\s*\(\s*)['"]https?:/, `${f} importa algo de internet`);
  }
});
