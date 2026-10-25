// Flaski · el plan de estudio dentro de la app: arma el estado del motor (plan2.js) con los datos de S y responde a
// lo que preguntan Hoy, la tanda, la Biblioteca y el Plan. El plan está en S.prefs.plan (v: 2); el de antes se
// migra al entrar (ver migrateLoaded) y queda una copia en plan.v1 durante 60 días.
import { S, hooks, extraNew } from './comun.js';
import { today, forecast, minutesOn, liveExams } from './plan2.js';
import { migrate, emptyPlan2 } from './plan2-migrar.js';
import { dayKey, isDay, stageOn } from './plan.js';
import { startOfDay } from './srs.js';
import { whyCard } from './pantallas/plan-tiempo.js';

export const P2 = true;

const ctx = () => ({ today: dayKey(), decks: S.decks, folders: S.folders });
let migrated = null;
// El plan para leer (si aún no se ha migrado, migrado en memoria, sin guardar)
export function plan2() {
  const p = S.prefs.plan;
  if (p?.v === 2) return p;
  const key = JSON.stringify(p) + dayKey();
  if (migrated?.key !== key) migrated = { key, plan: migrate(p, { ...ctx(), at: 0 }) };
  return migrated.plan;
}
// El plan para cambiarlo: el de S.prefs (migrado si hacía falta)
export function editPlan2() {
  if (S.prefs.plan?.v !== 2) S.prefs.plan = JSON.parse(JSON.stringify(plan2()));
  return S.prefs.plan;
}
// Al entrar (con las listas y carpetas ya cargadas): el plan de antes pasa al nuevo, y la copia del de antes se
// quita a los 60 días. Quien probó el plan nuevo con el interruptor (prefs.plan2) se queda con el suyo.
// Devuelve true si ha cambiado algo (para guardarlo).
export function migrateLoaded() {
  const p = S.prefs.plan, tried = S.prefs.plan2;
  if (p?.v === 2) {
    const m = migrate(p, ctx()), changed = !!p.v1 !== !!m.v1 || tried !== undefined;
    S.prefs.plan = m; delete S.prefs.plan2;
    return changed;
  }
  S.prefs.plan = tried?.v === 2 ? { ...JSON.parse(JSON.stringify(tried)), v1: migrate(p || emptyPlan2(), ctx()).v1 } : migrate(p || emptyPlan2(), ctx());
  delete S.prefs.plan2;
  return true;
}

// Lo hecho hoy: nuevas y repasos (por el progreso) y las respuestas con su tiempo
export function doneToday(now = Date.now()) {
  const t0 = startOfDay(now);
  let fresh = 0, reviews = 0, n = 0, ms = 0;
  for (const p of S.progress.values()) {
    if (!(p.last >= t0)) continue;
    if (p.firstSeen >= t0) fresh++; else reviews++;
  }
  for (const e of S.events) if (e.t >= t0) { n++; ms += Math.min(120e3, Number(e.ms) || 0); }
  return { new: fresh, reviews, n, ms };
}
// Cuándo ha cambiado el progreso (se cambia en el sitio): las cuentas del motor se rehacen solo entonces
const stockKey = () => `${S.progress.size}|${S.cards.size}|${S.events.length}|${S.events.at(-1)?.t || 0}`;
export function stateNow() {
  return {
    plan: plan2(), today: dayKey(), decks: S.decks, folders: S.folders, pages: S.pages, cards: S.cards, progress: S.progress,
    stockKey: stockKey(), events: S.events, newPerDay: S.newPerDay, fallbackMin: S.prefs.study.tandaMin,
    done: doneToday(), extraNew: extraNew(),
  };
}
// Lo de hoy (today() del motor), calculado una vez mientras no cambie nada
let memo = null;
export function todayPlan() {
  const st = stateNow(), key = JSON.stringify([st.plan, st.today, st.stockKey, st.newPerDay, st.done, st.extraNew, st.fallbackMin, S.decks.size, S.folders.size]);
  if (memo?.key !== key) memo = { key, value: siblings(today(st)) };
  return memo.value;
}
// Hermanas (ida y vuelta de una nota): como en la tanda, una sola por día. Si una ya salió hoy o toca repasarla,
// la otra (nueva o repaso) espera; de las nuevas de una nota, una. Así Hoy dice lo mismo que la tanda.
function siblings(t) {
  if (!S.prefs.study.burySiblings) return t;
  const t0 = startOfDay(), end = t0 + 864e5, seen = new Set(), dueNotes = new Set(), fresh = new Map(), freshNotes = new Set();
  let extraDue = 0;
  for (const c of S.cards.values()) { const p = S.progress.get(c.id); if (c.note_id && p && p.last >= t0 && !(p.due < end)) seen.add(c.note_id); }
  for (const c of S.cards.values()) {
    const p = S.progress.get(c.id);
    if (!p || !(p.due < end) || !c.note_id) continue;
    if (seen.has(c.note_id) || dueNotes.has(c.note_id)) extraDue++; else dueNotes.add(c.note_id);
  }
  for (const c of S.cards.values()) {
    if (S.progress.get(c.id)) continue;
    if (c.note_id) { if (seen.has(c.note_id) || dueNotes.has(c.note_id) || freshNotes.has(c.note_id)) continue; freshNotes.add(c.note_id); }
    fresh.set(c.deck_id, (fresh.get(c.deck_id) || 0) + 1);
  }
  const newBy = {};
  for (const [id, n] of Object.entries(t.newBy)) { const q = Math.min(n, fresh.get(id) || 0); if (q > 0) newBy[id] = q; }
  const nNew = Object.values(newBy).reduce((a, b) => a + b, 0), reviews = Math.max(0, t.reviews - extraDue);
  if (nNew === t.new && reviews === t.reviews) return t;
  return { ...t, newBy, new: nNew, reviews, total: reviews + nNew, done: reviews === 0 && nNew === 0 };
}
let fcMemo = null;
export function forecastNow() {
  const st = stateNow(), key = JSON.stringify([st.plan, st.today, st.stockKey, st.newPerDay, st.fallbackMin, S.decks.size, S.folders.size]);
  if (fcMemo?.key !== key) fcMemo = { key, value: forecast(st) };
  return fcMemo.value;
}
// Minutos de hoy: «hoy solo tengo…», la pausa, el día especial o tu semana (null sin semana: los de la tanda)
export function minutesToday(k = dayKey()) {
  const p = plan2(), t = p.time || {};
  if (!t.week && t.today?.day !== k && !(t.pause?.from <= k && k <= t.pause?.to) && !(t.special || []).some(s => !s.deleted && s.from <= k && k <= s.to)) return null;
  return minutesOn(p, k, S.prefs.study.tandaMin);
}

