// Plan de estudio: qué mazos y carpetas estudias ahora (activo, solo repasos o en pausa), cuánto foco
// le das a cada uno y su fecha de examen. Decide cuántas nuevas salen hoy de cada mazo.
// Funciones puras (no tocan la pantalla ni la base de datos), fáciles de probar.
// nodes: { [idDeMazo | 'f:' + idDeCarpeta]: { state, weight, exam: 'AAAA-MM-DD' } } (en las preferencias)
import { DAY, startOfDay } from './srs.js';

export const STATES = [
  { id: 'active', label: 'Activo', hint: 'Nuevas y repasos.' },
  { id: 'reviews', label: 'Solo repasos', hint: 'No entran nuevas, pero repasas lo que ya sabes.' },
  { id: 'paused', label: 'En pausa', hint: 'No entra nada al estudiar «Todo».' },
];
const RANK = { active: 0, reviews: 1, paused: 2 };
export const folderKey = id => 'f:' + id;
const parentOf = (folders, id) => (id && folders.has(id) ? id : null);
const deckParent = (d, folders) => parentOf(folders, d.folder_id);
const folderParent = (f, folders) => parentOf(folders, f.parent_id);

// El estado que manda: el más restrictivo entre el suyo y el de sus carpetas (en pausa > solo repasos > activo)
function climb(st, fid, folders, nodes) {
  const seen = new Set();
  while (fid && folders.has(fid) && !seen.has(fid)) {
    seen.add(fid);
    const s = nodes[folderKey(fid)]?.state;
    if (s && RANK[s] > RANK[st]) st = s;
    fid = folderParent(folders.get(fid), folders);
  }
  return st;
}
export const deckState = (d, folders, nodes) => climb(nodes[d.id]?.state || 'active', deckParent(d, folders), folders, nodes);
export const folderState = (fid, folders, nodes) => climb(nodes[folderKey(fid)]?.state || 'active', folderParent(folders.get(fid), folders), folders, nodes);

// Días hasta una fecha (AAAA-MM-DD): 0 = hoy, negativo = ya pasó, null = sin fecha
export function daysTo(date, now = Date.now()) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Math.round((startOfDay(new Date(date + 'T12:00:00').getTime()) - startOfDay(now)) / DAY);
}

// Hijos de una carpeta (null = la raíz): carpetas y mazos (sin archivados)
export function childrenOf(fid, decks, folders) {
  return {
    folders: [...folders.values()].filter(f => folderParent(f, folders) === fid && f.id !== fid),
    decks: [...decks.values()].filter(d => !d.archived && deckParent(d, folders) === fid),
  };
}
export const weightOf = (nodes, key) => { const w = nodes[key]?.weight; return Number.isFinite(w) && w >= 0 ? w : 1; };

// Parte del foco de cada mazo (0..1), repartida por el árbol: en cada carpeta, cada hijo según su peso
// entre los hermanos que cuentan (eligible(mazo) dice si un mazo cuenta; una carpeta cuenta si tiene alguno).
export function shares(decks, folders, nodes, eligible = () => true) {
  const out = new Map(), has = new Map();
  const counts = fid => {
    if (has.has(fid)) return has.get(fid);
    has.set(fid, false);   // por si hubiera ciclos
    const k = childrenOf(fid, decks, folders);
    const v = k.decks.some(d => eligible(d)) || k.folders.some(f => counts(f.id));
    has.set(fid, v);
    return v;
  };
  const walk = (fid, share, depth = 0) => {
    if (depth > 30) return;
    const k = childrenOf(fid, decks, folders);
    const kids = [...k.folders.filter(f => counts(f.id)).map(f => ({ key: folderKey(f.id), f })), ...k.decks.filter(d => eligible(d)).map(d => ({ key: d.id, d }))];
    const sum = kids.reduce((a, x) => a + weightOf(nodes, x.key), 0);
    for (const x of kids) {
      const s = sum ? share * weightOf(nodes, x.key) / sum : 0;
      if (x.d) out.set(x.d.id, s); else walk(x.f.id, s, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

// Reparte «total» unidades según las partes, sin pasar de lo disponible de cada uno; lo que sobra de uno
// pasa a los demás. floors: mínimos que se dan primero (el ritmo para llegar a un examen).
export function allocate(total, sh, avail, floors = new Map()) {
  const out = new Map();
  let left = Math.max(0, Math.floor(total));
  const room = id => (avail.get(id) || 0) - (out.get(id) || 0);
  const give = (id, k) => { out.set(id, (out.get(id) || 0) + k); left -= k; };
  for (const [id, f] of floors) { const k = Math.min(Math.ceil(f), room(id), left); if (k > 0) give(id, k); }
  let active = [...sh.keys()].filter(id => room(id) > 0 && sh.get(id) > 0);
  while (left > 0 && active.length) {
    const sum = active.reduce((a, id) => a + sh.get(id), 0);
    const start = left, rest = [];
    for (const id of active) {
      const x = (start * sh.get(id)) / sum, k = Math.min(room(id), Math.floor(x));
      if (k > 0) give(id, k);
      rest.push([id, x - Math.floor(x)]);
    }
    rest.sort((a, b) => b[1] - a[1]);
    for (const [id] of rest) { if (left <= 0) break; if (room(id) > 0) give(id, 1); }
    if (left === start) break;
    active = active.filter(id => room(id) > 0);
  }
  return out;
}

// Ritmo para llegar a cada examen: nuevas al día que necesita cada mazo (las de una carpeta, repartidas
// según las que quedan en cada mazo). remaining: Map mazo → nuevas que le quedan
export function examFloors(decks, folders, nodes, remaining, now = Date.now(), eligible = () => true) {
  const out = new Map();
  const put = (id, v) => { if (v > (out.get(id) || 0)) out.set(id, v); };
  for (const [key, n] of Object.entries(nodes)) {
    const d = daysTo(n?.exam, now);
    if (d == null || d < 1) continue;
    const ids = key.startsWith('f:') ? decksUnder(key.slice(2), decks, folders).filter(eligible).map(x => x.id) : decks.has(key) && eligible(decks.get(key)) ? [key] : [];
    for (const id of ids) { const r = remaining.get(id) || 0; if (r) put(id, r / d); }
  }
  return out;
}
export function decksUnder(fid, decks, folders) {
  const ids = new Set([fid]);
  let grew = true;
  while (grew) { grew = false; for (const f of folders.values()) if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }
  return [...decks.values()].filter(d => !d.archived && ids.has(d.folder_id));
}

// Lo que hay que saber de un examen: días, nuevas que quedan, las que harían falta al día y si llega
// perDay: Map mazo → nuevas al día que le tocan con el plan
export function examStatus(key, { decks, folders, nodes, remaining, perDay, now = Date.now() }) {
  const days = daysTo(nodes[key]?.exam, now);
  if (days == null) return null;
  const ids = key.startsWith('f:') ? decksUnder(key.slice(2), decks, folders).map(d => d.id) : [key];
  const left = ids.reduce((a, id) => a + (remaining.get(id) || 0), 0);
  const per = ids.reduce((a, id) => a + (perDay.get(id) || 0), 0);
  const need = days > 0 ? Math.ceil(left / days) : left;
  return { days, left, per, need, late: days <= 0 ? left > 0 : left > 0 && per * days < left };
}

// «Prioridad a lo urgente»: peso según lo cerca que está el examen (sin examen, 1)
export function urgencyWeight(exam, now = Date.now()) {
  const d = daysTo(exam, now);
  if (d == null || d < 0) return 1;
  return Math.max(1, Math.min(8, Math.round(60 / Math.max(d, 7))));
}
