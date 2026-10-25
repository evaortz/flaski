// Plan de estudio nuevo (v: 2): el motor, sin pantalla. Mide tu ritmo, prevé los repasos, calcula cuántas
// nuevas caben cada día, las reparte entre exámenes y temas, simula hasta el último examen y busca arreglos.
// Plan, Hoy, la tanda y el repaso del domingo le preguntan a él, así que no pueden contradecirse.
// Funciones puras: reciben los datos y devuelven el plan día a día (ver docs/rediseno/plan2/).
//
// state = {
//   plan,                  // settings.prefs.plan con v: 2 (ver plan2-migrar.js)
//   today,                 // 'AAAA-MM-DD'
//   decks, folders,        // arrays o Map: { id, folder_id, name, archived } · { id, parent_id, name, position }
//   pages,                 // opcional: { id, deck_id } (un apunte del examen entra con sus preguntas)
//   cards, progress,       // arrays o Map: { id, deck_id } · Map id → { due, interval, stability, difficulty } (ms)
//   events,                // opcional: las respuestas, para medir el ritmo
//   pace,                  // opcional: { secNew, secReview } (si no, medirRitmo(events))
//   done,                  // opcional: lo hecho hoy { new, reviews }
//   fallbackMin,           // minutos de un día si no hay semana (los de la tanda de Ajustes)
//   newPerDay,             // las nuevas al día de Ajustes: el tope (null: sin tope, mandan los minutos)
// }
// La simulación cuenta preguntas por lista y día, no pregunta a pregunta: así cabe en unos milisegundos.
import { DAY, startOfDay } from './srs.js';
import { WEEK, addDays, daysBetween, weekdayOf, dayDate, isDay, live, specialOn, stageOn, allocate } from './plan.js';
import { initStability, initDifficulty, nextDifficulty, recallStability, forgetStability, shortTermStability, intervalFor, memoryOf } from './fsrs.js';

export const PACE_DEFAULT = { secNew: 40, secReview: 12 };
const PACE_LAST = 300, PACE_MIN = 50, PACE_MAX_MS = 5 * 60e3;
const H_MAX = 730;              // como mucho, dos años por delante
const LAST_WEEK = 7;
const JUST = 7;                 // con menos de una semana de repaso antes del examen, «justo»
const FIRST_FAIL = 0.3;         // parte de las nuevas que se fallan la primera vez (vuelven al día siguiente)
const AUTO_NEAR = 80;           // automático: el 80 % al examen más cercano con temario por ver
const STAGE_W = { low: 1, normal: 2, high: 4 };

// El interruptor de pruebas «plan2»: ?plan2 en la dirección o localStorage['flaski-plan2'] = '1'
export function plan2On(loc = globalThis.location, store = globalThis.localStorage) {
  try { if (new URLSearchParams(loc?.search || '').has('plan2')) return true; } catch {}
  try { return store?.getItem('flaski-plan2') === '1'; } catch { return false; }
}

/* ===================== 1 · el ritmo ===================== */
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Segundos por pregunta nueva (sumando sus vueltas del mismo día) y por repaso, con las últimas 300 respuestas.
// Las de más de 5 min son pausas y no cuentan. Con menos de 50, 40 s y 12 s.
export function medirRitmo(events = []) {
  const ok = (Array.isArray(events) ? events : []).filter(e => e && e.ms > 0 && e.ms <= PACE_MAX_MS && e.ts)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts))).slice(-PACE_LAST);
  if (ok.length < PACE_MIN) return { ...PACE_DEFAULT, measured: false, n: ok.length };
  const fresh = new Map(), rev = [];
  for (const e of ok) {
    const k = e.card_id + '@' + String(e.ts).slice(0, 10);
    if (e.state === 'new') fresh.set(k, (fresh.get(k) || 0) + e.ms);
    else if (fresh.has(k)) fresh.set(k, fresh.get(k) + e.ms);     // otra vuelta de una nueva, el mismo día
    else if (e.state === 'review' || e.state === 'relearning') rev.push(e.ms);
  }
  const n = median([...fresh.values()]), r = median(rev);
  return {
    // Como poco, 1 s: con 0 s el día tendría sitio infinito (y las cuentas, NaN)
    secNew: n ? Math.max(1, Math.round(n / 1000)) : PACE_DEFAULT.secNew,
    secReview: r ? Math.max(1, Math.round(r / 1000)) : PACE_DEFAULT.secReview,
    measured: true, n: ok.length,
  };
}

