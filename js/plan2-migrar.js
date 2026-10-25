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
    // El espejo en v1 y la copia (de withMirror) son solo para la nube
    for (const k of ['nodes', 'week', 'special']) delete p[k];
    if (p.sim?.__v2) { p.sim = { ...p.sim }; delete p.sim.__v2; }
    if (p.v1 && today && isDay(p.v1.until) && today > p.v1.until) delete p.v1;
    return p;
  }
  // Un v1 que escribió una versión vieja encima de un plan nuevo: el plan nuevo de la copia, con lo cambiado allí
  if (old?.sim?.__v2?.v === 2) {
    const p = absorbV1(old.sim.__v2, old, old.sim.__v2, { decks, folders, at });
    if (!p.v1 && today) p.v1 = { saved: today, until: addDays(today, V1_DAYS), plan: clone(old) };
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

/* ===================== dos dispositivos, versión vieja y nueva ===================== */
// Una versión vieja de la app (plan v1) conserva solo las claves del plan que conoce (nodes, week, special, stages,
// simGoal, sim, startDone, lateOk) y, de sim, todo lo que haya dentro. Por eso, al guardar en la nube, el plan nuevo
// lleva también un espejo en v1 (para que la versión vieja siga viendo los exámenes y la semana) y una copia de sí
// mismo en sim.__v2 (que la versión vieja guarda sin tocar). Si después la vieja escribe su v1, la nueva lo
// compara con el espejo de esa copia y aplica solo lo que se cambió allí (lo más reciente); el resto del v2 sigue.
const AFTER_BACK = { pause: 'paused', archive: 'paused', keep: 'reviews' };
const keyOf = e => (e.scope?.folders?.[0] ? 'f:' + e.scope.folders[0] : e.scope?.decks?.[0] || null);
const unionAt = (a = [], b = []) => {
  const m = new Map();
  for (const x of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) { if (!x || x.id == null) continue; const o = m.get(x.id); if (!o || (x.at || 0) >= (o.at || 0)) m.set(x.id, x); }
  return [...m.values()];
};
// El plan nuevo, como lo vería una versión vieja
export function toV1(p) {
  const nodes = {};
  for (const e of live(p?.exams)) {
    const k = keyOf(e);
    if (!k || !isDay(e.date)) continue;
    nodes[k] = { exam: e.date, ...(e.lastWeek ? { lastWeek: true } : {}), ...(AFTER_BACK[e.after] ? { after: AFTER_BACK[e.after] } : {}) };
  }
  for (const [k, st] of Object.entries(p?.free || {})) if (st === 'paused' || st === 'reviews') nodes[k] = { ...(nodes[k] || {}), state: st };
  return { nodes, week: p?.time?.week ?? null, special: clone(p?.time?.special || []), stages: clone(p?.stages || []) };
}
// Lo que se guarda en la nube: el plan nuevo con su espejo en v1 y su copia en sim.__v2 (sin historial ni copias)
export function withMirror(p) {
  if (p?.v !== 2) return p;
  const { history, v1, nodes, week, special, ...rest } = p, back = clone(rest);
  if (back.sim) delete back.sim.__v2;
  return { ...p, ...toV1(p), sim: { ...(p.sim || {}), __v2: back } };
}
// El plan nuevo «target» con lo que la versión vieja cambió en «v1» respecto a la copia de la que partía («base»)
export function absorbV1(target, v1, base = v1?.sim?.__v2, { decks = [], folders = [], at = Date.now() } = {}) {
  const p = clone(target), was = toV1(base || target), D = asMap(decks), F = asMap(folders);
  const now = { nodes: v1?.nodes || {}, week: v1?.week ?? null, special: v1?.special || [], stages: v1?.stages || [] };
  p.exams = p.exams || []; p.free = { ...(p.free || {}) }; p.time = { ...(p.time || {}) };
  for (const k of new Set([...Object.keys(was.nodes), ...Object.keys(now.nodes)])) {
    const a = was.nodes[k] || {}, b = now.nodes[k] || {};
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    // El examen: fecha, última semana o después
    if (a.exam !== b.exam || !!a.lastWeek !== !!b.lastWeek || a.after !== b.after) {
      const i = p.exams.findIndex(e => !e.deleted && keyOf(e) === k);
      if (!isDay(b.exam)) { if (i >= 0) p.exams[i] = { id: p.exams[i].id, deleted: true, updated_at: at }; }
      else if (i >= 0) p.exams[i] = { ...p.exams[i], date: b.exam, lastWeek: !!b.lastWeek, after: AFTER[b.after] || (p.exams[i].after === 'archive' && b.after === 'paused' ? 'archive' : null), updated_at: at };
      else {
        const fid = k.startsWith('f:') ? k.slice(2) : null, name = (fid ? F.get(fid)?.name : D.get(k)?.name) || (fid ? 'Carpeta' : 'Lista');
        const old = p.exams.findIndex(e => e.id === examIdFor(k));
        const e = { id: examIdFor(k), name, scope: { folders: fid ? [fid] : [], decks: fid ? [] : [k], pages: [] }, exclude: [], date: b.exam, approx: false, order: [], mode: 'seq', shares: {}, fixed: {}, known: [], boost: {}, lastWeek: !!b.lastWeek, retention: 0.9, retentionLast: 0.95, after: AFTER[b.after] || null, updated_at: at };
        if (old >= 0) p.exams[old] = e; else p.exams.push(e);
      }
    }
    // Pausa o solo repasos de lo que no tiene examen
    if (a.state !== b.state) { if (b.state === 'paused' || b.state === 'reviews') p.free[k] = b.state; else delete p.free[k]; }
  }
  if (JSON.stringify(was.week) !== JSON.stringify(now.week)) { p.time.week = now.week ? { ...now.week } : null; p.time.updated_at = at; }
  p.time.special = unionAt(p.time.special, now.special);
  p.stages = unionAt(p.stages, now.stages);
  if (p.sim) { p.sim = { ...p.sim }; delete p.sim.__v2; }
  for (const k of ['nodes', 'week', 'special']) delete p[k];
  return p;
}
