// Capa de datos de la app. Elige el backend:
//  - Si js/config.js tiene los datos de Supabase → backend-supabase.js (cuentas, nube)
//  - Si no → backend-local.js (todo en este navegador, para probar en local)
// Los dos backends exponen las mismas funciones, así que app.js no nota la diferencia.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
export { fromRow } from './rows.js';

export const configured =
  !!SUPABASE_URL && !SUPABASE_URL.includes('TU-PROYECTO') && !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('PEGA');

const impl = configured ? await import('./backend-supabase.js') : await import('./backend-local.js');

export const mode = impl.mode;               // 'cloud' o 'local'
export const auth = impl.auth;
export const loadAll = impl.loadAll;
export const saveProfile = impl.saveProfile;
export const saveSettings = impl.saveSettings;
export const saveProgress = impl.saveProgress;
export const clearProgress = impl.clearProgress;
export const clearManyProgress = impl.clearManyProgress;
export const dumpLocal = impl.dumpLocal;
export const restoreLocal = impl.restoreLocal;
export const saveLog = impl.saveLog;
export const createDeck = impl.createDeck;
export const updateDeck = impl.updateDeck;
export const deleteDeck = impl.deleteDeck;
export const createCards = impl.createCards;
export const updateCard = impl.updateCard;
export const deleteCard = impl.deleteCard;
export const publicDecks = impl.publicDecks;
export const getPublicDeck = impl.getPublicDeck;
export const resetLocal = impl.resetLocal || null;
export const createFolder = impl.createFolder;
export const updateFolder = impl.updateFolder;
export const deleteFolder = impl.deleteFolder;
export const createTag = impl.createTag;
export const updateTag = impl.updateTag;
export const deleteTag = impl.deleteTag;
export const createType = impl.createType;
export const updateType = impl.updateType;
export const deleteType = impl.deleteType;
export const addEvent = impl.addEvent;
export const deleteEvent = impl.deleteEvent;
export const saveProgressMany = impl.saveProgressMany;
export const addEvents = impl.addEvents;
export const mergeLog = impl.mergeLog;

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Copia un mazo (compartido, incluido o de un archivo) a la cuenta del usuario.
// Las tarjetas pueden traer tipo y campos; los ids de nota se renuevan para que
// las tarjetas hermanas sigan juntas en la copia. typeMap traduce ids de tipos
// personalizados del origen a los tipos creados para este usuario.
export async function importDeck(uid, { name, description = '', source = '', cards, typeMap = new Map() }) {
  const deck = await createDeck({ owner: uid, name: name.slice(0, 80), description: description.slice(0, 300), source });
  return { deck, cards: await importCards(uid, deck.id, cards, typeMap) };
}
// Añade tarjetas (de un archivo o de otro mazo) a un mazo existente
export async function importCards(uid, deckId, cards, typeMap = new Map()) {
  const base = Date.now() / 1000;
  const notes = new Map();
  const rows = cards.map((c, i) => {
    let note = c.note_id ? notes.get(c.note_id) : null;
    if (!note) { note = newId(); if (c.note_id) notes.set(c.note_id, note); }
    return {
      deck_id: deckId, owner: uid,
      front: String(c.front ?? '').slice(0, 2000) || '—', back: String(c.back ?? '').slice(0, 2000) || '—', note: String(c.note || '').slice(0, 2000),
      position: base + i / 1000,
      note_id: note,
      type_id: typeMap.get(c.type_id) || c.type_id || 'basic',
      template: c.template || 't1',
      fields: c.fields && typeof c.fields === 'object' && !Array.isArray(c.fields) ? c.fields : {},
      hint: String(c.hint || '').slice(0, 500),
    };
  });
  return rows.length ? createCards(rows) : [];
}