/* ===================== 2 · los repasos previstos ===================== */
// Repasos que genera de media una pregunta nueva en los días siguientes, con los intervalos de FSRS para la
// retención elegida: la mayoría va bien (+3, +14, +49… con el 90 %) y una parte se falla y vuelve antes.
// Es una media (un árbol de aciertos y fallos con sus probabilidades), no una simulación pregunta a pregunta.
const kernels = new Map();
export function newKernel(r = 0.9) {
  const key = Math.round(r * 1000);
  if (kernels.has(key)) return kernels.get(key);
  const K = new Float64Array(H_MAX + 1);
  const ivl = S => Math.max(1, Math.round(intervalFor(S, r)));
  const go = (S, D, t, w, prev) => {
    if (w < 0.002) return;
    const iv = Math.max(ivl(S), prev ? prev + 1 : 1), t2 = t + iv;
    if (t2 > H_MAX) return;
    K[t2] += w;
    go(recallStability(D, S, r, 3), nextDifficulty(D, 3), t2, w * r, iv);
    go(shortTermStability(forgetStability(D, S, r), 3), nextDifficulty(D, 1), t2, w * (1 - r), 0);
  };
  go(initStability(3), initDifficulty(3), 0, 1 - FIRST_FAIL, 0);
  go(shortTermStability(initStability(1), 3), nextDifficulty(initDifficulty(1), 3), 0, FIRST_FAIL, 0);
  // Solo los días con carga (unos pocos): sumar una nueva es recorrer esta lista
  const sparse = [];
  K.forEach((v, i) => { if (v > 0.001) sparse.push([i, v]); });
  kernels.set(key, sparse);
  return sparse;
}

const asMap = x => (x instanceof Map ? x : new Map((x || []).map(o => [o.id, o])));
const asList = x => (x instanceof Map ? [...x.values()] : x || []);
const progressOf = x => (x instanceof Map ? x : new Map((x || []).map(p => [p.card_id, p])));
const ms = v => (typeof v === 'number' ? v : Date.parse(v));
const dayIndex = (t, t0) => Math.round((startOfDay(t) - t0) / DAY);

// Lo que hay en cada lista: nuevas sin ver y, por día, los repasos que ya tocan según el progreso (con sus
// repasos siguientes). Se calcula una vez por datos y retención.
const stockMemo = new WeakMap();
export function stock(state, r = 0.9) {
  // stockKey: quien llama dice cuándo ha cambiado el progreso (la app lo cambia en el sitio, sin copiarlo)
  const key = `${state.today}|${r}|${state.stockKey ?? ''}`, holder = state.progress || state.cards;
  const hit = holder && typeof holder === 'object' && stockMemo.get(holder);
  if (hit?.key === key && hit.cards === state.cards) return hit.value;
  const t0 = startOfDay(dayDate(state.today).getTime()), prog = progressOf(state.progress);
  const fresh = new Map(), total = new Map(), seen = new Map(), base = new Map();
  const row = id => { let a = base.get(id); if (!a) base.set(id, a = new Float64Array(H_MAX + 1)); return a; };
  const ivl = S => Math.max(1, Math.round(intervalFor(S, r)));
  for (const c of asList(state.cards)) {
    if (!c || c.deleted) continue;
    const id = c.deck_id;
    total.set(id, (total.get(id) || 0) + 1);
    const p = prog.get(c.id);
    if (!p) { fresh.set(id, (fresh.get(id) || 0) + 1); continue; }
    seen.set(id, (seen.get(id) || 0) + 1);
    const a = row(id);
    let { S, D } = memoryOf(p, r), iv = p.interval || 0;
    let i = Math.max(0, dayIndex(ms(p.due), t0));
    while (i <= H_MAX) {
      a[i] += 1;
      if (i + 1 <= H_MAX) a[i + 1] += 1 - r;          // las que se fallan vuelven al día siguiente
      S = iv > 0 ? recallStability(D, S, r, 3) : Math.max(S, initStability(3));
      D = nextDifficulty(D, 3);
      iv = Math.max(ivl(S), iv + 1);
      i += iv;
    }
  }
  const value = { fresh, total, seen, base };
  if (holder && typeof holder === 'object') stockMemo.set(holder, { key, cards: state.cards, value });
  return value;
}

/* ===================== el plan: exámenes, temas y días ===================== */
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { numeric: true });
const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0) || byName(a, b);
// Las listas de una carpeta en su orden: las suyas por nombre y después las de cada subcarpeta
function folderDecks(fid, decks, folders, seen = new Set()) {
  if (seen.has(fid)) return [];
  seen.add(fid);
  const own = [...decks.values()].filter(d => d.folder_id === fid).sort(byName).map(d => d.id);
  const subs = [...folders.values()].filter(f => f.parent_id === fid && f.id !== fid).sort(byPos);
  return [...own, ...subs.flatMap(f => folderDecks(f.id, decks, folders, seen))];
}
const usable = d => d && !d.archived && !d.deleted;
// Las listas de un examen, en el orden del camino (lo de `order` primero; el resto, el de la carpeta)
export function examTopics(exam, ctx) {
  const { decks, folders, pages } = ctx, out = [];
  const add = id => { if (usable(decks.get(id)) && !out.includes(id)) out.push(id); };
  for (const fid of exam.scope?.folders || []) if (folders.has(fid)) folderDecks(fid, decks, folders).forEach(add);
  for (const id of exam.scope?.decks || []) add(id);
  for (const pid of exam.scope?.pages || []) { const p = pages.get(pid); if (p?.deck_id) add(p.deck_id); }
  const order = (exam.order || []).filter(id => out.includes(id));
  return [...order, ...out.filter(id => !order.includes(id))];
}
export const liveExams = plan => live(plan?.exams).filter(e => e.id);
function climbKey(map, deck, folders) {
  if (!map) return null;
  if (map[deck.id] != null) return { key: deck.id, v: map[deck.id] };
  const seen = new Set();
  for (let fid = deck.folder_id; fid && folders.has(fid) && !seen.has(fid); fid = folders.get(fid).parent_id) {
    seen.add(fid);
    const k = 'f:' + fid;
    if (map[k] != null) return { key: k, v: map[k] };
  }
  return null;
}

