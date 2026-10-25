// Del plan de ahora (nodos con estado, foco y examen; semana; días especiales; etapas) al plan nuevo (v: 2),
// organizado por exámenes. Función pura: devuelve un plan nuevo y no toca el de entrada. Se puede ejecutar
// varias veces: un plan que ya es v: 2 sale igual (salvo la copia del viejo, que se quita a los 60 días).
//   1. Cada nodes[k].exam pasa a ser un examen con scope esa carpeta o lista; conserva lastWeek y after.
//   2. week y special pasan a time sin cambios.
//   3. Niveles: Pausa y Repasar van a free (o a exclude si están dentro de un examen); Poco, Normal y Mucho
//      pasan a porcentajes 1 : 2 : 4 en split.shares, con split.mode = 'manual' solo si no eran todos Normal.
//   4. stages se queda igual.
//   5. Una copia del plan viejo en plan.v1 durante 60 días.
import { addDays, isDay, levelOf, decksUnder, live } from './plan.js';
import { toPercent } from './plan2.js';

export const V1_DAYS = 60;
const asMap = x => (x instanceof Map ? x : new Map((x || []).map(o => [o.id, o])));
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
// El id de un examen sale de su carpeta o lista: así migrar dos veces (o en dos dispositivos) da el mismo
export const examIdFor = key => 'ex-' + key.replace(/^f:/, 'f-');
const AFTER = { paused: 'pause', reviews: 'keep' };
const SHARE = { low: 1, normal: 2, high: 4 };

export function emptyPlan2(today, at = 0) {
  return {
    v: 2,
    time: { week: null, special: [], today: null, pause: null, updated_at: at },
    exams: [],
    split: { mode: 'auto', shares: {}, updated_at: at },
    free: {},
    caps: { newPerDay: null, reviewsPerDay: null },
    weekly: { on: true, seen: null },
    stages: [],
    history: [],
  };
}

// migrate(plan, { today, decks, folders, at }) → plan v: 2
export function migrate(old, { today, decks = [], folders = [], at = Date.now() } = {}) {
  if (old?.v === 2) {
    const p = clone(old);
    if (p.v1 && today && isDay(p.v1.until) && today > p.v1.until) delete p.v1;
    return p;
  }
  const D = asMap(decks), F = asMap(folders), src = clone(old) || {};
  const nodes = src.nodes && typeof src.nodes === 'object' ? src.nodes : {};
  const p = emptyPlan2(today, at);
  p.time.week = src.week && typeof src.week === 'object' ? { ...src.week } : null;
  p.time.special = Array.isArray(src.special) ? clone(src.special) : [];
  p.stages = Array.isArray(src.stages) ? clone(src.stages) : [];
  for (const k of ['simGoal', 'sim', 'startDone', 'lateOk']) if (src[k] !== undefined) p[k] = clone(src[k]);

  const exists = k => (k.startsWith('f:') ? F.has(k.slice(2)) : D.has(k));
  const nameOf = k => (k.startsWith('f:') ? F.get(k.slice(2))?.name : D.get(k)?.name) || (k.startsWith('f:') ? 'Carpeta' : 'Lista');
  const decksOf = k => (k.startsWith('f:') ? decksUnder(k.slice(2), D, F).map(d => d.id) : D.has(k) ? [k] : []);
  // 1 · los exámenes
  for (const [k, n] of Object.entries(nodes)) {
    if (!isDay(n?.exam) || !exists(k)) continue;
    const fid = k.startsWith('f:') ? k.slice(2) : null;
    // El orden de temas de la última etapa que lo tenga, como orden del camino
    const st = live(p.stages).filter(s => fid && s.order?.[fid]?.length).sort((a, b) => String(a.from).localeCompare(String(b.from))).at(-1);
    p.exams.push({
      id: examIdFor(k), name: nameOf(k),
      scope: { folders: fid ? [fid] : [], decks: fid ? [] : [k], pages: [] },
      exclude: [], date: n.exam, approx: false,
      order: st ? st.order[fid].map(o => o.deck) : [],
      mode: 'seq', shares: {}, fixed: {}, known: [], boost: {},
      lastWeek: !!n.lastWeek, retention: 0.9, retentionLast: 0.95,
      after: AFTER[n.after] || null, updated_at: at,
    });
  }
  p.exams.sort((a, b) => a.date.localeCompare(b.date));
  // 3 · los niveles
  const examOf = deckId => p.exams.find(e => (e.scope.decks.includes(deckId)) || e.scope.folders.some(fid => decksUnder(fid, D, F).some(d => d.id === deckId)));
  const shares = {};
  for (const [k, n] of Object.entries(nodes)) {
    if (!n || !exists(k)) continue;
    const lvl = levelOf(n), ex = p.exams.find(e => e.id === examIdFor(k));
    if (lvl === 'paused' || lvl === 'reviews') {
      // Dentro de un examen (no el examen entero): sale del examen; si no, a lo que no tiene examen
      const ids = decksOf(k), inside = !ex && ids.length && ids.every(id => examOf(id));
      if (inside) for (const id of ids) { const e = examOf(id); if (!e.exclude.includes(id)) e.exclude.push(id); }
      else p.free[k] = lvl;
    } else if (ex) shares[ex.id] = SHARE[lvl];
  }
  for (const e of p.exams) if (!shares[e.id]) shares[e.id] = SHARE.normal;
  if (p.exams.length) {
    const pct = toPercent(new Map(Object.entries(shares)));
    p.split.shares = Object.fromEntries(pct);
    if (Object.values(shares).some(v => v !== SHARE.normal)) p.split.mode = 'manual';
  }
  // 5 · la copia del plan viejo
  p.v1 = { saved: today || null, until: today ? addDays(today, V1_DAYS) : null, plan: src };
  return p;
}
