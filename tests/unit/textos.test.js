// La app no lleva emojis en sus textos (los iconos son de icons.js). Solo los de los recuadros del apunte
// (los elige quien escribe) y su valor por defecto
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../js/', import.meta.url));
const SKIP = /vendor|emoji|dibujos|org.js/;   // org.js: los iconos que se pueden elegir para una lista
test('sin emojis en los textos de la app', async () => {
  const found = [];
  const walk = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (SKIP.test(p)) continue;
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.js')) {
        (await readFile(p, 'utf8')).split('\n').forEach((l, i) => {
          if (/callout|CALLOUT/.test(l)) return;   // los iconos de los recuadros
          if (/[\u{1F300}-\u{1FAFF}]/u.test(l)) found.push(`${p.slice(ROOT.length)}:${i + 1}`);
        });
      }
    }
  };
  await walk(ROOT);
  assert.deepEqual(found, []);
});