// Los minutos de cada día: la pausa, «hoy solo tengo…», el día especial y, si no, tu semana
export function minutesOn(plan, k, fallback = 10) {
  const t = plan?.time || {};
  if (t.pause && isDay(t.pause.from) && isDay(t.pause.to) && t.pause.from <= k && k <= t.pause.to) return 0;
  if (t.today?.day === k && Number.isFinite(Number(t.today.minutes))) return Math.max(0, Number(t.today.minutes));
  const s = specialOn(t.special, k);
  if (s) return Math.max(0, Number(s.minutes) || 0);
  if (!t.week) return fallback;
  return Math.max(0, Number(t.week[WEEK[weekdayOf(k)]]) || 0);
}

// Todo lo que no cambia de un día a otro, preparado una vez por simulación
function prepare(state) {
  const plan = state.plan || {}, decks = asMap(state.decks), folders = asMap(state.folders), pages = asMap(state.pages);
  const ctx = { decks, folders, pages };
  const exams = liveExams(plan);
  const r = Math.max(0.7, Math.min(0.99, Math.max(0.9, ...exams.map(e => Number(e.retention) || 0.9))));
  const st = stock(state, r), pace = state.pace || medirRitmo(state.events);
  const t = state.today;
  const ex = exams.map(e => {
    const topics = examTopics(e, ctx), exclude = new Set(e.exclude || []), known = new Set(e.known || []), later = new Set(e.later || []);
    const study = topics.filter(id => !exclude.has(id) && !known.has(id) && !later.has(id));
    const date = isDay(e.date) ? daysBetween(t, e.date) : null;
    const newEnd = date == null ? Infinity : date - 1 - (e.lastWeek ? LAST_WEEK : 0);
    const hold = isDay(e.hold) ? daysBetween(t, e.hold) : -1;
    const fixed = Object.entries(e.fixed || {}).filter(([id, k]) => study.includes(id) && isDay(k)).map(([id, k]) => [id, daysBetween(t, k)]);
    return { e, id: e.id, topics, study, inScope: new Set(topics.filter(id => !exclude.has(id))), later: [...later].filter(id => topics.includes(id)), date, newEnd, hold, fixed, mode: e.mode === 'parallel' ? 'parallel' : 'seq', shares: e.shares || {} };
  });
  let H = Math.max(0, ...ex.map(x => (x.date == null ? 0 : x.date)), ...live(plan.stages).filter(s => isDay(s.to)).map(s => daysBetween(t, s.to)));
  if (!ex.some(x => x.date != null && x.date >= 0)) H = Math.max(H, 120);
  H = Math.min(H_MAX, H);
  // Días: clave, minutos y etapa
  const keys = [], mins = new Float64Array(H + 1), studyCum = new Int32Array(H + 2);
  for (let i = 0, k = t; i <= H; i++, k = addDays(k, 1)) {
    keys.push(k); mins[i] = minutesOn(plan, k, state.fallbackMin ?? 10);
    studyCum[i + 1] = studyCum[i] + (mins[i] > 0 ? 1 : 0);
  }
  // Cada lista: si es de un examen, si queda fuera de todos («lo que no tiene examen») y cuándo dejan de contar sus repasos
  const inExam = new Map();
  for (const x of ex) for (const id of x.topics) { if (!inExam.has(id)) inExam.set(id, []); inExam.get(id).push(x); }
  const deckInfo = new Map();
  for (const d of decks.values()) {
    if (!usable(d)) continue;
    const free = climbKey(plan.free, d, folders)?.v || 'active';
    const xs = (inExam.get(d.id) || []).filter(x => x.inScope.has(d.id));
    let stop = free === 'paused' ? 0 : Infinity;
    if (stop && xs.length && xs.every(x => x.date != null && ['pause', 'archive'].includes(x.e.after))) stop = Math.max(...xs.map(x => x.date)) + 1;
    deckInfo.set(d.id, { free, stop, xs, noExam: !(inExam.get(d.id) || []).length });
  }
  return { plan, ctx, ex, r, st, pace, H, keys, mins, studyCum, deckInfo };
}

