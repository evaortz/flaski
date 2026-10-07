// Imágenes de tarjetas y apuntes.
// En el texto, una imagen es «![pie](img:ID)». Los datos se guardan aparte:
//   - en este navegador (IndexedDB), siempre: así se ven sin conexión;
//   - en la nube (Supabase Storage, carpeta de cada cuenta), si hay cuenta. Las que se añaden sin
//     conexión quedan marcadas como pendientes y se suben al volver la red.
// Las funciones puras van arriba (sin navegador), para poder probarlas aparte.

export const IMG_RE = /!\[([^\]\n]*)\]\(img:([\w-]{4,64})\)/g;
export const imgToken = (id, caption = '') => `![${String(caption).replace(/[\]\n]/g, ' ')}](img:${id})`;
export const hasImages = s => new RegExp(IMG_RE.source).test(String(s ?? ''));
export const stripImages = s => String(s ?? '').replace(IMG_RE, '').replace(/[ \t]{2,}/g, ' ').trim();
// Ids de imagen que aparecen en uno o varios textos
export function imageIds(...texts) {
  const out = new Set();
  for (const t of texts.flat(Infinity)) for (const m of String(t ?? '').matchAll(IMG_RE)) out.add(m[2]);
  return out;
}
// Ids de imagen de unas tarjetas (sus campos) y unos apuntes (sus bloques)
export function imageIdsOf({ cards = [], pages = [] } = {}) {
  const out = new Set();
  for (const c of cards) for (const id of imageIds(c.front, c.back, c.note, c.hint, Object.values(c.fields || {}))) out.add(id);
  for (const p of pages) for (const b of p.blocks || []) { if (b.src) out.add(b.src); for (const id of imageIds(b.text)) out.add(id); }
  return out;
}
export function newImageId() {
  const a = new Uint8Array(9);
  (globalThis.crypto || { getRandomValues: x => x.map(() => Math.random() * 256 | 0) }).getRandomValues(a);
  return [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

/* ---------------- Guardado en el navegador ---------------- */
const DB = 'flaski-media', STORE = 'img';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((ok, ko) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => ko(t.error);
  });
}
const getRec = id => tx('readonly', s => s.get(id));
const putRec = rec => tx('readwrite', s => s.put(rec));
const allRecs = () => tx('readonly', s => s.getAll());

/* ---------------- Nube ---------------- */
// remote: { upload(id, blob), download(id) → Blob|null } o null (sin cuenta)
let remote = null;
export function setRemote(r) { remote = r; if (r) flushUploads(); }

// Sube lo que se añadió sin conexión. Devuelve cuántas quedan pendientes.
let flushing = null;
export function flushUploads() {
  if (!remote) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let left = 0;
    try {
      for (const rec of await allRecs()) {
        if (!rec.pending) continue;
        try { await remote.upload(rec.id, rec.blob); await putRec({ ...rec, pending: false }); }
        catch { left++; }
      }
    } catch {}
    return left;
  })().finally(() => { flushing = null; });
  return flushing;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => flushUploads());

/* ---------------- Añadir y leer ---------------- */
const MAX = 1600;
// Reduce y comprime una imagen (archivo o blob) antes de guardarla
export async function compress(file) {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;   // vectoriales y animadas, tal cual
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = t => new Promise(ok => c.toBlob(ok, t, t === 'image/webp' ? 0.82 : 0.85));
  const webp = await blob('image/webp');
  // Safari no sabe guardar en WebP (devuelve PNG): entonces JPEG
  const out = webp?.type === 'image/webp' ? webp : await blob('image/jpeg');
  return out && out.size < file.size ? out : file;
}

const urls = new Map();   // id → URL del blob ya cargado
// Guarda una imagen nueva y devuelve su id
export async function addImage(file) {
  if (!/^image\//.test(file?.type || '')) throw new Error('Ese archivo no es una imagen');
  const blob = await compress(file);
  if (blob.size > 8e6) throw new Error('La imagen es demasiado grande (máximo 8 MB)');
  const id = newImageId();
  await putRec({ id, blob, pending: !!remote });
  urls.set(id, URL.createObjectURL(blob));
  if (remote) flushUploads();
  return id;
}

// Guarda una imagen con un id ya elegido (al importar de Anki). No sube nada hasta flushUploads().
const EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' };
export const imageType = name => EXT[String(name).split('.').pop().toLowerCase()] || '';
export async function storeImage(id, bytes, type) {
  let blob = new Blob([bytes], { type });
  try { blob = await compress(blob); } catch {}   // si el navegador no sabe abrirla, tal cual
  await putRec({ id, blob, pending: !!remote });
}

const loading = new Map();
// URL para mostrar una imagen (o null si no se encuentra)
export function imageUrl(id) {
  if (urls.has(id)) return Promise.resolve(urls.get(id));
  if (loading.has(id)) return loading.get(id);
  const p = (async () => {
    let rec = await getRec(id).catch(() => null);
    if (!rec && remote) {
      const blob = await remote.download(id).catch(() => null);
      if (blob) { rec = { id, blob, pending: false }; putRec(rec).catch(() => {}); }
    }
    if (!rec) return null;
    const u = URL.createObjectURL(rec.blob);
    urls.set(id, u);
    return u;
  })().finally(() => loading.delete(id));
  loading.set(id, p);
  return p;
}

// Pone la imagen a cada <img data-img="ID"> que aún no la tenga
export function hydrate(root = document) {
  for (const el of root.querySelectorAll('img[data-img]:not([data-ready])')) {
    el.dataset.ready = '1';
    imageUrl(el.dataset.img).then(u => {
      if (u) el.src = u;
      else { el.classList.add('img-missing'); el.alt = 'Imagen no disponible'; }
    });
  }
}

/* ---------------- Dentro de archivos (copias y mazos compartidos) ---------------- */
const toDataURL = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });
// { id: 'data:image/webp;base64,…' } de las imágenes que se encuentren
export async function exportImages(ids) {
  const out = {};
  for (const id of ids) {
    if (!(await imageUrl(id))) continue;
    const rec = await getRec(id).catch(() => null);
    if (rec) out[id] = await toDataURL(rec.blob);
  }
  return out;
}
// Guarda las imágenes que vienen en un archivo (con el mismo id: los textos que las citan no cambian)
export async function importImages(map) {
  let n = 0;
  for (const [id, data] of Object.entries(map || {})) {
    if (!/^[\w-]{4,64}$/.test(id) || !/^data:image\//.test(String(data))) continue;
    // Si ya estaba en este navegador, se vuelve a subir por si es de otra cuenta
    const have = await getRec(id).catch(() => null);
    const blob = have?.blob || await (await fetch(data)).blob();
    if (have && !remote) continue;
    await putRec({ id, blob, pending: !!remote });
    n++;
  }
  if (n && remote) await flushUploads();
  return n;
}
