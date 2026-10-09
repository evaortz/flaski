// Backend en la nube: guarda todo en Supabase (cuentas, mazos, progreso).
// Expone exactamente las mismas funciones que backend-local.js.
// La librería va incluida en la app (js/vendor) para que arranque sin conexión.
import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { toRow, progressCols } from './rows.js';
import { createOutbox } from './outbox.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

function check({ data, error, status }) {
  if (error) { if (error.status == null) error.status = status; throw error; }
  return data;
}

/* ---------------- Sin conexión ---------------- */
// Lo que se hace al estudiar (respuestas, progreso, registro diario, ajustes) pasa por una cola que se
// guarda en el navegador: sin red no se pierde y se envía en cuanto vuelve. Cada cuenta tiene la suya.
const send = {
  saveProgress: (uid, cardId, s) => sb.from('progress').upsert(toRow(uid, cardId, s)).then(check),
  clearProgress: (uid, cardId) => sb.from('progress').delete().eq('user_id', uid).eq('card_id', cardId).then(check),
  addEvent: ev => sb.from('review_events').upsert(ev, { onConflict: 'id', ignoreDuplicates: true }).then(check),
  deleteEvent: id => sb.from('review_events').delete().eq('id', id).then(check),
  bumpLog: (uid, day, delta, localCount) => sendBump(uid, day, delta, localCount),
  savePage: page => sb.from('pages').upsert({ ...page, updated_at: new Date().toISOString() }).then(check),
  saveSettings: (uid, new_per_day, prefs) => {
    const row = { user_id: uid, new_per_day };
    if (prefs) row.prefs = prefs;
    return sb.from('settings').upsert(row).then(check);
  },
};
let box = null;
export const offline = {
  // Empieza a usar la cola de esta cuenta; onChange(n) avisa de cuántos cambios quedan por enviar
  start(uid, onChange) {
    // Sin sesión válida (caducada y aún sin red para renovarla) no se envía: Supabase aceptaría
    // algunos borrados sin hacer nada. Se reintenta más tarde.
    const run = async (op, args) => {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user?.id !== uid) throw Object.assign(new Error('JWT: sin sesión'), { status: 401 });
      return send[op](...args);
    };
    box = createOutbox({ key: 'flaski-outbox:' + uid, run, onChange });
    onChange(box.size);
    return box.flush();
  },
  stop() { box = null; },
  flush() { return box ? box.flush() : Promise.resolve(true); },
  get pending() { return box ? box.size : 0; },
  // Cambios aún sin enviar, para aplicarlos encima de lo que se cargue (servidor o copia)
  pendingOps() { return box ? box.items : []; },
  clear() { box?.clear(); },
};
const queued = op => (...args) => (box ? box.push(op, ...args) : send[op](...args));

// Supabase devuelve como máximo 1000 filas por consulta: pedimos por páginas.
async function fetchAll(build) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const rows = check(await build().range(from, from + size - 1));
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

function chunks(arr, n) {
  const res = [];
  for (let i = 0; i < arr.length; i += n) res.push(arr.slice(i, i + n));
  return res;
}

/* ---------------- Cuenta ---------------- */
export const mode = 'cloud';