/* ===================== 3 y 4 · cuánto cabe y el reparto ===================== */
// Repartir «total» entre partes (Map id → peso), sin pasar de lo que cabe en cada una; lo que sobra va a los demás
function spread(total, sh, avail) {
  const got = allocate(total, sh, avail);
  let left = total - [...got.values()].reduce((a, b) => a + b, 0);
  if (left > 0) {
    const rest = new Map([...avail].filter(([id, n]) => n - (got.get(id) || 0) > 0).map(([id]) => [id, 1]));
    const room = new Map([...avail].map(([id, n]) => [id, n - (got.get(id) || 0)]));
    for (const [id, n] of allocate(left, rest, room)) { got.set(id, (got.get(id) || 0) + n); left -= n; }
  }
  return got;
}
const add = (m, id, n) => { if (n > 0) m.set(id, (m.get(id) || 0) + n); };

// Dentro de un examen: primero lo justo para llegar a las fechas fijadas; después, un tema tras otro (en el
// orden del camino) o varios a la vez (sus porcentajes, que se reparten entre los que quedan cuando uno acaba)
function withinExam(x, budget, i, rem, P, only) {
  const out = new Map(), room = id => (rem.get(id) || 0) - (out.get(id) || 0);
  const topics = x.study.filter(id => (!only || only.has(id)) && rem.get(id) > 0);
  let b = budget;
  for (const [id, f] of x.fixed) {
    if (b <= 0 || !topics.includes(id) || room(id) <= 0) continue;
    const days = f >= i ? Math.max(1, P.studyCum[Math.min(f, P.H) + 1] - P.studyCum[i]) : 1;
    const k = Math.min(b, room(id), Math.ceil(room(id) / days));
    add(out, id, k); b -= k;
  }
  if (b > 0 && x.mode === 'parallel') {
    const sh = new Map(topics.filter(id => Number(x.shares[id]) > 0 && room(id) > 0).map(id => [id, Number(x.shares[id])]));
    if (sh.size) {
      const got = allocate(b, sh, new Map([...sh.keys()].map(id => [id, room(id)])));
      for (const [id, n] of got) { add(out, id, n); b -= n; }
    }
  }
  for (const id of topics) { if (b <= 0) break; const k = Math.min(b, room(id)); add(out, id, k); b -= k; }
  return out;
}

// Los grupos que pueden recibir nuevas un día: cada examen con temario por ver y lo que no tiene examen
function groupsOn(P, i, rem) {
  const gs = [];
  const ok = id => { const d = P.deckInfo.get(id); return d && d.free === 'active' && rem.get(id) > 0; };
  for (const x of P.ex) {
    if (i > x.newEnd || i < x.hold || (x.date != null && i >= x.date)) continue;
    const ids = x.study.filter(ok);
    if (ids.length) gs.push({ id: x.id, x, ids, avail: ids.reduce((a, id) => a + rem.get(id), 0) });
  }
  // Lo que no tiene examen y, después de un examen, los temas que dejaste para después
  const free = [];
  for (const [id, d] of P.deckInfo) if (d.noExam && ok(id)) free.push(id);
  for (const x of P.ex) if (x.date != null && i >= x.date) for (const id of x.later) if (ok(id) && !free.includes(id)) free.push(id);
  if (free.length) gs.push({ id: 'free', x: null, ids: free, avail: free.reduce((a, id) => a + rem.get(id), 0) });
  return gs;
}
// Los porcentajes del reparto entre exámenes un día (enteros que suman 100)
function splitShares(P, gs) {
  const split = P.plan.split || {}, sh = new Map();
  if (!gs.length) return sh;
  if (split.mode === 'manual') {
    for (const g of gs) sh.set(g.id, Math.max(0, Number(split.shares?.[g.id]) || 0));
    if (![...sh.values()].some(v => v > 0)) for (const g of gs) sh.set(g.id, 1);
  } else {
    const exams = gs.filter(g => g.x?.date != null).sort((a, b) => a.x.date - b.x.date);
    const near = exams[0] || gs.find(g => g.x) || gs[0], others = gs.filter(g => g !== near);
    sh.set(near.id, others.length ? AUTO_NEAR : 100);
    for (const g of others) sh.set(g.id, (100 - AUTO_NEAR) / others.length);
  }
  return toPercent(sh);
}
// Pesos → porcentajes enteros que suman 100 (por el mayor resto)
export function toPercent(weights) {
  const ent = [...weights], sum = ent.reduce((a, [, v]) => a + v, 0), out = new Map();
  if (!ent.length) return out;
  if (!(sum > 0)) { ent.forEach(([id], j) => out.set(id, 0)); out.set(ent[0][0], 100); return out; }
  const raw = ent.map(([id, v]) => [id, (v * 100) / sum]);
  let left = 100;
  for (const [id, v] of raw) { out.set(id, Math.floor(v)); left -= Math.floor(v); }
  for (const [id] of [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1))) { if (left <= 0) break; out.set(id, out.get(id) + 1); left--; }
  return out;
}

