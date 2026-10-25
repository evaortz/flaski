// Pone en index.html la lista de módulos de la app y la versión de sw.js. Uso, desde tests/:  node version.mjs
// (después de subir VERSION en sw.js o de añadir un módulo).
//
// Por qué: Safari guarda en memoria los módulos ya cargados y, al recargar, puede mezclar uno viejo con otros
// nuevos («Importing binding name … is not found»), aunque el servidor diga «no-store». Un script en index.html
// crea un import map que manda cada módulo a «…?v=175» (y, si la app ha tenido que recuperarse, «?v=175-<marca>»),
// y las precargas con esas mismas direcciones: así cada versión pide direcciones que no están en ninguna caché.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { modulesFrom } from './modulos.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START = '<!-- módulos (los escribe tests/version.mjs) -->', END = '<!-- /módulos -->';

export async function versionedIndex() {
  const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const v = /const VERSION = 'flaski-v(\d+)'/.exec(sw)[1];
  let html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const mods = (await modulesFrom(ROOT, 'js/app.js')).sort((a, b) => (a === 'js/app.js' ? -1 : b === 'js/app.js' ? 1 : a.localeCompare(b)));
  const block = `${START}
<script>
// Import map con la versión en la dirección de cada módulo y sus precargas (ver tests/version.mjs)
(function () {
  var V = '${v}', M = ${JSON.stringify(mods)};
  var b = ''; try { b = sessionStorage.getItem('flaski-bust') || ''; } catch (e) {}
  var q = '?v=' + V + (b ? '-' + b : ''), map = {};
  M.forEach(function (m) { map['./' + m] = './' + m + q; });
  var s = document.createElement('script'); s.type = 'importmap'; s.textContent = JSON.stringify({ imports: map });
  document.currentScript.after(s);
  M.forEach(function (m) { var l = document.createElement('link'); l.rel = 'modulepreload'; l.href = m + q; document.head.appendChild(l); });
})();
</script>
${END}`;
  // Fuera lo de antes: el bloque, un import map fijo y las precargas sueltas
  // El bloque se sustituye donde esté; la primera vez va donde estaban las precargas sueltas (que se quitan)
  const at = html.indexOf(START);
  if (at >= 0) html = html.slice(0, at) + block + html.slice(html.indexOf(END) + END.length);
  else {
    html = html.replace(/<script type="importmap">.*?<\/script>\n?/s, '');
    const first = html.search(/<link rel="modulepreload"/);
    html = html.replace(/<link rel="modulepreload" href="[^"]+">\n?/g, '');
    html = first >= 0 ? `${html.slice(0, first)}${block}\n${html.slice(first)}` : html.replace('</head>', `${block}\n</head>`);
  }
  // La app arranca con un import (así pasa por el import map)
  html = html.replace(/<script type="module"( src="js\/app\.js[^"]*")?>(import '\.\/js\/app\.js';)?<\/script>/, `<script type="module">import './js/app.js';</script>`);
  return { html, v, mods };
}

if (process.argv[1]?.endsWith('version.mjs')) {
  const { html, v } = await versionedIndex();
  await writeFile(join(ROOT, 'index.html'), html);
  console.log(`index.html → v${v}`);
}
