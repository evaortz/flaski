// Backend en la nube: guarda todo en Supabase (cuentas, mazos, progreso).
// Expone exactamente las mismas funciones que backend-local.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { toRow } from './rows.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

function check({ data, error }) {
  if (error) throw error;
  return data;
}

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
export async function loadAll(uid) {
  const since = new Date(Date.now() - 372 * 864e5).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 400 * 864e5).toISOString();
  const [profile, settings, decks, cards, progress, log, folders, tags, types, events] = await Promise.all([
    sb.from('profiles').select('id, display_name').eq('id', uid).maybeSingle().then(check),
    sb.from('settings').select('new_per_day, prefs').eq('user_id', uid).maybeSingle().then(check),
    fetchAll(() => sb.from('decks').select('*').eq('owner', uid).order('created_at')),
    fetchAll(() => sb.from('cards').select('*').eq('owner', uid).order('position')),
    fetchAll(() => sb.from('progress').select('*').eq('user_id', uid)),
    fetchAll(() => sb.from('review_log').select('day, count').eq('user_id', uid).gte('day', since)),
    fetchAll(() => sb.from('folders').select('*').eq('owner', uid).order('position')),
    fetchAll(() => sb.from('tags').select('*').eq('owner', uid).order('name')),
    fetchAll(() => sb.from('note_types').select('*').eq('owner', uid).order('created_at')),
    fetchAll(() => sb.from('review_events').select('id, card_id, deck_id, ts, grade, state, ivl, last_ivl, ease, ms').eq('user_id', uid).gte('ts', yearAgo).order('ts')),
  ]);
  return { profile, settings, decks, cards, progress, log, folders, tags, types, events };
}

/* ---------------- Perfil y ajustes ---------------- */
export async function saveProfile(uid, display_name) {
  check(await sb.from('profiles').update({ display_name }).eq('id', uid));
}
export async function saveSettings(uid, new_per_day, prefs) {
  const row = { user_id: uid, new_per_day };
  if (prefs) row.prefs = prefs;
  check(await sb.from('settings').upsert(row));
}

/* ---------------- Progreso ---------------- */
export async function saveProgress(uid, cardId, s) {
  check(await sb.from('progress').upsert(toRow(uid, cardId, s)));
}
export async function clearProgress(uid, cardId) {
  check(await sb.from('progress').delete().eq('user_id', uid).eq('card_id', cardId));
}
export async function clearManyProgress(uid, cardIds) {
  if (!cardIds) { check(await sb.from('progress').delete().eq('user_id', uid)); return; }
  for (let i = 0; i < cardIds.length; i += 200) check(await sb.from('progress').delete().eq('user_id', uid).in('card_id', cardIds.slice(i, i + 200)));
}
export function dumpLocal() { return null; }
export async function restoreLocal() { throw new Error('Solo disponible en modo local'); }
// Suma delta (+1 al responder, −1 al deshacer) al contador del día en el servidor y devuelve el total.
// Si la función SQL aún no está creada (schema.sql sin ejecutar), escribe como antes sin bajar nunca
// lo que haya: al sumar toma el máximo, para no borrar repasos de otro dispositivo.
export async function bumpLog(uid, day, delta, localCount) {
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
  const deck = check(await sb.from('decks').select('id, name, description, owner, is_public, types').eq('id', id).maybeSingle());
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
export async function addEvent(ev) {
  check(await sb.from('review_events').insert(ev));
}
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
export async function deleteEvent(id) {
  check(await sb.from('review_events').delete().eq('id', id));
}