// Un día con una etapa a mano: manda su nivel de cada carpeta o lista (Poco 1 : Normal 2 : Mucho 4)
function stageDay(P, stage, gs, budget, i, rem) {
  const { folders, decks } = P.ctx, groups = new Map();
  for (const g of gs) for (const id of g.ids) {
    const hit = climbKey(stage.levels, decks.get(id), folders), lvl = hit?.v || 'normal';
    if (!STAGE_W[lvl]) continue;
    const k = hit?.key || g.id;
    if (!groups.has(k)) groups.set(k, { w: STAGE_W[lvl], ids: [], x: g.x, mixed: false });
    const G = groups.get(k);
    if (G.x !== g.x) G.mixed = true;
    if (!G.ids.includes(id)) G.ids.push(id);
  }
  const avail = new Map([...groups].map(([k, G]) => [k, G.ids.reduce((a, id) => a + rem.get(id), 0)]));
  const got = spread(budget, new Map([...groups].map(([k, G]) => [k, G.w])), avail), out = new Map();
  for (const [k, n] of got) {
    const G = groups.get(k), ord = k.startsWith('f:') ? stage.order?.[k.slice(2)] : null;
    if (ord?.length) {
      // El orden de temas de la etapa: un tema tras otro
      const ids = [...ord.map(o => o.deck).filter(id => G.ids.includes(id)), ...G.ids.filter(id => !ord.some(o => o.deck === id))];
      let b = n;
      for (const id of ids) { const q = Math.min(b, rem.get(id) - (out.get(id) || 0)); add(out, id, q); b -= q; }
    } else if (G.x && !G.mixed) for (const [id, q] of withinExam(G.x, n, i, rem, P, new Set(G.ids))) add(out, id, q);
    else for (const [id, q] of spread(n, new Map(G.ids.map(id => [id, 1])), new Map(G.ids.map(id => [id, rem.get(id)])))) add(out, id, q);
  }
  return out;
}

// El tope de nuevas al día: el de Ajustes del plan; si no, las nuevas al día de Ajustes; sin ninguno, sin tope
const isCount = v => v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
export function newCap(state) {
  const c = state.plan?.caps?.newPerDay;
  return isCount(c) ? Number(c) : isCount(state.newPerDay) ? Number(state.newPerDay) : Infinity;
}

/* ===================== 5 · simular día a día ===================== */
// forecast(state): el plan completo día a día y el veredicto de cada examen.
// opts.light: sin la lista de días (para buscar arreglos más deprisa)
export function forecast(state, opts = {}) {
  const P = prepare(state), { H, mins, keys, deckInfo, st, pace, plan } = P;
  const caps = plan.caps || {}, capNew = newCap(state), capRev = caps.reviewsPerDay > 0 ? caps.reviewsPerDay : Infinity;
  const K = newKernel(P.r), sN = Math.max(1, Number(pace.secNew) || PACE_DEFAULT.secNew), sR = Math.max(1, Number(pace.secReview) || PACE_DEFAULT.secReview);
  const rem = new Map(), extra = new Map(), finish = new Map(), firstDay = new Map();
  for (const id of deckInfo.keys()) rem.set(id, st.fresh.get(id) || 0);
  const start = new Map(P.ex.map(x => [x.id, x.study.reduce((a, id) => a + (rem.get(id) || 0), 0)]));
  const exFinish = new Map(), exLeft = new Map(), days = [];
  let backlog = 0;
  const live = [...deckInfo].filter(([id]) => st.base.has(id));
  for (let i = 0; i <= H; i++) {
    let due = backlog;
    for (const [id, d] of live) if (i < d.stop) due += st.base.get(id)[i];
    for (const [id, a] of extra) if (i < deckInfo.get(id).stop) due += a[i];
    const m = mins[i], fitRev = Math.floor((m * 60) / sR);
    const reviews = Math.min(Math.round(due), fitRev, capRev);
    backlog = Math.max(0, due - reviews);
    // «No caben los repasos» es solo cuando no caben en tus minutos; el tope de repasos de Ajustes deja tiempo a las nuevas
    const short = m > 0 && Math.min(Math.round(due), capRev) > fitRev;
    let cap = Math.max(0, Math.floor((m * 60 - reviews * sR) / sN));
    if (short) cap = 0;
    cap = Math.min(cap, capNew);
    const gs = cap > 0 ? groupsOn(P, i, rem) : [];
    let got = new Map();
    if (gs.length) {
      const stage = stageOn(plan.stages, keys[i]);
      if (stage) got = stageDay(P, stage, gs, cap, i, rem);
      else {
        // Un tema puede estar en dos exámenes (una carpeta y su subcarpeta): cada grupo ve lo que han dejado los
        // de antes, y lo que un grupo no puede usar pasa a los demás en una segunda vuelta
        const sh = splitShares(P, gs), per = spread(cap, sh, new Map(gs.map(g => [g.id, g.avail])));
        const left = new Map(rem);
        const take = (g, n) => {
          if (n <= 0) return 0;
          const ids = new Set(g.ids.filter(id => left.get(id) > 0));
          const part = g.x ? withinExam(g.x, n, i, left, P, ids) : spread(n, new Map([...ids].map(id => [id, 1])), new Map([...ids].map(id => [id, left.get(id)])));
          let k = 0;
          for (const [id, q] of part) { add(got, id, q); left.set(id, left.get(id) - q); k += q; }
          return k;
        };
        let given = 0;
        for (const g of gs) given += take(g, per.get(g.id) || 0);
        for (const g of gs) { if (given >= cap) break; given += take(g, cap - given); }
      }
    }
    let nNew = 0;
    for (const [id, n] of got) {
      nNew += n;
      const r = rem.get(id) - n;
      rem.set(id, r);
      if (!firstDay.has(id)) firstDay.set(id, i);
      if (r <= 0 && !finish.has(id)) finish.set(id, i);
      let a = extra.get(id);
      if (!a) extra.set(id, a = new Float64Array(H + 1));
      for (const [k, w] of K) { if (i + k > H) break; a[i + k] += n * w; }
    }
    for (const x of P.ex) {
      if (!exFinish.has(x.id) && start.get(x.id) > 0 && x.study.every(id => !(rem.get(id) > 0))) exFinish.set(x.id, i);
      if (i === x.newEnd) exLeft.set(x.id, x.study.reduce((a, id) => a + (rem.get(id) || 0), 0));
    }
    if (!opts.light) days.push({ day: keys[i], minutes: m, reviewsDue: Math.round(due), reviews, backlog: Math.round(backlog), short, new: nNew, newBy: Object.fromEntries(got), secs: reviews * sR + nNew * sN });
  }
  const exams = P.ex.map(x => examResult(x, P, start, exFinish, exLeft, rem, firstDay, finish));
  return { today: state.today, horizon: H, pace, retention: P.r, exams, days, short: days.filter(d => d.short).map(d => d.day) };
}

