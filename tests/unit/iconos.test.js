// Todos los iconos que pide la app existen: un nombre que no está en icons.js sale en blanco sin avisar.
// Se buscan en el código: icon('x'), icon(a ? 'x' : 'y'), icon(['x', 'y'][i]), lucide: 'x', { icon: 'x' } de los
// avisos y los ayudantes que reciben el icono como parámetro «ic» (how('ia', 'message-square', …), row(…), prop(…)…)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../js/', import.meta.url));
async function sources() {
  const out = [];
  const walk = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') await walk(p); } else if (e.name.endsWith('.js')) out.push([p, await readFile(p, 'utf8')]);
    }
  };
  await walk(ROOT);
  return out;
}
// El primer argumento de una llamada que empieza en i (hasta la coma o el paréntesis de su nivel)
function firstArg(src, i) {
  let depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (!depth) return src.slice(i, j); depth--; }
    else if (c === ',' && !depth) return src.slice(i, j);
  }
  return '';
}
// Los argumentos (texto) de una llamada que empieza en i
function args(src, i) {
  const out = [];
  let k = i;
  for (let n = 0; n < 8; n++) {
    const a = firstArg(src, k);
    out.push(a.trim());
    k += a.length;
    if (src[k] !== ',') break;
    k++;
  }
  return out;
}
// Los textos de una expresión que pueden ser el nombre (no los de una comparación: e.kind === 'deck' ? 'copy' : …)
const lits = s => [...s.matchAll(/(===?|!==?)?\s*'([a-z][a-z0-9-]*)'/g)].filter(m => !m[1]).map(m => m[2]);

test('todos los iconos que se usan existen en icons.js', async () => {
  const { hasIcon } = await import('../../js/icons.js');
  const used = new Map();   // nombre → dónde
  const add = (name, where) => { if (!used.has(name)) used.set(name, where); };
  for (const [file, src] of await sources()) {
    const at = i => `${file.slice(ROOT.length)}:${src.slice(0, i).split('\n').length}`;
    for (const m of src.matchAll(/\bicon\(/g)) for (const n of lits(firstArg(src, m.index + 5))) add(n, at(m.index));
    for (const m of src.matchAll(/\blucide:\s*'([a-z0-9-]+)'/g)) add(m[1], at(m.index));
    for (const m of src.matchAll(/\{\s*(?:ms:[^}]*?,\s*)?icon:\s*'([a-z0-9-]+)'/g)) add(m[1], at(m.index));
    // Ayudantes con un parámetro «ic»: const how = (id, ic, …) => …  /  function row(attr, ic, …)
    for (const m of src.matchAll(/(?:const\s+(\w+)\s*=\s*\(|function\s+(\w+)\s*\()([^)]*)\)/g)) {
      const name = m[1] || m[2], params = m[3].split(',').map(s => s.trim().replace(/\s*=.*$/, ''));
      const pos = params.indexOf('ic');
      if (pos < 0 || name === 'icon') continue;
      for (const c of src.matchAll(new RegExp(`\\b${name}\\(`, 'g'))) {
        if (c.index === m.index + m[0].indexOf(name)) continue;
        const a = args(src, c.index + name.length + 1)[pos];
        const m2 = /^'([a-z][a-z0-9-]*)'$/.exec(a || '');   // solo cuando se pasa el nombre tal cual
        if (m2) add(m2[1], at(c.index));
      }
    }
  }
  assert.ok(used.size > 40, `se esperaban muchos iconos y salen ${used.size}`);
  const missing = [...used].filter(([n]) => !hasIcon(n)).map(([n, w]) => `${n} (${w})`);
  assert.deepEqual(missing, [], 'faltan en icons.js');
});
