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
  '.md': 'text/markdown; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file), type = TYPES[extname(file)] || 'application/octet-stream';
    // Por trozos (Range), como Netlify: Safari no reproduce un vídeo que no se le sirva así
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      let a = range[1] ? Number(range[1]) : body.length - Number(range[2]), b = range[1] && range[2] ? Number(range[2]) : body.length - 1;
      a = Math.max(0, a); b = Math.min(b, body.length - 1);
      if (a > b) { res.writeHead(416, { 'content-range': `bytes */${body.length}` }).end(); return; }
      res.writeHead(206, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${body.length}`, 'content-length': b - a + 1 });
      res.end(body.subarray(a, b + 1));
      return;
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-length': body.length });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`Flaski en http://localhost:${PORT}`));