// Cómo está una lista hoy: 'paused' (no entra nada), 'reviews' (solo repasos) o 'active'
const RANK = { active: 0, reviews: 1, paused: 2 };
const LEVEL_STATE = { paused: 'paused', reviews: 'reviews' };
export function deckStateNow(d, k = dayKey()) {
  if (!d) return 'active';
  const p = plan2();
  let st = 'active';
  const up = s => { if (s && RANK[s] > RANK[st]) st = s; };
  // Lo que no tiene examen (o lo que eliges a mano), de la lista o de sus carpetas; y la etapa de hoy
  const stage = stageOn(p.stages, k), seen = new Set();
  up(p.free?.[d.id]); up(LEVEL_STATE[stage?.levels?.[d.id]]);
  for (let fid = d.folder_id; fid && S.folders.has(fid) && !seen.has(fid); fid = S.folders.get(fid).parent_id) {
    seen.add(fid); up(p.free?.['f:' + fid]); up(LEVEL_STATE[stage?.levels?.['f:' + fid]]);
  }
  // Pasado el examen, si quedó en pausa o archivado (y no está en otro examen que siga)
  const fc = forecastNow(), mine = fc.exams.filter(e => e.topics.some(t => t.id === d.id && t.state !== 'exclude'));
  if (mine.length && mine.every(e => e.date && e.date < k && ['pause', 'archive'].includes(liveExams(p).find(x => x.id === e.id)?.after))) up('paused');
  return st;
}
// Las listas de los exámenes cercanos (de hoy a 14 días): van primero en la tanda
export const EXAM_NEAR = 14;
export function nearDecksNow(k = dayKey()) {
  const out = new Set();
  for (const e of forecastNow().exams) {
    if (!isDay(e.date) || e.date < k || e.days > EXAM_NEAR) continue;
    for (const t of e.topics) if (t.state !== 'exclude') out.add(t.id);
  }
  return out;
}

// Lo que comun.js y la tanda le preguntan al plan
hooks.plan2 = {
  minutes: () => minutesToday(),
  // Nuevas de cada lista: las de hoy según el motor; «steady», las de un día normal (el próximo con tiempo)
  quota(steady) {
    if (!steady) return new Map(Object.entries(todayPlan().newBy));
    const day = forecastNow().days.find((d, i) => i > 0 && d.minutes > 0);
    return new Map(Object.entries(day?.newBy || {}));
  },
  dayDone: () => todayPlan().dayDone,
  why: c => whyCard(c),
  state: d => deckStateNow(d),
  near: () => nearDecksNow(),
  // Cuántas preguntas caben en una tanda de N minutos con lo de hoy: los repasos primero y, si sobra, nuevas
  size(minutes) {
    const t = todayPlan(), { secNew, secReview } = t.pace, budget = minutes * 60;
    const r = Math.min(t.reviews, Math.floor(budget / secReview)), n = Math.min(t.new, Math.floor((budget - r * secReview) / secNew));
    return Math.max(1, r + Math.max(0, n));
  },
};
