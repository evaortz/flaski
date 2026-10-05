// Backend local: guarda todo en este navegador (localStorage), sin cuentas ni servidor.
// Se usa automáticamente cuando js/config.js no tiene datos de Supabase.
// Sirve para probar y mejorar la app en tu ordenador antes de desplegarla.
// Expone exactamente las mismas funciones que backend-supabase.js.
import { toRow } from './rows.js';

export const mode = 'local';

const KEY = 'flaski-local-v1';
const UID = 'local';
const EMPTY = () => ({
  profile: { id: UID, display_name: '' },
  settings: { new_per_day: 15, prefs: {} },
  decks: [], cards: [], progress: [], log: [], folders: [], tags: [], types: [], events: [],
});

function read() {
  try {
    // 'kartlar-local-v1' es el nombre antiguo de la app: se migra solo
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('kartlar-local-v1');
    return raw ? { ...EMPTY(), ...JSON.parse(raw) } : EMPTY();
  } catch {
    return EMPTY();
  }
}
let db = read();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error('No se pudo guardar en este navegador (¿modo privado o sin espacio?)');
  }
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const now = () => new Date().toISOString();
const clone = x => JSON.parse(JSON.stringify(x));

/* ---------------- Cuenta (simulada) ---------------- */
const session = { user: { id: UID, email: 'Modo local' } };
export const auth = {
  async session() { return session; },
  onChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  async signUp() { return { session }; },
  async signIn() { return { session }; },
  async signOut() {},
  async sendReset() {},
  async updatePassword() {},
};

// Borra todos los datos locales (lo usa el botón «Borrar datos locales» del perfil)
export function resetLocal() {
  db = EMPTY();
  persist();
}

/* ---------------- Carga inicial ---------------- */
export async function loadAll() {
  db = read();
  const since = new Date(Date.now() - 372 * 864e5).toISOString().slice(0, 10);
  const logArr = Array.isArray(db.log) ? db.log : (db.log && typeof db.log === 'object' ? Object.entries(db.log).map(([day, count]) => ({ day, count })) : []);
  const decksArr = Array.isArray(db.decks) ? db.decks : [];
  const cardsArr = Array.isArray(db.cards) ? db.cards : [];
  const progressArr = Array.isArray(db.progress) ? db.progress : [];
  const foldersArr = Array.isArray(db.folders) ? db.folders : [];
  const tagsArr = Array.isArray(db.tags) ? db.tags : [];
  const typesArr = Array.isArray(db.types) ? db.types : [];
  const eventsArr = Array.isArray(db.events) ? db.events : [];

  return clone({
    profile: db.profile || { id: UID, display_name: '' },
    settings: db.settings || { new_per_day: 15, prefs: {} },
    decks: [...decksArr].sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || ''))),
    cards: [...cardsArr].sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0)),
    progress: progressArr,
    log: logArr.filter(r => r && r.day >= since),
    folders: [...foldersArr].sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0)),
    tags: [...tagsArr].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    types: typesArr,
    events: eventsArr.filter(e => e && e.ts >= new Date(Date.now() - 400 * 864e5).toISOString()),
  });
}

/* ---------------- Perfil y ajustes ---------------- */
export async function saveProfile(uid, display_name) { db.profile.display_name = display_name; persist(); }
export async function saveSettings(uid, new_per_day, prefs) { db.settings.new_per_day = new_per_day; if (prefs) db.settings.prefs = prefs; persist(); }