function examResult(x, P, start, exFinish, exLeft, rem, firstDay, finish) {
  const { keys } = P, k = i => (i == null ? null : keys[Math.max(0, Math.min(i, keys.length - 1))]);
  const s = start.get(x.id), fin = exFinish.get(x.id);
  const left = s === 0 ? 0 : x.newEnd < 0 ? s : exLeft.has(x.id) ? exLeft.get(x.id) : fin != null ? 0 : x.study.reduce((a, id) => a + (rem.get(id) || 0), 0);
  const total = x.study.reduce((a, id) => a + (P.st.total.get(id) || 0), 0);
  let verdict = null, margin = null, review = null;
  if (x.date != null) {
    if (left > 0) verdict = 'no';
    else {
      const end = s === 0 ? -1 : fin;
      margin = x.date - end;
      review = Math.max(0, x.date - 1 - (x.e.lastWeek ? LAST_WEEK : 0) - end);
      verdict = review < JUST ? 'justo' : 'llegas';
    }
  }
  const lw = x.date != null && x.e.lastWeek ? [k(x.date - LAST_WEEK), k(x.date - 1)] : null;
  const temarioEnd = fin ?? (x.date != null ? Math.min(x.newEnd, P.H) : null);
  return {
    id: x.id, name: x.e.name, date: x.e.date || null, days: x.date, verdict, margin, review,
    start: s, left, total, seen: total ? Math.round(((total - s) / total) * 100) : 100,
    finish: fin != null ? k(fin) : null,
    phases: {
      temario: s > 0 ? [k(0), k(temarioEnd)] : null,
      repaso: x.date != null && left === 0 ? [k((fin ?? -1) + 1), k(x.date - 1 - (x.e.lastWeek ? LAST_WEEK : 0))] : null,
      lastWeek: lw,
    },
    topics: x.topics.map(id => ({ id, total: P.st.total.get(id) || 0, fresh: P.st.fresh.get(id) || 0, from: firstDay.has(id) ? k(firstDay.get(id)) : null, finish: finish.has(id) ? k(finish.get(id)) : null,
      state: (x.e.known || []).includes(id) ? 'known' : (x.e.exclude || []).includes(id) ? 'exclude' : (x.e.later || []).includes(id) ? 'later' : !(P.st.fresh.get(id) > 0) ? 'done' : 'study' })),
  };
}

