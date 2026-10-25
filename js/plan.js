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
  const late = days <= 0 ? left > 0 : left > 0 && per * days < left;
  // Justo: llega, pero con menos de un 20 % de margen
  return { days, left, per, need, late, tight: !late && days > 0 && left > 0 && per * days < left * 1.2 };
}

// «Prioridad a lo urgente»: peso según lo cerca que está el examen (sin examen, 1)
export function urgencyWeight(exam, now = Date.now()) {
  const d = daysTo(exam, now);
  if (d == null || d < 0) return 1;
  return Math.max(1, Math.min(8, Math.round(60 / Math.max(d, 7))));
}

// Un examen se considera cerca a 14 días o menos: Hoy lo dice y le da prioridad
export const EXAM_NEAR = 14;
// El examen más cercano que aún no ha pasado (de una lista o carpeta que exista): { key, exam, days } o null
export function nextExam(nodes, decks, folders, now = Date.now()) {
  return Object.entries(nodes).map(([key, n]) => ({ key, exam: n?.exam, days: daysTo(n?.exam, now) }))
    .filter(x => x.days != null && x.days >= 0 && (x.key.startsWith('f:') ? folders.has(x.key.slice(2)) : decks.has(x.key)))
    .sort((a, b) => a.days - b.days)[0] || null;
}
// Las listas de los exámenes cercanos (de hoy a EXAM_NEAR días): Set de ids
export function nearExamDecks(nodes, decks, folders, now = Date.now()) {
  const out = new Set();
  for (const [key, n] of Object.entries(nodes)) {
    const d = daysTo(n?.exam, now);
    if (d == null || d < 0 || d > EXAM_NEAR) continue;
    if (key.startsWith('f:')) { if (folders.has(key.slice(2))) for (const x of decksUnder(key.slice(2), decks, folders)) out.add(x.id); }
    else if (decks.has(key) && !decks.get(key).archived) out.add(key);
  }
  return out;
}