export const auth = {
  async session() {
    return check(await sb.auth.getSession()).session;
  },
  onChange(cb) {
    return sb.auth.onAuthStateChange((event, session) => cb(event, session));
  },
  async signUp(email, password, displayName) {
    return check(await sb.auth.signUp({
      email, password,
      options: { data: { display_name: displayName }, emailRedirectTo: location.origin + location.pathname },
    }));
  },
  async signIn(email, password) {
    return check(await sb.auth.signInWithPassword({ email, password }));
  },
  async signOut() {
    check(await sb.auth.signOut());
  },
  async sendReset(email) {
    check(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
  },
  async updatePassword(password) {
    check(await sb.auth.updateUser({ password }));
  },
};

/* ---------------- Carga inicial ---------------- */
// retry: false para fallar en el acto si no hay red (la app tiene entonces una copia con la que abrir);
// si no, la librería reintenta las lecturas varias veces antes de rendirse.
export async function loadAll(uid, { retry = true } = {}) {
  const since = new Date(Date.now() - 372 * 864e5).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 400 * 864e5).toISOString();
  const from = t => { const q = sb.from(t); return { select: (...a) => q.select(...a).retry(retry) }; };
  const [profile, settings, decks, cards, progress, log, folders, tags, types, events] = await Promise.all([
    from('profiles').select('id, display_name').eq('id', uid).maybeSingle().then(check),
    from('settings').select('new_per_day, prefs').eq('user_id', uid).maybeSingle().then(check),
    fetchAll(() => from('decks').select('*').eq('owner', uid).order('created_at')),
    fetchAll(() => from('cards').select('*').eq('owner', uid).order('position')),
    fetchAll(() => from('progress').select('*').eq('user_id', uid)),
    fetchAll(() => from('review_log').select('day, count').eq('user_id', uid).gte('day', since)),
    fetchAll(() => from('folders').select('*').eq('owner', uid).order('position')),
    fetchAll(() => from('tags').select('*').eq('owner', uid).order('name')),
    fetchAll(() => from('note_types').select('*').eq('owner', uid).order('created_at')),
    fetchAll(() => from('review_events').select('id, card_id, deck_id, ts, grade, state, ivl, last_ivl, ease, ms').eq('user_id', uid).gte('ts', yearAgo).order('ts')),
  ]);
  // Apuntes: si la tabla aún no existe (schema.sql sin ejecutar), la app funciona igual y lo avisa
  let pages = [], pagesMissing = false, pageTagsMissing = false;
  try { pages = await fetchAll(() => from('pages').select('*').eq('owner', uid).order('updated_at', { ascending: false })); }
  catch (e) { if (['42P01', 'PGRST205', 'PGRST200'].includes(e.code) || /pages/.test(e.message || '')) pagesMissing = true; else throw e; }
  // ¿Tiene ya la columna de etiquetas? (schema.sql de la versión 6). Si no, se guardan sin etiquetas.
  if (!pagesMissing) {
    const { error } = await sb.from('pages').select('tags').limit(1).retry(retry);
    if (error && (error.code === '42703' || /tags/.test(error.message || ''))) pageTagsMissing = true;
  }
  // ¿Tiene ya progress las columnas de FSRS (schema.sql, versión 9)? Si no, se guarda sin ellas
  { const { error } = await sb.from('progress').select('stability').limit(1).retry(retry);
    progressCols.extra = !(error && (error.code === '42703' || /stability/.test(error.message || ''))); }
  return { profile, settings, decks, cards, progress, log, folders, tags, types, events, pages, pagesMissing, pageTagsMissing };
}

/* ---------------- Perfil y ajustes ---------------- */
export async function saveProfile(uid, display_name) {
  check(await sb.from('profiles').update({ display_name }).eq('id', uid));
}
export const saveSettings = queued('saveSettings');

/* ---------------- Progreso ---------------- */
export const saveProgress = queued('saveProgress');
export const clearProgress = queued('clearProgress');
export async function clearManyProgress(uid, cardIds) {
  if (!cardIds) { check(await sb.from('progress').delete().eq('user_id', uid)); return; }
  for (let i = 0; i < cardIds.length; i += 200) check(await sb.from('progress').delete().eq('user_id', uid).in('card_id', cardIds.slice(i, i + 200)));
}
export function dumpLocal() { return null; }
export async function restoreLocal() { throw new Error('Solo disponible en modo local'); }
// Suma delta (+1 al responder, −1 al deshacer) al contador del día en el servidor y devuelve el total.
// Si la función SQL aún no está creada (schema.sql sin ejecutar), escribe como antes sin bajar nunca
// lo que haya: al sumar toma el máximo, para no borrar repasos de otro dispositivo.
export const bumpLog = queued('bumpLog');
async function sendBump(uid, day, delta, localCount) {
  const { data, error } = await sb.rpc('bump_review_log', { p_day: day, p_delta: delta });
  if (!error) return data;
  if (error.code !== 'PGRST202' && error.code !== '42883') throw error;
  if (delta > 0) { await mergeLog(uid, [{ day, count: localCount }]); return null; }
  await saveLog(uid, day, localCount);
  return null;
}
export async function saveLog(uid, day, count) {
  if (count > 0) check(await sb.from('review_log').upsert({ user_id: uid, day, count }));
  else check(await sb.from('review_log').delete().eq('user_id', uid).eq('day', day));
}

