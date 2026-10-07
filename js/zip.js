// Lector mínimo de archivos ZIP (para los .apkg de Anki). Descomprime con el propio navegador
// (DecompressionStream), así que no necesita librerías. Sin dependencias de la interfaz.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// bytes: Uint8Array del archivo → Map nombre → { size, read(): Promise<Uint8Array> }
export function readZip(bytes) {
  // Fin del directorio central: se busca desde el final (puede llevar un comentario)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un .apkg válido (no es un ZIP)');
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error('El ZIP está dañado');
    const method = u16(bytes, p + 10), csize = u32(bytes, p + 20), size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const raw = bytes.subarray(start, start + csize);
    files.set(name, {
      size,
      read: async () => {
        if (method === 0) return raw;
        if (method !== 8) throw new Error(`Compresión ZIP no admitida (${method})`);
        return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      },
    });
  }
  return files;
}