/* ===================== temporada: semana, días especiales y etapas ===================== */
// Las fechas son días de calendario «AAAA-MM-DD» en hora local (nunca marcas de tiempo): así el cambio de
// hora no mueve nada. plan.week = { mon..sun: minutos } (null = sin semana: la tanda de Ajustes),
// plan.special = [{ id, from, to, minutes, label, at }], plan.stages = [{ id, name, from, to, levels, order, at }].
// Lo borrado se queda como { id, deleted: true, at } para que otro dispositivo no lo resucite al juntar.
export const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEK_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WEEK_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const pad = n => String(n).padStart(2, '0');
export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const isDay = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
// El día como fecha a mediodía (lejos de cualquier cambio de hora)
export const dayDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (k, n) => { const d = dayDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const daysBetween = (a, b) => Math.round((dayDate(b) - dayDate(a)) / DAY);
export const weekdayOf = k => (dayDate(k).getDay() + 6) % 7;   // 0 = lunes … 6 = domingo
export const live = list => (Array.isArray(list) ? list : []).filter(x => x && !x.deleted);

// El día especial que cubre una fecha (si se pisan, el último creado)
export function specialOn(special, k) {
  return live(special).filter(s => isDay(s.from) && isDay(s.to) && s.from <= k && k <= s.to).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
}
// Minutos de un día: el día especial; si no, el de tu semana; null si no hay semana (se usa la tanda de Ajustes)
export function minutesOn(plan, k) {
  const s = specialOn(plan?.special, k);
  if (s) return Math.max(0, Number(s.minutes) || 0);
  const w = plan?.week;
  if (!w) return null;
  return Math.max(0, Number(w[WEEK[weekdayOf(k)]]) || 0);
}
// Minutos de un día normal (media de los días que no son libres); sin semana, los de la tanda
export function weekAverage(week, fallback = 10) {
  if (!week) return fallback;
  const on = WEEK.map(d => Number(week[d]) || 0).filter(m => m > 0);
  return on.length ? on.reduce((a, b) => a + b, 0) / on.length : fallback;
}
export const weekTotal = week => (week ? WEEK.reduce((a, d) => a + (Number(week[d]) || 0), 0) : 0);
// Nuevas de un día: las de Ajustes según sus minutos frente a un día normal, entre la mitad y el doble.
// Un día libre no da nuevas. Sin semana ni día especial, las de siempre.
export function newOn(plan, k, newPerDay, fallbackMin = 10) {
  const m = minutesOn(plan, k);
  if (m == null) return newPerDay;
  if (m === 0) return 0;
  const f = Math.min(2, Math.max(0.5, m / weekAverage(plan?.week, fallbackMin)));
  return Math.round(newPerDay * f);
}
// Nuevas de un día normal (para las cuentas del plan, no las de hoy): la media de los días de tu semana que tienen
// minutos. Sin semana, las de siempre. Así un día libre no deja el plan en «0 al día»
export function normalNew(plan, newPerDay, fallbackMin = 10) {
  const week = plan?.week;
  if (!week) return newPerDay;
  const avg = weekAverage(week, fallbackMin), days = WEEK.map(d => Number(week[d]) || 0).filter(m => m > 0);
  if (!days.length) return newPerDay;
  return Math.round(days.reduce((s, m) => s + Math.round(newPerDay * Math.min(2, Math.max(0.5, m / avg))), 0) / days.length);
}

// Etapas: cada una con su rango de fechas; la que cubre un día manda ese día (la primera por fecha)
export const LEVELS = [
  { id: 'paused', label: 'Pausa' }, { id: 'reviews', label: 'Repasar' }, { id: 'low', label: 'Poco' },
  { id: 'normal', label: 'Normal' }, { id: 'high', label: 'Mucho' },
];
// Poco, Normal y Mucho reparten 1 : 2 : 4 (Normal = el peso de siempre, 1)
const LEVEL_NODE = { paused: { state: 'paused' }, reviews: { state: 'reviews' }, low: { state: 'active', weight: 0.5 }, normal: { state: 'active', weight: 1 }, high: { state: 'active', weight: 2 } };
export const levelNode = id => LEVEL_NODE[id] || null;
export const levelLabel = id => LEVELS.find(l => l.id === id)?.label || '';
// El nivel que corresponde a un nodo de siempre (estado y peso)
export function levelOf(node) {
  const st = node?.state || 'active';
  if (st !== 'active') return st;
  const w = Number.isFinite(node?.weight) ? node.weight : 1;
  return w >= 1.5 ? 'high' : w <= 0.75 ? 'low' : 'normal';
}
// Los pesos de antes (porcentajes del deslizador de foco) pasan a niveles: en cada grupo de hermanos, según
// lo que se aparta de la media. Devuelve true si ha cambiado algo.
export function normalizeWeights(decks, folders, nodes) {
  const groups = new Map();
  const add = (parent, key) => { if (!groups.has(parent)) groups.set(parent, []); groups.get(parent).push(key); };
  for (const f of folders.values()) add(f.parent_id && folders.has(f.parent_id) ? f.parent_id : null, folderKey(f.id));
  for (const d of decks.values()) if (!d.archived) add(d.folder_id && folders.has(d.folder_id) ? d.folder_id : null, d.id);
  let changed = false;
  for (const keys of groups.values()) {
    if (!keys.some(k => Number.isFinite(nodes[k]?.weight) && ![0.5, 1, 2].includes(nodes[k].weight))) continue;
    const mean = keys.reduce((a, k) => a + weightOf(nodes, k), 0) / keys.length || 1;
    for (const k of keys) {
      const r = weightOf(nodes, k) / mean, n = nodes[k] || (nodes[k] = {});
      n.weight = r >= 1.5 ? 2 : r <= 0.67 ? 0.5 : 1;
      if (n.weight === 1) delete n.weight;
      if (!Object.keys(n).length) delete nodes[k];
      changed = true;
    }
  }
  return changed;
}
export const sortStages = stages => live(stages).filter(s => isDay(s.from) && isDay(s.to)).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
export function stageOn(stages, k) {
  return sortStages(stages).find(s => s.from <= k && k <= s.to) || null;
}
// Los nodos que mandan un día: los de siempre, con la etapa vigente encima y las reglas de los exámenes
// («la última semana, solo repasos» y lo que pasa después del examen)
export function nodesOn(plan, k) {
  const out = {};
  for (const [key, n] of Object.entries(plan?.nodes || {})) out[key] = { ...n };
  const st = stageOn(plan?.stages, k);
  if (st) for (const [key, lvl] of Object.entries(st.levels || {})) if (LEVEL_NODE[lvl]) out[key] = { ...(out[key] || {}), ...LEVEL_NODE[lvl] };
  for (const n of Object.values(out)) {
    if (!isDay(n.exam)) continue;
    const d = daysBetween(k, n.exam);
    if (d < 0 && n.after && LEVEL_NODE[n.after]) Object.assign(n, LEVEL_NODE[n.after]);
    else if (d >= 1 && d <= 7 && n.lastWeek && (n.state || 'active') === 'active') n.state = 'reviews';
  }
  return out;
}

// Orden de temas: en cada carpeta con orden, las nuevas salen solo de la primera lista que no está
// terminada (las listas de la carpeta que no están en el orden van al final). Devuelve el Set de listas
// que ese día no dan nuevas y, por carpeta, la lista que toca.
export function topicOrder(stage, decks, folders, fresh) {
  const blocked = new Set(), current = new Map();
  for (const [fid, list] of Object.entries(stage?.order || {})) {
    if (!folders.has(fid)) continue;
    const ids = orderedTopics(list, fid, decks, folders);
    const cur = ids.find(id => (fresh.get(id) || 0) > 0);
    if (cur) current.set(fid, cur);
    for (const id of ids) if (id !== cur) blocked.add(id);
  }
  return { blocked, current };
}
// Las listas de una carpeta en el orden de la etapa (las que no están en el orden, al final)
export function orderedTopics(list, fid, decks, folders) {
  const under = decksUnder(fid, decks, folders).map(d => d.id);
  const own = (list || []).map(x => x.deck).filter(id => under.includes(id));
  return [...own, ...under.filter(id => !own.includes(id))];
}

// Proyección día a día (solo nuevas: los repasos no se cuentan) desde «from» hasta «to», con la etapa,
// los minutos y las reglas de cada día. remaining: Map lista → nuevas por ver; limit(lista): tope propio al día.
// Devuelve { finish: Map lista → día en que la acabas, left(día): Map lista → nuevas que quedan al empezar ese día }.
export function simulate({ decks, folders, plan, newPerDay, fallbackMin = 10, remaining, from, to, limit = () => Infinity }) {
  const rem = new Map(remaining), finish = new Map(), snaps = new Map();
  for (const [id, n] of rem) if (!n) finish.set(id, addDays(from, -1));
  for (let k = from, i = 0; k <= to && i < 1500; k = addDays(k, 1), i++) {
    snaps.set(k, new Map(rem));
    const nodes = nodesOn(plan, k), { blocked } = topicOrder(stageOn(plan?.stages, k), decks, folders, rem);
    const avail = new Map();
    for (const [id, n] of rem) {
      const d = decks.get(id);
      if (!d || d.archived || !n || blocked.has(id) || deckState(d, folders, nodes) !== 'active') continue;
      avail.set(id, Math.min(n, limit(id)));
    }
    if (!avail.size) continue;
    const ok = d => (avail.get(d.id) || 0) > 0;
    const sh = shares(decks, folders, nodes, ok);
    const floors = new Map([...examFloors(decks, folders, nodes, rem, dayDate(k).getTime(), ok)].map(([id, f]) => [id, Math.ceil(f)]));
    const got = allocate(newOn(plan, k, newPerDay, fallbackMin), sh, avail, floors);
    for (const [id, n] of got) { const r = (rem.get(id) || 0) - n; rem.set(id, r); if (r <= 0 && !finish.has(id)) finish.set(id, k); }
  }
  return { finish, left: k => snaps.get(k) || (k > to ? rem : remaining) };
}
