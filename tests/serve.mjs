// Servidor estático mínimo para las pruebas: sirve la carpeta de la app (la de arriba).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8123);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    // Vídeo: los navegadores lo piden por trozos
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range && range[1] !== '') {
      const a = Number(range[1]), z = Math.min(body.length - 1, range[2] === '' ? body.length - 1 : Number(range[2]));
      res.writeHead(206, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'content-range': `bytes ${a}-${z}/${body.length}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
      res.end(body.subarray(a, z + 1));
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`Flaski en http://localhost:${PORT}`));