/* ---------------- Progreso ---------------- */
export async function saveProgress(uid, cardId, s) {
  const row = toRow(uid, cardId, s);
  const i = db.progress.findIndex(r => r.card_id === cardId);
  if (i >= 0) db.progress[i] = row; else db.progress.push(row);
  persist();
}
export async function clearProgress(uid, cardId) {
  db.progress = db.progress.filter(r => r.card_id !== cardId);
  persist();
}
// Borra el progreso de varias tarjetas (o de todas si cardIds es null)
export async function clearManyProgress(uid, cardIds) {
  if (!cardIds) db.progress = [];
  else { const set = new Set(cardIds); db.progress = db.progress.filter(r => !set.has(r.card_id)); }
  persist();
}
// Copia completa de los datos locales (para Ajustes → Copia de seguridad)
export function dumpLocal() { return clone(db); }
export async function restoreLocal(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
export async function bumpLog(uid, day, delta) {
  if (!Array.isArray(db.log)) db.log = [];
  const r = db.log.find(x => x && x.day === day);
  const count = Math.max(0, (r?.count || 0) + delta);
  db.log = db.log.filter(x => x && x.day !== day);
  if (count > 0) db.log.push({ day, count });
  persist();
  return count;
}
export async function saveLog(uid, day, count) {
  if (!Array.isArray(db.log)) db.log = [];
  db.log = db.log.filter(r => r && r.day !== day);
  if (count > 0) db.log.push({ day, count });
  persist();
}

/* ---------------- Mazos ---------------- */
export async function createDeck(fields) {
  const d = { id: uuid(), owner: UID, name: '', description: '', is_public: false, source: '', created_at: now(), updated_at: now(),
    folder_id: null, icon: '', color: '', tags: [], pinned: false, archived: false, options: {}, ...fields };
  db.decks.push(d);
  persist();
  return clone(d);
}
export async function updateDeck(id, fields) {
  const d = db.decks.find(x => x.id === id);
  if (!d) throw new Error('Ese mazo ya no existe');
  Object.assign(d, fields, { updated_at: now() });
  persist();
  return clone(d);
}
export async function deleteDeck(id) {
  const gone = new Set(db.cards.filter(c => c.deck_id === id).map(c => c.id));
  db.decks = db.decks.filter(d => d.id !== id);
  db.cards = db.cards.filter(c => c.deck_id !== id);
  db.progress = db.progress.filter(r => !gone.has(r.card_id));
  persist();
}

/* ---------------- Tarjetas ---------------- */
export async function createCards(rows) {
  const out = rows.map(r => ({ id: uuid(), owner: UID, note: '', position: Date.now() / 1000, created_at: now(),
    note_id: null, type_id: 'basic', template: 't1', fields: {}, hint: '', tags: [], ...r }));
  db.cards.push(...out);
  persist();
  return clone(out);
}
export async function updateCard(id, fields) {
  const c = db.cards.find(x => x.id === id);
  if (!c) throw new Error('Esa tarjeta ya no existe');
  Object.assign(c, fields);
  persist();
  return clone(c);
}
export async function deleteCard(id) {
  db.cards = db.cards.filter(c => c.id !== id);
  db.progress = db.progress.filter(r => r.card_id !== id);
  persist();
}

/* ---------------- Mazos públicos (en local solo existen los tuyos) ---------------- */
export async function publicDecks() {
  return db.decks.filter(d => d.is_public).map(d => ({
    ...clone(d),
    count: db.cards.filter(c => c.deck_id === d.id).length,
    author: db.profile.display_name || 'Tú',
  }));
}
export async function getPublicDeck(id) {
  const d = db.decks.find(x => x.id === id && x.is_public);
  if (!d) return null;
  const cards = db.cards.filter(c => c.deck_id === id).sort((a, b) => a.position - b.position)
    .map(({ front, back, note, position, note_id, type_id, template, fields, hint }) => ({ front, back, note, position, note_id, type_id, template, fields, hint }));
  return { ...clone(d), cards, author: db.profile.display_name || 'Tú' };
}

/* ---------------- Carpetas ---------------- */
export async function createFolder(fields) {
  const f = { id: uuid(), owner: UID, parent_id: null, name: '', icon: '', color: '', position: Date.now() / 1000, created_at: now(), ...fields };
  db.folders.push(f);
  persist();
  return clone(f);
}
export async function updateFolder(id, fields) {
  const f = db.folders.find(x => x.id === id);
  if (!f) throw new Error('Esa carpeta ya no existe');
  Object.assign(f, fields);
  persist();
  return clone(f);
}
export async function deleteFolder(id) {
  db.folders = db.folders.filter(f => f.id !== id);
  for (const f of db.folders) if (f.parent_id === id) f.parent_id = null;
  for (const d of db.decks) if (d.folder_id === id) d.folder_id = null;
  persist();
}

/* ---------------- Etiquetas ---------------- */
export async function createTag(fields) {
  const t = { id: uuid(), owner: UID, name: '', color: 'gray', created_at: now(), ...fields };
  db.tags.push(t);
  persist();
  return clone(t);
}
export async function updateTag(id, fields) {
  const t = db.tags.find(x => x.id === id);
  if (!t) throw new Error('Esa etiqueta ya no existe');
  Object.assign(t, fields);
  persist();
  return clone(t);
}
export async function deleteTag(id) {
  db.tags = db.tags.filter(t => t.id !== id);
  for (const d of db.decks) d.tags = (d.tags || []).filter(x => x !== id);
  persist();
}

/* ---------------- Tipos de tarjeta ---------------- */
export async function createType(fields) {
  const t = { id: uuid(), owner: UID, name: '', icon: '', description: '', fields: [], templates: [], created_at: now(), updated_at: now(), ...fields };
  db.types.push(t);
  persist();
  return clone(t);
}
export async function updateType(id, fields) {
  const t = db.types.find(x => x.id === id);
  if (!t) throw new Error('Ese tipo ya no existe');
  Object.assign(t, fields, { updated_at: now() });
  persist();
  return clone(t);
}
export async function deleteType(id) {
  db.types = db.types.filter(t => t.id !== id);
  persist();
}

/* ---------------- Historial de respuestas ---------------- */
// En el navegador se guardan como mucho las 30.000 últimas respuestas (el espacio es limitado)
export async function addEvent(ev) {
  db.events.push(ev);
  if (db.events.length > 30000) db.events.splice(0, db.events.length - 30000);
  persist();
}
// Restaurar copias: en bloque. Las respuestas que ya existan (mismo id) se dejan como están.
export async function saveProgressMany(rows) {
  const at = new Map(db.progress.map((r, i) => [r.card_id, i]));
  for (const r of rows) { const i = at.get(r.card_id); if (i === undefined) { at.set(r.card_id, db.progress.length); db.progress.push(r); } else db.progress[i] = r; }
  persist();
}
export async function addEvents(rows) {
  const have = new Set(db.events.map(e => e.id));
  db.events.push(...rows.filter(e => !have.has(e.id)));
  db.events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  if (db.events.length > 30000) db.events.splice(0, db.events.length - 30000);
  persist();
}
// Registro diario: fusiona tomando el máximo de cada día; nunca baja un contador ya guardado
export async function mergeLog(uid, rows) {
  if (!Array.isArray(db.log)) db.log = [];
  const at = new Map(db.log.map(r => [r.day, r]));
  const out = [];
  for (const r of rows || []) {
    if (!r?.day || !(r.count > 0)) continue;
    const cur = at.get(r.day);
    if (!cur) { const n = { day: r.day, count: r.count }; db.log.push(n); at.set(r.day, n); out.push(n); }
    else if (r.count > cur.count) { cur.count = r.count; out.push(cur); }
  }
  persist();
  return out;
}
export async function deleteEvent(id) {
  db.events = db.events.filter(e => e.id !== id);
  persist();
}
