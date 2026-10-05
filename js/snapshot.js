// Copia de tus datos en este navegador (IndexedDB), para que la app abra sin conexión.
// Solo se usa con cuentas (modo nube): en modo local los datos ya viven aquí.
const DB = 'flaski-offline';
const STORE = 'snapshots';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}

export async function saveSnapshot(uid, data) {
  try { await tx('readwrite', s => s.put({ ...data, savedAt: Date.now() }, uid)); } catch {}
}
export async function loadSnapshot(uid) {
  try { return (await tx('readonly', s => s.get(uid))) || null; } catch { return null; }
}
export async function deleteSnapshot(uid) {
  try { await tx('readwrite', s => s.delete(uid)); } catch {}
}

// Última cuenta que abrió la app aquí, para poder entrar sin conexión aunque la sesión
// no se pueda renovar en ese momento.
const LAST = 'flaski-last-user';
export function rememberUser(user) { try { localStorage.setItem(LAST, JSON.stringify({ id: user.id, email: user.email || '' })); } catch {} }
export function lastUser() { try { return JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { return null; } }
export function forgetUser() { try { localStorage.removeItem(LAST); } catch {} }