/* ===================== lo de hoy ===================== */
// Lo de hoy: cuántas nuevas de cada lista, los repasos y los minutos, y si ya está hecho. Hoy y el Plan leen
// esto mismo, así que dicen el mismo número. Los repasos son los que tocan hoy (también en un día libre).
// state.done = { new, reviews, n, ms }: lo hecho hoy (nuevas, repasos, respuestas y su tiempo).
// state.extraNew: las «N nuevas más» que has pedido hoy, por encima del plan.
// «Hecho por hoy» (dayDone): has respondido algo y has cumplido tus minutos (lo hecho, a tu ritmo, o el tiempo
// de verdad), o no queda nada. Lo que quede pasa a mañana.
export function today(state) {
  const d = state.done || {}, done = { new: Math.max(0, d.new || 0), reviews: Math.max(0, d.reviews || 0), n: Math.max(0, d.n || 0), ms: Math.max(0, d.ms || 0) };
  const fc = forecast(state), d0 = fc.days[0], { secNew: sN, secReview: sR } = fc.pace;
  const reviews = d0.reviewsDue;
  // Las nuevas de hoy con el tiempo que queda tras lo hecho y los repasos que faltan
  const minutes = d0.minutes, spent = done.reviews * sR + done.new * sN, room = minutes * 60 - reviews * sR - spent;
  const planned = Math.min(d0.new, Math.max(0, Math.floor(room / sN) + done.new));
  let left = Math.max(0, planned + Math.max(0, state.extraNew || 0) - done.new);
  const newBy = {}, give = (id, n) => { const q = Math.min(n, left); if (q > 0) { newBy[id] = (newBy[id] || 0) + q; left -= q; } };
  const plan = Object.entries(d0.newBy).sort((a, b) => b[1] - a[1]);
  for (const [id, n] of plan) give(id, n);
  // Lo que pides de más, de las listas de hoy y después de las demás que tienen nuevas
  if (left > 0) {
    const fresh = stock(state, fc.retention).fresh;
    for (const [id] of plan) give(id, (fresh.get(id) || 0) - (newBy[id] || 0));
    for (const [id, n] of fresh) give(id, n - (newBy[id] || 0));
  }
  const nNew = Object.values(newBy).reduce((a, b) => a + b, 0);
  const finished = done.n > 0 && minutes > 0 && (spent >= minutes * 60 || done.ms >= minutes * 60e3 || (reviews === 0 && nNew === 0));
  return {
    day: d0.day, minutes, rest: minutes === 0, reviews, reviewsFit: d0.reviews, new: nNew, newBy, total: reviews + nNew,
    secs: reviews * sR + nNew * sN, fits: reviews * sR <= Math.max(0, minutes * 60 - spent),
    short: d0.short, done: reviews === 0 && nNew === 0,
    dayDone: finished ? { n: done.n, minutes: Math.max(1, Math.round((done.ms || spent * 1000) / 60e3)) } : null,
    pace: fc.pace,
  };
}

/* ===================== qué pasaría si… ===================== */
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
// Un cambio: una función que modifica una copia del plan, o un trozo que se junta con él (los exámenes, por id)
export function applyChange(plan, change) {
  const p = clone(plan) || {};
  if (typeof change === 'function') { change(p); return p; }
  for (const [k, v] of Object.entries(change || {})) {
    if (k === 'exams' && Array.isArray(v)) {
      p.exams = p.exams || [];
      for (const e of v) { const i = p.exams.findIndex(x => x.id === e.id); if (i >= 0) p.exams[i] = { ...p.exams[i], ...e }; else p.exams.push(e); }
    } else if (v && typeof v === 'object' && !Array.isArray(v) && p[k] && typeof p[k] === 'object') p[k] = { ...p[k], ...v };
    else p[k] = v;
  }
  return p;
}
export const whatIf = (state, change, opts) => forecast({ ...state, plan: applyChange(state.plan, change) }, opts);