/* ---------------- Mazos ---------------- */
export async function createDeck(fields) {
  return check(await sb.from('decks').insert(fields).select().single());
}
export async function updateDeck(id, fields) {
  return check(await sb.from('decks').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single());
}
export async function deleteDeck(id) {
  check(await sb.from('decks').delete().eq('id', id));
}

/* ---------------- Tarjetas ---------------- */
export async function createCards(rows) {
  const out = [];
  for (const part of chunks(rows, 500)) out.push(...check(await sb.from('cards').insert(part).select()));
  return out;
}
export async function updateCard(id, fields) {
  return check(await sb.from('cards').update(fields).eq('id', id).select().single());
}
// Pasa todas tus tarjetas de un tipo a otro (al retirar las copias de tipos por idioma)
export async function retypeCards(oldTypeId, newTypeId) {
  check(await sb.from('cards').update({ type_id: newTypeId }).eq('type_id', oldTypeId));
}
export async function deleteCard(id) {
  check(await sb.from('cards').delete().eq('id', id));
}

/* ---------------- Mazos públicos ---------------- */
export async function publicDecks() {
  const decks = check(await sb.from('decks')
    .select('id, name, description, owner, created_at, cards(count)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(200));
  const owners = [...new Set(decks.map(d => d.owner))];
  const names = owners.length
    ? check(await sb.from('profiles').select('id, display_name').in('id', owners))
    : [];
  const byId = new Map(names.map(p => [p.id, p.display_name]));
  return decks.map(d => ({
    ...d,
    count: d.cards?.[0]?.count ?? 0,
    author: byId.get(d.owner) || 'Alguien',
  }));
}
export async function getPublicDeck(id) {
  const deck = check(await sb.from('decks').select('id, name, description, owner, is_public, types, options').eq('id', id).maybeSingle());
  if (!deck) return null;
  const cards = await fetchAll(() => sb.from('cards').select('front, back, note, position, note_id, type_id, template, fields, hint').eq('deck_id', id).order('position'));
  const prof = check(await sb.from('profiles').select('display_name').eq('id', deck.owner).maybeSingle());
  return { ...deck, cards, author: prof?.display_name || 'Alguien' };
}

/* ---------------- Carpetas ---------------- */
export async function createFolder(fields) {
  return check(await sb.from('folders').insert(fields).select().single());
}
export async function updateFolder(id, fields) {
  return check(await sb.from('folders').update(fields).eq('id', id).select().single());
}
export async function deleteFolder(id) {
  check(await sb.from('folders').delete().eq('id', id));
}

/* ---------------- Etiquetas ---------------- */
export async function createTag(fields) {
  return check(await sb.from('tags').insert(fields).select().single());
}
export async function updateTag(id, fields) {
  return check(await sb.from('tags').update(fields).eq('id', id).select().single());
}
export async function deleteTag(id) {
  check(await sb.from('tags').delete().eq('id', id));
}

/* ---------------- Tipos de tarjeta ---------------- */
export async function createType(fields) {
  return check(await sb.from('note_types').insert(fields).select().single());
}
export async function updateType(id, fields) {
  return check(await sb.from('note_types').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single());
}
export async function deleteType(id) {
  check(await sb.from('note_types').delete().eq('id', id));
}

/* ---------------- Historial de respuestas ---------------- */
export const addEvent = queued('addEvent');
// Restaurar copias: en bloque. Las respuestas que ya existan (mismo id) se dejan como están.
export async function saveProgressMany(rows) {
  for (const part of chunks(rows, 500)) check(await sb.from('progress').upsert(part));
}
export async function addEvents(rows) {
  for (const part of chunks(rows, 500)) check(await sb.from('review_events').upsert(part, { onConflict: 'id', ignoreDuplicates: true }));
}
// Registro diario: fusiona tomando el máximo de cada día; nunca baja un contador ya guardado
export async function mergeLog(uid, rows) {
  const want = new Map();
  for (const r of rows || []) if (r?.day && r.count > 0) want.set(r.day, Math.max(want.get(r.day) || 0, r.count));
  const out = [];
  for (const days of chunks([...want.keys()], 200)) {
    const have = new Map(check(await sb.from('review_log').select('day, count').eq('user_id', uid).in('day', days)).map(r => [r.day, r.count]));
    for (const day of days) if (want.get(day) > (have.get(day) || 0)) out.push({ user_id: uid, day, count: want.get(day) });
  }
  for (const part of chunks(out, 500)) check(await sb.from('review_log').upsert(part));
  return out;
}
export const deleteEvent = queued('deleteEvent');

/* ---------------- Amigos ---------------- */
// Todo pasa por funciones de supabase/schema.sql: de los demás solo llegan números ya calculados.
const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
// ¿Falta ejecutar schema.sql (versión 8)?
export const isMissingFn = e => ['PGRST202', '42883', 'PGRST205', '42P01'].includes(e?.code);
export const social = {
  me: async () => (await rpc('my_social'))?.[0] || null,              // { code, share }
  setShare: share => rpc('set_share', { p_share: share }),
  request: code => rpc('request_friend', { p_code: code }),            // 'sent' | 'accepted' | 'already' | 'pending' | 'self' | 'not_found' | 'blocked'
  respond: (id, accept) => rpc('respond_friend', { p_id: id, p_accept: accept }),
  remove: other => rpc('remove_friend', { p_other: other }),
  block: other => rpc('block_friend', { p_other: other }),
  unblock: other => rpc('unblock_friend', { p_other: other }),
  requests: () => rpc('friend_requests'),                              // [{ id, other, name, dir, created_at }]
  summary: today => rpc('friend_summary', { p_today: today }),         // [{ id, name, since, shared, streak, today, week, langs }]
  cheer: (to, kind = 'clap') => rpc('send_cheer', { p_to: to, p_kind: kind }),
  cheers: () => rpc('my_cheers'),                                      // [{ id, name, kind, created_at }]
  seen: async ids => { if (ids.length) check(await sb.from('cheers').update({ seen: true }).in('id', ids)); },
  isMissingFn,
};

/* ---------------- Imágenes ---------------- */
// Almacén privado «media»: cada cuenta en su carpeta (uid/id). Ver supabase/schema.sql.
export function imageStore(uid) {
  const bucket = () => sb.storage.from('media');
  return {
    async upload(id, blob) {
      const { error } = await bucket().upload(`${uid}/${id}`, blob, { upsert: true, contentType: blob.type || 'image/webp', cacheControl: '31536000' });
      if (error) throw error;
    },
    async download(id) {
      const { data, error } = await bucket().download(`${uid}/${id}`);
      if (error) throw error;
      return data;
    },
  };
}

/* ---------------- Apuntes ---------------- */
// Se guarda la página entera por la cola: escribir apuntes sin conexión no pierde nada
export const savePage = queued('savePage');
// Crear sin pasar por la cola (al restaurar copias hay que saber al momento si el id ya existe)
export async function createPage(fields) {
  return check(await sb.from('pages').insert(fields).select().single());
}
export async function deletePage(id) {
  check(await sb.from('pages').delete().eq('id', id));
}
