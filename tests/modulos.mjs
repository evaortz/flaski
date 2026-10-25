// Los módulos que carga la app, siguiendo los import desde un archivo de entrada (rutas relativas a la raíz)
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';

export async function modulesFrom(root, entry) {
  const rel = p => relative(root, p).replaceAll('\\', '/');
  const seen = new Set();
  const visit = async file => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) await visit(normalize(join(dirname(file), m[1])));
  };
  await visit(join(root, entry));
  return [...seen].map(rel);
}