/* ===================== 6 · los arreglos ===================== */
// Las palancas para llegar a un examen, de la que menos cambia a la que más
function levers(state, fc, examId) {
  const plan = state.plan, ex = fc.exams.find(e => e.id === examId), out = [];
  const exam = liveExams(plan).find(e => e.id === examId);
  if (!ex || !exam) return out;
  const week = plan.time?.week || Object.fromEntries(WEEK.map(d => [d, state.fallbackMin ?? 10]));
  const on = WEEK.filter(d => Number(week[d]) > 0), off = WEEK.filter(d => !(Number(week[d]) > 0));
  const avg = on.length ? Math.round(on.reduce((a, d) => a + Number(week[d]), 0) / on.length / 5) * 5 : 30;
  const setWeek = (p, w) => { p.time = { ...(p.time || {}), week: w }; };
  for (const m of [10, 15, 20, 30, 45]) if (on.length) {
    out.push({ kind: 'minutes', add: m, days: on, cost: (m * on.length) / 60,
      apply: p => setWeek(p, Object.fromEntries(WEEK.map(d => [d, (Number(week[d]) || 0) + (on.includes(d) ? m : 0)]))) });
  }
  for (const d of off) out.push({ kind: 'freeDay', day: d, minutes: avg || 30, cost: 0.5 + (avg || 30) / 60, apply: p => setWeek(p, { ...week, [d]: avg || 30 }) });
  for (const o of liveExams(plan)) if (o.id !== examId && (!isDay(o.date) || !isDay(exam.date) || o.date > exam.date || true)) {
    const oo = fc.exams.find(e => e.id === o.id);
    if (!oo || oo.start === 0 || !isDay(exam.date)) continue;
    out.push({ kind: 'pauseOther', exam: o.id, until: exam.date, cost: 1.5, apply: p => { const e = p.exams.find(x => x.id === o.id); e.hold = exam.date; } });
  }
  if (exam.lastWeek) out.push({ kind: 'lastWeek', cost: 1.5, apply: p => { p.exams.find(x => x.id === examId).lastWeek = false; } });
  const study = ex.topics.filter(t => t.state === 'study');
  for (let k = 1; k <= Math.min(3, study.length - 1); k++) {
    const ids = study.slice(-k).map(t => t.id);
    out.push({ kind: 'later', topics: ids, cost: 2 + k, apply: p => { const e = p.exams.find(x => x.id === examId); e.later = [...new Set([...(e.later || []), ...ids])]; } });
  }
  if (isDay(exam.date)) for (const w of [1, 2, 4]) out.push({ kind: 'date', date: addDays(exam.date, 7 * w), cost: 5 + w, apply: p => { p.exams.find(x => x.id === examId).date = addDays(exam.date, 7 * w); } });
  return out;
}
const reaches = v => v === 'llegas' || v === 'justo';
const strip = l => { const { apply, cost, ...rest } = l; return rest; };
// fixes(state, examId): hasta 3 arreglos que llegan, de uno en uno y en parejas, los que cambian menos.
// Si ninguno llega, `drop`: qué temas dejar para el final (los últimos del camino) y cómo quedaría.
export function fixes(state, examId) {
  const fc = forecast(state, { light: true }), base = fc.exams.find(e => e.id === examId);
  if (!base) return { base: null, options: [], drop: null };
  if (base.verdict !== 'no') return { base, options: [], drop: null };   // ya llegas: no hay nada que arreglar
  const L = levers(state, fc, examId), tried = [];
  const run = ls => {
    const plan = applyChange(state.plan, p => { for (const l of ls) l.apply(p); });
    const r = forecast({ ...state, plan }, { light: true }).exams.find(e => e.id === examId);
    return { levers: ls.map(strip), kinds: ls.map(l => l.kind).sort().join('+'), cost: ls.reduce((a, l) => a + l.cost, 0), plan, exam: r };
  };
  // Si no llegas con el tope de nuevas de Ajustes: «Subir a N nuevas al día», con el N mínimo que llega
  const cap = newCap(state);
  if (base.verdict === 'no' && Number.isFinite(cap)) {
    const withCap = n => applyChange(state.plan, p => { p.caps = { ...(p.caps || {}), newPerDay: n }; });
    const at = n => forecast({ ...state, plan: withCap(n) }, { light: n !== 500 });
    const free = at(500), hi = Math.max(cap + 1, ...free.days.map(d => d.new));
    let n = hi;
    if (reaches(free.exams.find(e => e.id === examId).verdict)) {
      let lo = cap;                                  // lo: no llega · n: llega
      while (n - lo > 1) { const mid = (lo + n) >> 1; if (reaches(at(mid).exams.find(e => e.id === examId).verdict)) n = mid; else lo = mid; }
    }
    if (n > cap) L.push({ kind: 'cap', from: cap, newPerDay: n, cost: 0.5 + (n - cap) / 10, apply: p => { p.caps = { ...(p.caps || {}), newPerDay: n }; } });
  }
  const singles = L.map(l => ({ l, res: run([l]) }));
  tried.push(...singles.map(s => s.res));
  // En parejas, solo las que ayudan algo y no llegan solas, y de cada tipo las dos que menos cambian
  const per = new Map();
  for (const s of [...singles].sort((a, b) => a.l.cost - b.l.cost)) {
    if (reaches(s.res.exam.verdict) || !(s.res.exam.left < base.left)) continue;
    const list = per.get(s.l.kind) || [];
    if (list.length < 2) per.set(s.l.kind, [...list, s.l]);
  }
  const P2 = [...per.values()].flat();
  for (let a = 0; a < P2.length; a++) for (let b = a + 1; b < P2.length; b++) if (P2[a].kind !== P2[b].kind) tried.push(run([P2[a], P2[b]]));
  const good = tried.filter(t => reaches(t.exam.verdict)).sort((a, b) => a.cost - b.cost || (a.exam.verdict === 'llegas' ? -1 : 1) - (b.exam.verdict === 'llegas' ? -1 : 1) || (b.exam.margin ?? 0) - (a.exam.margin ?? 0));
  const options = [], seen = new Set();
  for (const g of good) { if (seen.has(g.kinds)) continue; seen.add(g.kinds); options.push(g); if (options.length === 3) break; }
  let drop = null;
  if (!options.length) {
    const study = base.topics.filter(t => t.state === 'study');
    for (let k = 1; k <= study.length; k++) {
      const ids = study.slice(-k).map(t => t.id);
      const plan = applyChange(state.plan, p => { const e = p.exams.find(x => x.id === examId); e.later = [...new Set([...(e.later || []), ...ids])]; });
      const r = forecast({ ...state, plan }, { light: true }).exams.find(e => e.id === examId);
      if (reaches(r.verdict) || k === study.length) { drop = { topics: ids, plan, exam: r }; break; }
    }
  }
  return { base, options, drop };
}

// Los porcentajes del reparto entre exámenes hoy (o el día i): Map id → % (suman 100)
export function sharesToday(state, i = 0) {
  const P = prepare(state), rem = new Map([...P.deckInfo.keys()].map(id => [id, P.st.fresh.get(id) || 0]));
  return splitShares(P, groupsOn(P, i, rem));
}
