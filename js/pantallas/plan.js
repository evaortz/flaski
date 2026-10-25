// Flaski · Plan de estudio: resumen, tu semana y días especiales, hoy toca, tu temporada (tira en el móvil,
// planificador por meses o semanas en el ordenador), etapas con su orden de temas, «cuando no llegas»,
// la primera vez («Hagamos tu plan»), qué estudias (el foco de cada cosa) y los exámenes (ficha y nuevo).
// Las cuentas (días de calendario, etapas, proyección) están en plan.js.
import { icon } from '../icons.js';
import { tandaSize } from '../tanda.js';
import {
  childrenOf, decksUnder, folderKey, WEEK, WEEK_SHORT, WEEK_NAMES, dayKey, isDay, dayDate, addDays, daysBetween, weekdayOf,
  live, weekTotal, weekAverage, minutesOn, newOn, LEVELS, levelLabel, levelOf, levelNode, sortStages, stageOn, nodesOn, topicOrder, orderedTopics, simulate,
} from '../plan.js';
import { main, S, esc, toast, folderIcon, deckIcon, freshByDeck, planNodes, newPlan, todayMinutes, tandaMinutes } from '../comun.js';
import { plural } from './mazos.js';
import { shortInfo, tandaFit, todayQueue, dayDone, restLink } from './estudio.js';
import { openSheet, closeSheet, confirmSheet } from './editor.js';
import { savePrefsSoon } from './perfil.js';
import { mapModel, failNote, resistIds, practiceResist, setMapView } from './mapa.js';
import { simBlockHTML } from './simulacro.js';
import { go } from '../app.js';

/* ===================== datos ===================== */
const P = () => S.prefs.plan;
const today = () => dayKey();
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const shortDate = k => { const d = dayDate(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const longDate = k => { const d = dayDate(k); return `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`; };
const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const byName = (a, b) => a.name.localeCompare(b.name, 'es');
const ordinal = n => `${n}.ª`;

// Lo que se planifica: las carpetas de primer nivel y las listas sueltas (sin archivar y con algo dentro)
export function planItems() {
  const top = childrenOf(null, S.decks, S.folders);
  return [
    ...top.folders.sort(byName).map(f => ({ key: folderKey(f.id), name: f.name, ico: folderIcon(f), fid: f.id, decks: decksUnder(f.id, S.decks, S.folders) })),
    ...top.decks.sort(byName).map(d => ({ key: d.id, name: d.name, ico: deckIcon(d), decks: [d] })),
  ].filter(x => x.decks.length);
}
export const keyExists = key => (key.startsWith('f:') ? S.folders.has(key.slice(2)) : S.decks.has(key));
export const keyDecks = key => (key.startsWith('f:') ? (S.folders.has(key.slice(2)) ? decksUnder(key.slice(2), S.decks, S.folders) : [])
  : S.decks.has(key) && !S.decks.get(key).archived ? [S.decks.get(key)] : []);
export const keyName = key => (key.startsWith('f:') ? S.folders.get(key.slice(2))?.name || 'Carpeta' : S.decks.get(key)?.name || 'Lista');
const keyIcon = key => { if (key.startsWith('f:')) { const f = S.folders.get(key.slice(2)); return f ? folderIcon(f) : ''; } const d = S.decks.get(key); return d ? deckIcon(d) : ''; };
// La carpeta de primer nivel (o la lista suelta) de la que cuelga algo: donde se pone su nivel
function rootKey(key) {
  let fid = key.startsWith('f:') ? key.slice(2) : S.decks.get(key)?.folder_id;
  if (!fid || !S.folders.has(fid)) return key;
  const seen = new Set();
  while (S.folders.get(fid)?.parent_id && S.folders.has(S.folders.get(fid).parent_id) && !seen.has(fid)) { seen.add(fid); fid = S.folders.get(fid).parent_id; }
  return folderKey(fid);
}
const remaining = () => freshByDeck(c => { const d = S.decks.get(c.deck_id); return d && !d.archived; });
const deckLimit = id => { const n = S.decks.get(id)?.options?.newPerDay; return n === null || n === undefined || n === '' ? Infinity : Number(n); };
const sum = (ids, m) => ids.reduce((a, id) => a + (m.get(id) || 0), 0);

// Los exámenes (de hoy en adelante; con past, también los pasados), del más cercano al más lejano
export function examList({ past = false } = {}) {
  const t = today();
  return Object.entries(planNodes()).filter(([k, n]) => isDay(n?.exam) && keyExists(k) && (past || n.exam >= t))
    .map(([key, n]) => ({ key, exam: n.exam, days: daysBetween(t, n.exam), node: n })).sort((a, b) => a.exam.localeCompare(b.exam));
}
// Proyección del plan (o de otro, para comparar un arreglo): de cada examen, cuándo acabas su temario
// y cuántas nuevas te faltarían el día del examen
export function forecast(plan = P(), newPerDay = S.newPerDay) {
  const t = today(), exams = examList();
  const to = [...exams.map(e => e.exam), ...sortStages(plan.stages).map(s => s.to), addDays(t, 120)].sort().at(-1);
  const rem = remaining();
  const sim = simulate({ decks: S.decks, folders: S.folders, plan, newPerDay, fallbackMin: S.prefs.study.tandaMin, remaining: rem, from: t, to, limit: deckLimit });
  const out = exams.map(e => {
    const ids = keyDecks(e.key).map(d => d.id), start = sum(ids, rem), left = sum(ids, sim.left(e.exam));
    const fins = ids.filter(id => rem.get(id)).map(id => sim.finish.get(id));
    const finish = !start || fins.some(f => !f) ? null : fins.sort().at(-1);
    return { ...e, ids, start, left, finish, late: left > 0, margin: finish ? daysBetween(finish, e.exam) : null };
  });
  return { exams: out, sim, rem, to };
}
// Nuevas al día de un grupo de listas entre dos días de la proyección
function perDayIn(fc, ids, from, to) {
  const a = from < today() ? today() : from;
  if (a > to) return 0;
  return Math.round((sum(ids, fc.sim.left(a)) - sum(ids, fc.sim.left(addDays(to, 1)))) / (daysBetween(a, to) + 1));
}
// El nivel de algo en una etapa (si la etapa no lo dice, el de siempre)
const baseLevel = key => (planNodes()[key] ? levelOf(planNodes()[key]) : 'normal');
const levelIn = (st, key) => st?.levels?.[key] || baseLevel(key);
// La etapa donde está el problema de un examen al que no llegas: antes del examen, la que le da menos
function problemStage(ex) {
  const rk = rootKey(ex.key), rank = { paused: 0, reviews: 1, low: 2, normal: 3, high: 4 };
  const cand = sortStages(P().stages).filter(s => s.to >= today() && s.from < ex.exam && levelIn(s, rk) !== 'high');
  return cand.sort((a, b) => rank[levelIn(a, rk)] - rank[levelIn(b, rk)] || daysBetween(b.from, b.to) - daysBetween(a.from, a.to))[0] || null;
}
const stageNum = id => sortStages(P().stages).findIndex(s => s.id === id) + 1;
// Guardar un cambio en una etapa o día especial: «at» dice cuál es el más reciente al juntar dispositivos
const touch = x => { x.at = Date.now(); return x; };
function putIn(list, item) {
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = touch(item); else list.push(touch(item));
}
// El nivel de siempre de algo (sin etapa): estado y peso en los nodos
export function setBaseLevel(key, lvl) {
  const N = planNodes(), n = { ...(N[key] || {}) };
  delete n.state; delete n.weight;
  const ln = levelNode(lvl);
  if (ln && ln.state !== 'active') n.state = ln.state;
  if (ln?.weight && ln.weight !== 1) n.weight = ln.weight;
  if (Object.keys(n).length) N[key] = n; else delete N[key];
}
function saveAndDraw() { savePrefsSoon(); if (S.view === 'plan') renderPlan(); else if (S.view === 'exam') renderExam(); }

/* ===================== pantalla ===================== */
export function renderPlan() {
  const y = scrollY, fc = forecast();
  const exams = fc.exams, stages = sortStages(P().stages);
  const start = exams.length && !stages.length && !P().startDone;
  main.innerHTML = `<div class="pl-page">
    <div class="pl-head"><div class="crumbs-row"><button class="back-round" data-nav="profile" aria-label="Volver a Perfil">${icon('chevron-left', { size: 22 })}</button><h1>Plan de estudio</h1></div>
      ${summaryHTML(fc)}</div>
    ${fixesHTML(fc)}
    ${start ? `<button class="pl-start" data-nav="planStart"><b>Hagamos tu plan</b><span>Tienes ${plural(exams.length, 'examen', 'exámenes')}. Dime cuánto tiempo tienes al día y te propongo cómo repartirlo.</span>${icon('chevron-right', { size: 20 })}</button>` : ''}
    <div class="pl-top"><section class="pl-sec" aria-labelledby="h-week">${weekHTML()}</section>
      <section class="pl-sec" aria-labelledby="h-today">${todayHTML()}</section></div>
    <section class="pl-sec" aria-labelledby="h-season">${seasonHTML(fc)}</section>
    <section class="pl-sec" aria-labelledby="h-exams">${examsHTML(fc)}</section>
    <section class="pl-sec" aria-labelledby="h-stages">${stagesHTML(fc)}</section>
    <section class="pl-sec" aria-labelledby="h-focus">${focusHTML()}</section></div>`;
  bindPlanner();
  if (S.view === 'plan') scrollTo(0, y);
}

// Resumen: «Vas bien: llegas a los dos exámenes» o «Así no llegas al examen de X»
function summaryHTML(fc) {
  const late = fc.exams.filter(e => e.late), n = fc.exams.length;
  const avg = Math.round(weekAverage(P().week, S.prefs.study.tandaMin)), { secs } = shortInfo();
  const sub = `Con tus tandas de ${avg} min salen unas ${tandaSize(avg, secs)} preguntas al día, ${S.newPerDay} de ellas nuevas.`;
  const undo = S.planUndo ? ' <button class="link" data-pl="undo">Deshacer</button>' : '';
  if (late.length) {
    const e = late[0], st = problemStage(e), rk = rootKey(e.key);
    const why = st ? `En la etapa ${stageNum(st.id)} ${esc(keyName(rk))} está en «${levelLabel(levelIn(st, rk))}»: al ${shortDate(e.exam)} ${missing(e.left)}.`
      : `Al ${shortDate(e.exam)} ${missing(e.left)}.`;
    return `<div class="pl-sum late" id="plSum"><h2>Así no llegas al examen de ${esc(keyName(e.key))}</h2><p>${why}${undo}</p></div>`;
  }
  const title = !n ? 'Sin exámenes a la vista' : n === 1 ? 'Vas bien: llegas al examen' : n === 2 ? 'Vas bien: llegas a los dos exámenes' : `Vas bien: llegas a los ${n} exámenes`;
  return `<div class="pl-sum" id="plSum"><h2>${title}</h2><p>${sub}${undo}</p></div>`;
}

/* ---------------- cuando no llegas ---------------- */
// «te faltarían unas 40 preguntas nuevas» (con una, «te faltaría 1 pregunta nueva»)
const missing = n => (n === 1 ? 'te faltaría 1 pregunta nueva' : `te faltarían unas ${n} preguntas nuevas`);
const RAISE = { paused: 'low', reviews: 'low', low: 'normal', normal: 'high' };
// Tres arreglos para el primer examen al que no llegas, cada uno con lo que pasaría
export function planFixes(ex) {
  const plan = P(), rk = rootKey(ex.key), name = keyName(rk), st = problemStage(ex), out = [];
  const result = (p2, npd = S.newPerDay) => { const f = forecast(p2, npd), e = f.exams.find(x => x.key === ex.key); return { f, e }; };
  const tail = e => (!e ? '' : e.late ? (e.left === 1 ? 'aún te faltaría 1' : `aún te faltarían ${e.left}`) : e.finish ? `acabas el ${shortDate(e.finish)}${e.margin >= 14 ? `, con ${Math.floor(e.margin / 7)} semanas para repasar` : e.margin > 1 ? `, con ${e.margin} días para repasar` : ''}` : 'acabas a tiempo');
  // 1 · Subir el nivel (en la etapa del problema o, sin etapas, el de siempre)
  const cur = st ? levelIn(st, rk) : baseLevel(rk), up = RAISE[cur];
  if (up) {
    const p2 = clone(plan);
    if (st) { const s2 = p2.stages.find(x => x.id === st.id); s2.levels = { ...(s2.levels || {}), [rk]: up }; touch(s2); }
    else { const ln = levelNode(up); p2.nodes[rk] = { ...(p2.nodes[rk] || {}) }; delete p2.nodes[rk].state; delete p2.nodes[rk].weight; if (ln.weight !== 1) p2.nodes[rk].weight = ln.weight; }
    const { f, e } = result(p2);
    const per = st ? perDayIn(f, keyDecks(rk).map(d => d.id), st.from, st.to) : 0;
    out.push({ id: 'level', title: st ? `Subir ${name} a «${levelLabel(up)}» en la etapa ${stageNum(st.id)}` : `Subir ${name} a «${levelLabel(up)}»`, text: [per ? `≈ ${plural(per, 'nueva', 'nuevas')} al día` : '', tail(e)].filter(Boolean).join(' · '), plan: p2 });
  }
  // 2 · Alargar la etapa un mes (sin pasar del examen); las de después empiezan más tarde
  if (st && st.to < addDays(ex.exam, -1)) {
    const p2 = clone(plan), to = [addDays(st.to, 30), addDays(ex.exam, -1)].sort()[0], shift = daysBetween(st.to, to);
    for (const s of p2.stages) {
      if (s.deleted) continue;
      if (s.id === st.id) { s.to = to; touch(s); } else if (s.from > st.to) { s.from = addDays(s.from, shift); s.to = addDays(s.to, shift); touch(s); }
    }
    const { e } = result(p2), next = sortStages(plan.stages).find(s => s.from > st.to);
    out.push({ id: 'stretch', title: `Alargar la etapa ${stageNum(st.id)} hasta el ${shortDate(to)}`, text: [next ? `La etapa ${stageNum(next.id)} empieza ${shift >= 28 ? 'un mes' : plural(shift, 'día', 'días')} más tarde` : '', tail(e)].filter(Boolean).join(' · '), plan: p2 });
  } else {
    const npd = Math.min(500, S.newPerDay + Math.max(2, Math.ceil(ex.left / Math.max(1, ex.days)))), { e } = result(plan, npd);
    out.push({ id: 'npd', title: `Subir las nuevas al día de ${S.newPerDay} a ${npd}`, text: tail(e), plan: clone(plan), npd });
  }
  // 3 · Más minutos un día: un día libre pasa a tener tanda (o, sin días libres, 15 min más el más corto)
  const w = plan.week;
  if (w) {
    const free = WEEK.find(d => !(Number(w[d]) > 0));
    const day = free || [...WEEK].sort((a, b) => w[a] - w[b])[0];
    const p2 = clone(plan), add = free ? Math.max(15, Math.min(...WEEK.map(d => Number(w[d]) || Infinity))) : 15;
    p2.week[day] = (Number(w[day]) || 0) + (free ? Math.min(add, 60) : 15);
    const { e } = result(p2), dn = WEEK_NAMES[WEEK.indexOf(day)];
    out.push({ id: 'minutes', title: free ? `Estudiar ${p2.week[day]} min los ${dn === 'sábado' || dn === 'domingo' ? dn + 's' : dn}` : `Estudiar 15 min más los ${dn === 'sábado' || dn === 'domingo' ? dn + 's' : dn}`, text: `Tu semana pasa de ${fmtMin(weekTotal(w))} a ${fmtMin(weekTotal(p2.week))} · ${tail(e)}`, plan: p2, e });
  }
  // 4 · Si la última semana es solo de repasos, que sigan entrando nuevas hasta el examen
  if (plan.nodes[ex.key]?.lastWeek) {
    const p2 = clone(plan); p2.nodes[ex.key] = { ...p2.nodes[ex.key], lastWeek: false };
    const { e } = result(p2);
    out.push({ id: 'lastweek', title: 'Que sigan entrando nuevas hasta el examen', text: [`La última semana deja de ser solo de repasos`, tail(e)].filter(Boolean).join(' · '), plan: p2, e });
  }
  // Solo los que mejoran lo que falta
  return out.filter(f => { const e = f.e || result(f.plan, f.npd || S.newPerDay).e; return !e || e.left < ex.left; });
}
const lateKey = fc => fc.exams.filter(e => e.late).map(e => `${e.key}@${e.exam}`).join(',');
function fixesHTML(fc) {
  const ex = fc.exams.find(e => e.late);
  if (!ex || P().lateOk === lateKey(fc)) return '';
  const fixes = planFixes(ex);
  S.planFixes = fixes;
  if (!fixes.length) return '';
  const pick = Math.min(S.planFixPick || 0, fixes.length - 1);
  return `<section class="pl-sec pl-fix" aria-labelledby="h-fix"><div class="section-h"><h2 id="h-fix">Cómo arreglarlo</h2></div><p class="muted">Elige una. Puedes deshacerlo.</p>
    <div class="fix-list" role="radiogroup">${fixes.map((f, i) => `<button type="button" class="fix-opt" role="radio" aria-checked="${i === pick}" data-pl="fix-pick" data-i="${i}"><span class="fix-dot"></span><span><b>${esc(f.title)}</b><small>${esc(f.text)}</small></span></button>`).join('')}</div>
    <button class="primary big" data-pl="fix-apply">Aplicar</button>
    <button class="link fix-keep" data-pl="fix-keep">Lo dejo así, ya lo apaño yo</button></section>`;
}
function applyFix() {
  const f = S.planFixes?.[Math.min(S.planFixPick || 0, S.planFixes.length - 1)];
  if (!f) return;
  S.planUndo = { plan: clone(P()), npd: S.newPerDay };
  const keep = { simGoal: P().simGoal, sim: P().sim };
  Object.assign(S.prefs.plan, clone(f.plan), keep);
  if (f.npd) S.newPerDay = f.npd;
  S.planFixPick = 0;
  toast('Plan cambiado');
  saveAndDraw();
}

/* ---------------- tu semana y días especiales ---------------- */
const DAY_MIN = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
function weekHTML() {
  const w = P().week, t = today(), free = w ? WEEK.filter(d => !(Number(w[d]) > 0)).length : 0;
  const head = w ? `${fmtMin(weekTotal(w))} · ${plural(free, 'día libre', 'días libres')}` : `cada tanda, ${S.prefs.study.tandaMin} min`;
  const days = WEEK.map((d, i) => {
    const m = w ? Number(w[d]) || 0 : null, now = weekdayOf(t) === i;
    return `<button type="button" class="pw-day${m === 0 ? ' pw-free' : ''}${m == null ? ' pw-unset' : ''}${now ? ' pw-now' : ''}" data-pl="day" data-day="${d}" aria-label="${cap(WEEK_NAMES[i])}: ${m == null ? 'sin fijar' : m ? `${m} minutos` : 'libre'}">
      <small>${WEEK_SHORT[i]}</small><b>${m == null ? '–' : m || '·'}</b><small>${m == null ? '' : m ? 'min' : 'libre'}</small></button>`;
  }).join('');
  const sp = live(P().special).filter(s => isDay(s.to) && s.to >= t).sort((a, b) => a.from.localeCompare(b.from));
  return `<div class="section-h"><h2 id="h-week">Tu semana</h2><span class="sec-note">${head}</span></div>
    <div class="pw-days">${days}</div>
    <div class="pw-specials">${sp.map(s => `<button type="button" class="pw-sp" data-pl="special" data-id="${esc(s.id)}">${icon('sun', { size: 15 })}<b>${shortDate(s.from)}${s.to !== s.from ? ` → ${shortDate(s.to)}` : ''}</b><span>${s.label ? ` · ${esc(s.label)}` : ''} · ${s.minutes ? `${s.minutes} min` : 'libre'}</span></button>`).join('')}
      <button type="button" class="link" data-pl="special-new">+ Día especial</button></div>
    <p class="pl-hand">toca un día para cambiar sus minutos</p>`;
}
function daySheet(d) {
  const i = WEEK.indexOf(d), w = P().week, cur = w ? Number(w[d]) || 0 : S.prefs.study.tandaMin;
  openSheet(`<h2 class="sheet-hand">${cap(WEEK_NAMES[i])}</h2>
    <p class="muted">Lo que sueles tener ese día. La tanda de Hoy dura eso, y las nuevas se reparten según los minutos de cada día.</p>
    <div class="pw-opts" role="group" aria-label="Minutos del ${WEEK_NAMES[i]}">${DAY_MIN.map(m => `<button type="button" class="pw-opt" data-pl="set-day" data-day="${d}" data-min="${m}" aria-pressed="${m === cur}">${m ? `${m} min` : 'Libre'}</button>`).join('')}</div>
    <label class="pw-all"><input type="checkbox" id="pwAll"> Igual todos los días</label>
    ${w ? `<button type="button" class="link small pw-off" data-pl="week-off">Quitar tu semana: cada tanda, ${S.prefs.study.tandaMin} min</button>` : ''}`);
}
function setDay(d, m) {
  const all = document.getElementById('pwAll')?.checked;
  const w = P().week || Object.fromEntries(WEEK.map(x => [x, S.prefs.study.tandaMin]));
  if (all) for (const x of WEEK) w[x] = m; else w[d] = m;
  P().week = { ...w };
  closeSheet(); saveAndDraw();
}
function specialSheet(id) {
  const t = today(), s = (id && live(P().special).find(x => x.id === id)) || { from: t, to: addDays(t, 7), minutes: 15, label: '' };
  openSheet(`<h2 class="sheet-hand">${id ? 'Día especial' : 'Nuevo día especial'}</h2>
    <p class="muted">Unos días con otros minutos: vacaciones, la semana de exámenes… Con 0 son libres.</p>
    <label for="spLabel">Nombre</label><input id="spLabel" maxlength="40" placeholder="Ej.: vacaciones" value="${esc(s.label || '')}">
    <div class="pl-dates"><label>Desde<input type="date" id="spFrom" value="${s.from}"></label><label>Hasta<input type="date" id="spTo" value="${s.to}"></label></div>
    <label for="spMin">Minutos esos días</label><select id="spMin">${[0, 5, 10, 15, 20, 30, 45, 60, 90].map(m => `<option value="${m}" ${m === Number(s.minutes) ? 'selected' : ''}>${m ? `${m} min` : 'Libre'}</option>`).join('')}</select>
    <div class="btnrow">${id ? `<button class="ghost danger" data-pl="special-del" data-id="${esc(id)}">Borrar</button>` : ''}<span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-pl="special-save" data-id="${esc(id || '')}">Guardar</button></div>`);
}
function saveSpecial(id) {
  const from = document.getElementById('spFrom').value, to = document.getElementById('spTo').value;
  if (!isDay(from) || !isDay(to)) return toast('Pon las dos fechas');
  const [a, b] = [from, to].sort();
  putIn(P().special, { id: id || newId(), from: a, to: b, minutes: Number(document.getElementById('spMin').value) || 0, label: document.getElementById('spLabel').value.trim().slice(0, 40) });
  closeSheet(); saveAndDraw();
}

/* ---------------- hoy toca ---------------- */
function todayHTML() {
  const t = today(), m = todayMinutes(), q = todayQueue('all'), { m: size, mins } = tandaFit(q.ids.length), done = dayDone();
  if (done) {
    return `<div class="section-h"><h2 id="h-today">Hoy toca</h2><span class="sec-note">${WEEK_NAMES[weekdayOf(t)]} · hecho</span></div>
    <p class="day-done"><b>Hecho por hoy:</b> ${plural(done.n, 'pregunta', 'preguntas')} · ${done.minutes} min.</p>
    ${q.ids.length ? `<p class="day-next">Lo que queda pasa a mañana. ${restLink(q)}</p>` : ''}`;
  }
  const byRoot = new Map();
  for (const id of q.ids) {
    if (S.progress.get(id)) continue;
    const k = rootKey(S.cards.get(id)?.deck_id || '');
    byRoot.set(k, (byRoot.get(k) || 0) + 1);
  }
  const parts = [...byRoot].sort((a, b) => b[1] - a[1]), total = Math.max(1, q.ids.length);
  const bar = parts.map(([k, c], i) => `<i class="ht-s ht-${Math.min(i, 3)}" style="width:${(100 * c) / total}%" title="${esc(keyName(k))}"></i>`).join('') + (q.due ? `<i class="ht-s ht-r" style="width:${(100 * q.due) / total}%"></i>` : '');
  const legend = parts.map(([k, c], i) => `<span><i class="ht-${Math.min(i, 3)}"></i>${esc(shortName(keyName(k)))} · ${i ? c : plural(c, 'nueva', 'nuevas')}</span>`).join('') + (q.due ? `<span><i class="ht-r"></i>repasos · ${q.due}</span>` : '');
  const st = stageOn(P().stages, t), { current } = topicOrder(st, S.decks, S.folders, freshByDeck());
  const topics = [...current].map(([fid, did]) => {
    const pos = orderedTopics(st.order[fid], fid, S.decks, S.folders).indexOf(did) + 1;
    return `${esc(shortName(S.folders.get(fid)?.name || ''))}: ${esc(S.decks.get(did)?.name || '')}${pos > 1 ? ` (va ${ordinal(pos)} en el orden)` : ''}`;
  }).join(' · ');
  const head = `${WEEK_NAMES[weekdayOf(t)]} · ${m === 0 ? 'libre' : `${tandaMinutes()} min`}${size ? ` · ${plural(size, 'pregunta', 'preguntas')}` : ''}`;
  const btn = !q.ids.length ? '<p class="muted">Lo de hoy ya está hecho.</p>'
    : m === 0 ? `<p class="muted">Hoy es tu día libre.</p><button class="ghost" data-act="tanda-short">Estudiar igualmente · ${tandaMinutes()} min</button>`
    : `<button class="primary big" data-act="tanda-short">Empezar la tanda · ${mins} min</button>`;
  // El porqué de las nuevas de hoy: con tu semana, más minutos dan más nuevas (como mucho el doble) y menos, menos
  const nNew = m ? newOn(P(), t, S.newPerDay, S.prefs.study.tandaMin) : 0, avg = Math.round(weekAverage(P().week, S.prefs.study.tandaMin));
  const why = m && P().week && q.fresh ? `<p class="ht-why">Hoy ${q.fresh < nNew ? `te quedan ${plural(q.fresh, 'nueva', 'nuevas')} de ${nNew}` : plural(nNew, 'nueva', 'nuevas')}: tienes ${m} min${m > avg ? `, más que un día normal (${avg} min)` : m < avg ? `, menos que un día normal (${avg} min)` : ''}${nNew >= 2 * S.newPerDay && m > avg ? '. Como mucho, el doble' : ''}.</p>` : '';
  return `<div class="section-h"><h2 id="h-today">Hoy toca</h2><span class="sec-note">${head}</span></div>
    ${why}${q.ids.length ? `<div class="ht-bar">${bar}</div><div class="ht-legend">${legend}</div>` : ''}
    ${topics ? `<p class="ht-topics">${topics}</p>` : ''}${btn}`;
}
// «Turco A1» → «Turco» en las leyendas cortas
const shortName = s => s.replace(/\s*[·(].*$/, '').replace(/\s+[A-C][12]$|\s+N[1-5]$/, '') || s;

/* ---------------- tu temporada ---------------- */
// Color de una etapa en la tira: el nivel más alto que da
const LV_RANK = { paused: 0, reviews: 1, low: 2, normal: 3, high: 4 };
function stageTone(s) {
  const lv = Object.values(s.levels || {});
  if (!lv.length) return 'normal';
  const top = lv.sort((a, b) => LV_RANK[b] - LV_RANK[a])[0];
  return top === 'paused' ? 'reviews' : top;
}
// Calendario pequeño con el día del examen
export const calIcon = (k, size = 22) => { const d = isDay(k) ? dayDate(k).getDate() : ''; return `<svg class="cal-ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" fill="var(--bg)" stroke="currentColor" stroke-width="1.6"/><path d="M3 9.5h18V7.5a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 7.5z" fill="#FF9F92" stroke="currentColor" stroke-width="1.6"/><path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><text x="12" y="18.6" text-anchor="middle" font-size="8.5" font-family="var(--font-hand)" fill="currentColor">${d}</text></svg>`; };
function seasonHTML(fc) {
  const stages = sortStages(P().stages), exams = fc.exams;
  const note = `${plural(stages.length, 'etapa', 'etapas')} · ${plural(exams.length, 'examen', 'exámenes')}`;
  return `<div class="section-h"><h2 id="h-season">Tu temporada</h2><span class="sec-note pt-note-m">${note}</span>
      <span class="pt-legend">${LEVELS.slice().reverse().map(l => `<span><i class="lv-${l.id}"></i>${l.id === 'reviews' ? 'Repasar' : l.label}</span>`).join('')}<span>${calIcon('', 16)} examen</span></span>
      <div class="seg pt-mode" role="group" aria-label="Escala"><button type="button" class="seg-b" data-pl="mode" data-v="months" aria-pressed="${(S.planMode || 'months') === 'months'}">Meses</button><button type="button" class="seg-b" data-pl="mode" data-v="weeks" aria-pressed="${S.planMode === 'weeks'}">Semanas</button></div>
      <button type="button" class="link pt-addexam" data-pl="exam-new">+ Examen</button></div>
    ${stripHTML(fc)}
    <div class="pt-desk"><p class="pl-hand">toca una barra para editarla; arrastra sus bordes para cambiar las fechas</p>
      <div class="pt-wrap"><div class="pt-planner" id="ptPlanner">${plannerHTML()}</div>${S.planSel ? `<aside class="pt-panel" id="ptPanel">${panelHTML()}</aside>` : ''}</div></div>`;
}
// Tira (móvil): las etapas de aquí en adelante, los exámenes encima y los días especiales debajo
function stripHTML() {
  const stages = sortStages(P().stages), exams = examList(), t = today(), sp = live(P().special).filter(s => isDay(s.to) && s.to >= t);
  const end = [stages.at(-1)?.to, exams.at(-1)?.exam, addDays(t, 60)].filter(Boolean).sort().at(-1);
  const span = daysBetween(t, end) + 1, x = k => Math.max(0, Math.min(100, (daysBetween(t, k) / span) * 100));
  const segs = stages.filter(s => s.to >= t).map(s => {
    const a = x(s.from < t ? t : s.from), b = x(addDays(s.to, 1));
    return `<button type="button" class="ps-seg lv-${stageTone(s)}" style="left:${a}%;width:${Math.max(1.5, b - a)}%" data-pl="stage" data-id="${esc(s.id)}" aria-label="Etapa ${stageNum(s.id)}: ${esc(s.name || '')}">${stageNum(s.id)}</button>`;
  }).join('');
  const ex = exams.map(e => `<span class="ps-exam" style="left:${x(e.exam)}%" title="Examen de ${esc(keyName(e.key))} · ${shortDate(e.exam)}">${calIcon(e.exam, 20)}</span>`).join('');
  const sps = sp.map((s, i) => `<span class="ps-sp" style="left:${x(s.from < t ? t : s.from)}%;width:${Math.max(1, x(addDays(s.to, 1)) - x(s.from < t ? t : s.from))}%">${i ? '' : `<em>${esc(s.label || 'especial')}</em>`}</span>`).join('');
  const months = [];
  for (let d = dayDate(t); dayKey(d) <= end; d.setMonth(d.getMonth() + 1, 1)) months.push(dayKey(d));
  const step = Math.ceil(months.length / 6), shown = [];
  for (const k of months.filter((_, i) => !(i % step))) if (!shown.length || x(k) - x(shown.at(-1)) > 9) shown.push(k);
  return `<div class="pt-strip"><div class="ps-exams">${ex}</div><div class="ps-track"><span class="ps-today"></span>${segs || '<span class="ps-empty">sin etapas</span>'}</div>
    <div class="ps-sps">${sps}</div><div class="ps-months">${shown.map(k => `<span style="left:${x(k)}%">${MONTHS[dayDate(k).getMonth()]}</span>`).join('')}</div></div>`;
}
// Planificador (ordenador): filas por carpeta o lista, barras por nivel día a día (etapas, la última semana
// y lo que pasa tras cada examen), los exámenes, los días especiales y la línea de hoy
function plannerRange() {
  const t = today(), stages = sortStages(P().stages), exams = examList();
  if (S.planMode === 'weeks') { const start = addDays(t, -weekdayOf(t)); return { start, end: addDays(start, 13 * 7 - 1), weeks: true }; }
  const d = dayDate(t); d.setDate(1);
  const start = dayKey(d), last = [stages.at(-1)?.to, exams.at(-1)?.exam, addDays(t, 180)].filter(Boolean).sort().at(-1);
  const e = dayDate(last); e.setMonth(e.getMonth() + 1, 0);
  return { start, end: dayKey(e) };
}
function plannerHTML() {
  const { start, end, weeks } = plannerRange(), t = today(), total = daysBetween(start, end) + 1;
  const x = k => (daysBetween(start, k) / total) * 100;
  const cols = [];
  if (weeks) for (let k = start; k <= end; k = addDays(k, 7)) cols.push([k, shortDate(k)]);
  else for (let d = dayDate(start); dayKey(d) <= end; d.setMonth(d.getMonth() + 1, 1)) cols.push([dayKey(d), MONTHS[d.getMonth()]]);
  // Niveles de cada día, de hoy al final (una sola pasada por los días)
  const days = [];
  for (let k = t < start ? start : t; k <= end; k = addDays(k, 1)) days.push({ k, nodes: nodesOnDay(k), st: stageOn(P().stages, k)?.id || '' });
  const items = planItems(), sel = S.planSel;
  const exams = examList();
  const rows = items.map(it => {
    const segs = [];
    for (const d of days) {
      const lv = d.nodes[it.key] ? levelOf(d.nodes[it.key]) : 'normal', last = segs.at(-1);
      if (last && last.lv === lv && last.st === d.st) last.to = d.k; else segs.push({ lv, st: d.st, from: d.k, to: d.k });
    }
    const bars = segs.map(s => {
      const on = sel && sel.key === it.key && (sel.stage || '') === s.st && sel.from === s.from;
      const label = s.lv === 'reviews' ? 'Solo repasar' : s.lv === 'paused' ? 'En pausa' : levelLabel(s.lv);
      const w = x(addDays(s.to, 1)) - x(s.from);
      return `<button type="button" class="tp-bar lv-${s.lv}${on ? ' on' : ''}" style="left:${x(s.from)}%;width:${w}%" data-pl="bar" data-key="${esc(it.key)}" data-stage="${esc(s.st)}" data-from="${s.from}" data-to="${s.to}" title="${esc(it.name)} · ${label} · ${shortDate(s.from)} → ${shortDate(s.to)}" aria-label="${esc(it.name)} · ${label} · ${shortDate(s.from)} → ${shortDate(s.to)}">${w > 6 ? `<span>${label}</span>` : ''}${s.st ? '<i class="tp-edge l" data-edge="from"></i><i class="tp-edge r" data-edge="to"></i>' : ''}</button>`;
    }).join('');
    const ex = exams.filter(e => rootKey(e.key) === it.key && e.exam >= start && e.exam <= end).map(e => `<span class="tp-exam" style="left:${x(e.exam)}%" title="Examen · ${shortDate(e.exam)}">${calIcon(e.exam, 22)}</span>`).join('');
    // Temas con fecha límite de la etapa vigente (carpetas con orden)
    const st = stageOn(P().stages, t), list = it.fid && st?.order?.[it.fid], fresh = freshByDeck();
    let subs = '';
    if (list) {
      let prev = st.from < t ? t : st.from;
      orderedTopics(list, it.fid, S.decks, S.folders).forEach((id, i) => {
        const u = list.find(o => o.deck === id)?.until;
        if (!u || !(fresh.get(id) > 0)) { if (u) prev = addDays(u, 1); return; }
        subs += `<div class="tp-row tp-sub"><div class="tp-name"><b>${esc(S.decks.get(id)?.name || '')}</b><small>${prev <= t ? `hasta ${shortDate(u)}` : `${shortDate(prev)} → ${shortDate(u)}`}</small></div><div class="tp-track"><span class="tp-topic" style="left:${x(prev)}%;width:${Math.max(1.5, x(addDays(u, 1)) - x(prev))}%">${ordinal(i + 1)}</span></div></div>`;
        prev = addDays(u, 1);
      });
    }
    return `<div class="tp-row${levelOf(days[0]?.nodes[it.key] || {}) === 'paused' ? ' tp-paused' : ''}"><div class="tp-name"><b>${esc(it.name)}</b><small>${it.fid ? plural(it.decks.length, 'lista', 'listas') : 'lista'}</small></div><div class="tp-track">${bars}${ex}</div></div>${subs}`;
  }).join('');
  const sp = live(P().special).filter(s => isDay(s.to) && s.to >= start && s.from <= end);
  const spRow = `<div class="tp-row tp-sprow"><div class="tp-name"><b>Días especiales</b><small>menos tiempo o libres</small></div><div class="tp-track">${sp.map(s => `<button type="button" class="tp-sp" data-pl="special" data-id="${esc(s.id)}" style="left:${x(s.from < start ? start : s.from)}%">${icon('sun', { size: 13 })}${esc(s.label || 'especial')} · ${s.minutes ? `${s.minutes} min` : 'libre'}</button>`).join('')}</div></div>`;
  const tint = sp.map(s => { const a = x(s.from < start ? start : s.from); return `<span class="tp-tint" style="left:${a}%;width:${x(addDays(s.to > end ? end : s.to, 1)) - a}%"></span>`; }).join('');
  return `<div class="tp-head"><div class="tp-name"></div><div class="tp-track">${cols.map(([k, l]) => `<span class="tp-col" style="left:${x(k)}%">${l}</span>`).join('')}<span class="tp-hoy" style="left:${x(t)}%">hoy</span></div></div>
    <div class="tp-body"><div class="tp-overlay"><div class="tp-name"></div><div class="tp-track">${tint}<span class="tp-line" style="left:${x(t)}%"></span></div></div>${spRow}${rows || '<p class="muted">Aún no tienes listas.</p>'}</div>`;
}
const nodesOnDay = k => nodesOn(P(), k);
// La barra elegida (ordenador): fechas de su etapa, cuánto y el orden de los temas
function panelHTML() {
  const sel = S.planSel, st = sel.stage && live(P().stages).find(s => s.id === sel.stage), it = planItems().find(x => x.key === sel.key);
  if (!it) return '';
  const lv = st ? levelIn(st, it.key) : baseLevel(it.key), fc = forecast(), ids = it.decks.map(d => d.id);
  const fin = ids.filter(id => fc.rem.get(id)).map(id => fc.sim.finish.get(id)), done = fin.length && fin.every(Boolean) ? fin.sort().at(-1) : null;
  const per = perDayIn(fc, ids, st ? st.from : sel.from, st ? st.to : sel.to);
  const order = st && it.fid && it.decks.length > 1 && !['paused', 'reviews'].includes(lv) ? orderHTML(st, it.fid, fc, 'panel') : '';
  return `<div class="tpp-h"><small>barra elegida</small><button class="icon-btn" data-pl="sel-close" aria-label="Cerrar">${icon('x', { size: 18 })}</button></div>
    <h3>${it.ico}<span>${esc(it.name)}</span></h3>
    ${st ? `<div class="pl-dates"><label>Desde<input type="date" data-stfield="from" data-id="${esc(st.id)}" value="${st.from}"></label><label>Hasta<input type="date" data-stfield="to" data-id="${esc(st.id)}" value="${st.to}"></label></div>`
      : `<p class="muted small">Sin etapa: es tu foco de siempre. <button class="link" data-pl="stage-new" data-from="${sel.from}">Crear una etapa aquí</button></p>`}
    <p class="tpp-lab">Cuánto</p>${levelSeg(it.key, lv, st ? st.id : '', 'set-level')}
    <p class="muted small">${['paused', 'reviews'].includes(lv) ? 'Sin nuevas' : per ? `≈ ${plural(per, 'nueva', 'nuevas')} al día` : 'Sin nuevas por ver'}${done ? ` · acabas el ${shortDate(done)}` : ''}</p>
    ${order}`;
}
const levelSeg = (key, cur, stage, act) => `<div class="seg lv-seg" role="group" aria-label="Cuánto">${LEVELS.map(l => `<button type="button" class="seg-b lvb-${l.id}" data-pl="${act}" data-key="${esc(key)}" data-stage="${esc(stage)}" data-v="${l.id}" aria-pressed="${cur === l.id}">${l.label}</button>`).join('')}</div>`;
// «En este orden»: temas de una carpeta en una etapa, con su fecha límite (en la hoja de la etapa o en el panel)
function orderHTML(st, fid, fc, where) {
  const list = st.order?.[fid] || [], ids = orderedTopics(list, fid, S.decks, S.folders), fresh = freshByDeck();
  let n = 0;
  const rows = ids.map(id => {
    const d = S.decks.get(id), done = !(fresh.get(id) > 0), u = list.find(o => o.deck === id)?.until || '';
    if (!done) n++;
    return `<li class="ord-row${done ? ' done' : ''}" data-deck="${esc(id)}"><span class="ord-h" aria-hidden="true">${icon('grip-vertical', { size: 16 })}</span>
      <span class="ord-n${n === 1 && !done ? ' cur' : ''}">${done ? icon('check', { size: 14 }) : n}</span><span class="ord-name">${esc(d?.name || '')}</span>
      ${done ? '<span class="ord-pill">hecho</span>' : `<label class="ord-pill"><span>${u ? `hasta ${shortDate(u)}` : 'sin fecha'}</span><input type="date" data-until="${esc(id)}" data-fid="${esc(fid)}" data-where="${where}" value="${u}" aria-label="Fecha límite de ${esc(d?.name || '')}"></label>`}</li>`;
  }).join('');
  return `<div class="ord"><div class="ord-h2"><b>${where === 'panel' ? 'En este orden' : `${esc(shortName(S.folders.get(fid)?.name || ''))}, en este orden`}</b><button type="button" class="link" data-pl="spread" data-fid="${esc(fid)}" data-where="${where}">repartir fechas solas</button></div>
    <ul class="ord-list" data-fid="${esc(fid)}" data-where="${where}">${rows}</ul></div>`;
}

/* ---------------- exámenes ---------------- */
function examsHTML(fc) {
  const rows = fc.exams.map(e => `<li><button class="pe-row" data-pl="exam" data-key="${esc(e.key)}">${calIcon(e.exam, 34)}<span class="pe-t"><b>${esc(keyName(e.key))}</b><small>${longDate(e.exam)} · ${e.days === 0 ? 'es hoy' : e.days === 1 ? 'mañana' : `faltan ${e.days} días`}</small></span>
    <span class="pe-st ${e.late ? 'late' : ''}">${e.late ? 'no llegas' : e.finish ? `acabas el ${shortDate(e.finish)}` : e.start ? '' : 'todo visto'}</span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>`).join('');
  return `<div class="section-h"><h2 id="h-exams">Tus exámenes</h2><button type="button" class="link" data-pl="exam-new">+ Examen</button></div>
    ${rows ? `<ul class="pe-list">${rows}</ul>` : '<p class="muted">Sin exámenes. Con una fecha, Flaski te da el ritmo justo para verlo todo antes.</p>'}`;
}

/* ---------------- tus etapas ---------------- */
function stagesHTML(fc) {
  const stages = sortStages(P().stages), t = today(), late = fc.exams.find(e => e.late), prob = late && problemStage(late);
  const exams = examList();
  const cards = stages.map((s, i) => {
    const now = s.from <= t && t <= s.to, past = s.to < t;
    const lv = Object.entries(s.levels || {}).filter(([k]) => keyExists(k)).map(([k, l]) => `<li>${keyIcon(k)}<span>${esc(keyName(k))}</span><em class="pill lv-${l}">${levelLabel(l)}</em></li>`).join('');
    const fresh = freshByDeck();
    const orders = Object.entries(s.order || {}).filter(([fid]) => S.folders.has(fid)).map(([fid, list]) => {
      let cur = false;
      const chips = orderedTopics(list, fid, S.decks, S.folders).map(id => {
        const done = !(fresh.get(id) > 0), u = list.find(o => o.deck === id)?.until, me = !done && !cur;
        if (me) cur = true;
        return `<span class="oc${done ? ' done' : me ? ' cur' : ''}">${esc(S.decks.get(id)?.name || '')}${done ? ' ✓' : u ? ` · hasta ${shortDate(u)}` : ''}</span>`;
      }).join('<span class="oc-arrow">→</span>');
      return `<div class="ps-order"><small>${esc(shortName(S.folders.get(fid).name))}, en este orden</small><div>${chips}</div></div>`;
    }).join('');
    const ex = exams.filter(e => e.exam >= s.from && e.exam <= s.to).map(e => `<li class="ps-ex">${calIcon(e.exam, 30)}<span>Examen · ${shortDate(e.exam)}</span></li>`).join('');
    return `<li class="ps-item${now ? ' now' : ''}${past ? ' past' : ''}"><span class="ps-num">${i + 1}</span>
      <button type="button" class="ps-card${prob?.id === s.id ? ' prob' : ''}" data-pl="stage" data-id="${esc(s.id)}">
        <small class="ps-dates">${s.from === t ? 'hoy' : shortDate(s.from)} → ${shortDate(s.to)}${now ? ' · ahora' : past ? ' · hecha' : ''}${prob?.id === s.id ? ' · aquí está el problema' : ''}</small>
        <b class="ps-name">${esc(s.name || `Etapa ${i + 1}`)}</b>${lv || ex ? `<ul class="ps-lv">${lv}${ex}</ul>` : ''}${orders}</button></li>`;
  }).join('');
  return `<div class="section-h"><h2 id="h-stages">Tus etapas</h2><button type="button" class="link" data-pl="stage-new">+ Etapa</button></div>
    <p class="muted">Qué estudias en cada época y cuánto. Al acabar una, empieza la siguiente sola. Toca una para cambiarla.</p>
    ${cards ? `<ol class="ps-list">${cards}</ol>` : `<div class="empty-box"><p class="muted">Sin etapas, todo sigue tu foco de siempre (abajo).</p>${exams.length ? '<button class="ghost" data-nav="planStart">Hagamos tu plan</button>' : ''}</div>`}`;
}

/* ---------------- la hoja de una etapa ---------------- */
function newStageDraft(from) {
  const t = today(), last = sortStages(P().stages).filter(s => s.to >= t).at(-1);
  const a = from && from >= t ? from : last ? addDays(last.to, 1) : t;
  return { id: newId(), name: '', from: a, to: addDays(a, 30), levels: Object.fromEntries(planItems().map(it => [it.key, baseLevel(it.key)])), order: {}, fresh: true };
}
export function stageSheet(id, from) {
  const s = id && live(P().stages).find(x => x.id === id);
  S.stageDraft = s ? clone(s) : newStageDraft(from);
  drawStageSheet();
}
function draftPlan() { const s = S.stageDraft; return { ...P(), stages: [...live(P().stages).filter(x => x.id !== s.id), s] }; }
function drawStageSheet() {
  const s = S.stageDraft, items = planItems(), fc = forecast(draftPlan());
  const num = sortStages(draftPlan().stages).findIndex(x => x.id === s.id) + 1;
  const rows = items.map(it => {
    const lv = s.levels?.[it.key] || baseLevel(it.key), per = perDayIn(fc, it.decks.map(d => d.id), s.from, s.to);
    return `<div class="st-item"><div class="st-item-h">${it.ico}<b>${esc(it.name)}</b><small>${['paused', 'reviews'].includes(lv) || !per ? 'nada' : `≈ ${plural(per, 'nueva', 'nuevas')}`}</small></div>${levelSeg(it.key, lv, s.id, 'st-level')}</div>`;
  }).join('');
  const orders = items.filter(it => it.fid && it.decks.length > 1 && !['paused', 'reviews'].includes(s.levels?.[it.key] || baseLevel(it.key))).map(it => orderHTML(s, it.fid, fc, 'sheet')).join('');
  openSheet(`<div class="st-sheet"><div class="st-title"><span class="ps-num">${num}</span><input id="stName" maxlength="60" placeholder="Nombre de la etapa" aria-label="Nombre de la etapa" value="${esc(s.name || '')}"></div>
    <div class="pl-dates"><label>Desde<input type="date" id="stFrom" value="${s.from}"></label><label>Hasta<input type="date" id="stTo" value="${s.to}"></label></div>
    <p class="st-lab">Cuánto de cada cosa</p>${rows || '<p class="muted">Aún no tienes listas.</p>'}
    ${orders}
    ${stageVerdict(s, fc)}
    <button class="primary big" data-pl="st-save">Guardar la etapa</button>
    ${s.fresh ? '' : `<button class="link danger st-del" data-pl="st-del">Borrar la etapa</button>`}</div>`);
  const name = document.getElementById('stName');
  name.addEventListener('input', () => { s.name = name.value; });
  for (const id of ['stFrom', 'stTo']) document.getElementById(id).addEventListener('change', e => { if (isDay(e.target.value)) { s[id === 'stFrom' ? 'from' : 'to'] = e.target.value; drawStageSheet(); } });
  bindOrder(document.getElementById('sheetBody'));
}
// «bien · Con estas fechas acabas Turco el 2 dic, 10 días antes del examen.»
function stageVerdict(s, fc) {
  const keys = Object.entries(s.levels || {}).filter(([, l]) => !['paused', 'reviews'].includes(l)).map(([k]) => k);
  const ex = fc.exams.filter(e => keys.includes(rootKey(e.key)) && e.exam >= s.from);
  if (ex.length) {
    const e = ex[0];
    return e.late ? `<div class="st-verdict bad"><b>ojo</b><p>Con estas fechas no acabas ${esc(shortName(keyName(e.key)))} antes del examen: ${missing(e.left)}.</p></div>`
      : `<div class="st-verdict"><b>bien</b><p>Con estas fechas acabas ${esc(shortName(keyName(e.key)))} el ${shortDate(e.finish || today())}${e.margin > 0 ? `, ${plural(e.margin, 'día', 'días')} antes del examen` : ''}.</p></div>`;
  }
  const high = keys.find(k => s.levels[k] === 'high');
  if (!high) return '';
  const ids = keyDecks(high).map(d => d.id).filter(id => fc.rem.get(id)), fin = ids.map(id => fc.sim.finish.get(id));
  if (!ids.length || fin.some(f => !f)) return '';
  const f = fin.sort().at(-1);
  return `<div class="st-verdict"><b>${f <= s.to ? 'bien' : 'ojo'}</b><p>Con estas fechas acabas ${esc(shortName(keyName(high)))} el ${shortDate(f)}${f > s.to ? ', después de la etapa' : ''}.</p></div>`;
}
function saveStage() {
  const s = S.stageDraft;
  if (!isDay(s.from) || !isDay(s.to)) return toast('Pon las dos fechas');
  if (s.from > s.to) [s.from, s.to] = [s.to, s.from];
  s.name = (s.name || '').trim().slice(0, 60) || `Etapa ${sortStages(draftPlan().stages).findIndex(x => x.id === s.id) + 1}`;
  delete s.fresh;
  putIn(P().stages, s);
  S.stageDraft = null;
  closeSheet(); saveAndDraw();
}
function deleteStage(id) {
  putIn(P().stages, { id, deleted: true });
  if (S.planSel?.stage === id) S.planSel = null;
  closeSheet(); saveAndDraw();
}
// La etapa que se edita: el borrador de la hoja o, en el panel, la guardada
const orderStage = where => (where === 'sheet' ? S.stageDraft : live(P().stages).find(x => x.id === S.planSel?.stage));
function afterOrder(where, st) {
  if (where === 'sheet') return drawStageSheet();
  putIn(P().stages, st); saveAndDraw();
}
function setUntil(where, fid, deck, value) {
  const st = orderStage(where);
  if (!st) return;
  st.order = st.order || {};
  const list = orderedTopics(st.order[fid], fid, S.decks, S.folders).map(id => ({ ...(st.order[fid] || []).find(o => o.deck === id), deck: id }));
  const o = list.find(x => x.deck === deck);
  if (isDay(value)) o.until = value; else delete o.until;
  st.order[fid] = list;
  afterOrder(where, st);
}
// «repartir fechas solas»: cada tema, hasta el día en que lo acabas con el plan de esa etapa
function spread(where, fid) {
  const st = orderStage(where);
  if (!st) return;
  st.order = st.order || {};
  const ids = orderedTopics(st.order[fid], fid, S.decks, S.folders);
  st.order[fid] = ids.map(deck => ({ deck }));
  const plan = where === 'sheet' ? draftPlan() : P(), fc = forecast(plan);
  st.order[fid] = ids.map(deck => { const f = fc.sim.finish.get(deck); return fc.rem.get(deck) ? { deck, until: f && f <= st.to ? f : st.to } : { deck }; });
  afterOrder(where, st);
}
// Arrastrar un tema por su asa para cambiar el orden
function bindOrder(root) {
  for (const ul of root.querySelectorAll('.ord-list')) {
    ul.addEventListener('pointerdown', e => {
      const h = e.target.closest('.ord-h'), li = h?.closest('.ord-row');
      if (!li) return;
      e.preventDefault();
      li.classList.add('dragging');
      const move = ev => {
        const rows = [...ul.querySelectorAll('.ord-row')].filter(r => r !== li);
        const after = rows.find(r => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
        ul.insertBefore(li, after || null);
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        li.classList.remove('dragging');
        const st = orderStage(ul.dataset.where), fid = ul.dataset.fid;
        if (!st) return;
        const old = st.order?.[fid] || [];
        st.order = { ...(st.order || {}), [fid]: [...ul.querySelectorAll('.ord-row')].map(r => ({ ...old.find(o => o.deck === r.dataset.deck), deck: r.dataset.deck })) };
        afterOrder(ul.dataset.where, st);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  }
  for (const inp of root.querySelectorAll('[data-until]')) inp.addEventListener('change', () => setUntil(inp.dataset.where, inp.dataset.fid, inp.dataset.until, inp.value));
}

/* ---------------- qué estudias (el foco) ---------------- */
function focusHTML() {
  const st = stageOn(P().stages, today()), per = newPlan('all', { steady: true });
  const rows = planItems().map(it => {
    const lv = st ? levelIn(st, it.key) : baseLevel(it.key), n = sum(it.decks.map(d => d.id), per);
    return `<li><button class="pf-row" data-pl="focus" data-key="${esc(it.key)}">${it.ico}<span class="pf-t"><b class="pl-name">${esc(it.name)}</b><small class="pl-meta">${['paused', 'reviews'].includes(lv) ? (lv === 'paused' ? 'no entra nada' : 'solo repasos') : n ? `≈ ${plural(n, 'nueva', 'nuevas')} al día` : 'sin nuevas pendientes'}</small></span><em class="pill lv-${lv}">${levelLabel(lv)}</em></button></li>`;
  }).join('');
  return `<div class="section-h"><h2 id="h-focus">Qué estudias</h2><span class="sec-note">${st ? `en la etapa «${esc(st.name)}»` : 'tu foco de siempre'}</span></div>
    <p class="muted">Cuánto entra de cada cosa. Los repasos de todo lo que no está en pausa salen siempre.</p>
    ${rows ? `<ul class="pf-list">${rows}</ul>` : '<div class="empty"><p class="muted">Aún no tienes listas. Crea una o busca alguna en Explorar.</p></div>'}`;
}
const LEVEL_HINT = { paused: 'No entra nada al estudiar «Todo».', reviews: 'No entran nuevas, pero repasas lo que ya sabes.', low: 'Entran nuevas, menos que en lo demás.', normal: 'Nuevas y repasos, a partes iguales con lo demás.', high: 'Se lleva la mayor parte de las nuevas.' };
function focusSheet(key) {
  const st = stageOn(P().stages, today()), lv = st ? levelIn(st, key) : baseLevel(key);
  const kids = key.startsWith('f:') ? (() => { const k = childrenOf(key.slice(2), S.decks, S.folders); return [...k.folders.sort(byName).map(f => folderKey(f.id)), ...k.decks.sort(byName).map(d => d.id)]; })() : [];
  openSheet(`<h2 class="sheet-hand pf-h">${keyIcon(key)} ${esc(keyName(key))}</h2>
    ${st ? `<p class="pl-stage-note">Cambia el foco en la etapa «${esc(st.name)}»</p>` : ''}
    ${levelSeg(key, lv, st?.id || '', 'focus-set')}<p class="hint">${LEVEL_HINT[lv]}</p>
    ${kids.length && !st ? `<p class="st-lab">Dentro</p>${kids.map(k => `<div class="st-item"><div class="st-item-h">${keyIcon(k)}<b>${esc(keyName(k))}</b></div>${levelSeg(k, baseLevel(k), '', 'focus-set')}</div>`).join('')}` : ''}
    ${planNodes()[key]?.exam ? `<button class="link" data-pl="exam" data-key="${esc(key)}">Ver su examen</button>` : ''}`);
}
function setFocus(key, stageId, lv) {
  const st = stageId && live(P().stages).find(s => s.id === stageId);
  if (st) { st.levels = { ...(st.levels || {}), [key]: lv }; putIn(P().stages, st); } else setBaseLevel(key, lv);
  savePrefsSoon();
  if (document.getElementById('sheet').hidden === false && document.querySelector('#sheetBody .pf-h')) focusSheet(document.querySelector('#sheetBody [data-pl="focus-set"]').dataset.key);
  saveAndDraw();
}

/* ---------------- planificador: elegir y arrastrar ---------------- */
function bindPlanner() {
  const pl = document.getElementById('ptPlanner');
  if (!pl) return;
  for (const inp of document.querySelectorAll('#ptPanel [data-stfield]')) inp.addEventListener('change', () => {
    const st = live(P().stages).find(s => s.id === inp.dataset.id);
    if (!st || !isDay(inp.value)) return;
    st[inp.dataset.stfield] = inp.value;
    if (st.from > st.to) [st.from, st.to] = [st.to, st.from];
    S.planSel = { ...S.planSel, from: st.from > today() ? st.from : today() };
    putIn(P().stages, st); saveAndDraw();
  });
  const panel = document.getElementById('ptPanel');
  if (panel) bindOrder(panel);
  // Arrastrar el borde de una barra cambia la fecha de su etapa
  pl.addEventListener('pointerdown', e => {
    const edge = e.target.closest('.tp-edge'), bar = edge?.closest('.tp-bar');
    if (!bar || !bar.dataset.stage) return;
    e.preventDefault(); e.stopPropagation();
    const track = bar.parentElement, { start, end } = plannerRange(), total = daysBetween(start, end) + 1;
    const st = live(P().stages).find(s => s.id === bar.dataset.stage), side = edge.dataset.edge;
    if (!st) return;
    let k = st[side];
    const move = ev => {
      const r = track.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      k = addDays(start, Math.round(f * total) - (side === 'to' ? 1 : 0));
      const a = side === 'from' ? k : bar.dataset.from, b = side === 'to' ? k : bar.dataset.to;
      if (a > b) return;
      bar.style.left = `${(daysBetween(start, a) / total) * 100}%`;
      bar.style.width = `${((daysBetween(a, b) + 1) / total) * 100}%`;
      bar.classList.add('dragging');
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (k === st[side] || (side === 'from' ? k > st.to : k < st.from)) return renderPlan();
      st[side] = k;
      S.planSel = null;
      putIn(P().stages, st); saveAndDraw();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
}

/* ===================== clics ===================== */
export function planClick(b) {
  const ds = b.dataset;
  switch (ds.pl) {
    case 'day': return daySheet(ds.day);
    case 'set-day': return setDay(ds.day, Number(ds.min));
    case 'week-off': P().week = null; closeSheet(); return saveAndDraw();
    case 'special': return specialSheet(ds.id);
    case 'special-new': return specialSheet('');
    case 'special-save': return saveSpecial(ds.id);
    case 'special-del': putIn(P().special, { id: ds.id, deleted: true }); closeSheet(); return saveAndDraw();
    case 'mode': S.planMode = ds.v; S.planSel = null; return renderPlan();
    case 'bar': S.planSel = { key: ds.key, stage: ds.stage, from: ds.from, to: ds.to }; return renderPlan();
    case 'sel-close': S.planSel = null; return renderPlan();
    case 'set-level': return setFocus(ds.key, ds.stage, ds.v);
    case 'stage': return stageSheet(ds.id);
    case 'stage-new': return stageSheet('', ds.from);
    case 'st-level': S.stageDraft.levels = { ...(S.stageDraft.levels || {}), [ds.key]: ds.v }; return drawStageSheet();
    case 'st-save': return saveStage();
    case 'st-del': return deleteStage(S.stageDraft.id);
    case 'spread': return spread(ds.where, ds.fid);
    case 'focus': return focusSheet(ds.key);
    case 'focus-set': return setFocus(ds.key, ds.stage, ds.v);
    case 'fix-pick': S.planFixPick = Number(ds.i); document.querySelectorAll('.fix-opt').forEach(x => x.setAttribute('aria-checked', String(x === b))); return;
    case 'fix-apply': return applyFix();
    case 'fix-keep': P().lateOk = lateKey(forecast()); return saveAndDraw();
    case 'undo': { const u = S.planUndo; if (!u) return; Object.assign(S.prefs.plan, u.plan); S.newPerDay = u.npd; S.planUndo = null; toast('Deshecho'); return saveAndDraw(); }
    case 'exam': return go('exam', { examKey: ds.key });
    case 'exam-new': return examSheet('');
    case 'exam-edit': return examSheet(ds.key);
    case 'exam-pick': S.examDraft.key = ds.key; return drawExamSheet();
    case 'exam-month': { const d = dayDate(S.examDraft.month); d.setMonth(d.getMonth() + Number(ds.d), 1); S.examDraft.month = dayKey(d); return drawExamSheet(); }
    case 'exam-day': S.examDraft.date = ds.k; return drawExamSheet();
    case 'exam-save': return saveExam();
    case 'exam-del': return confirmSheet('¿Quitar el examen?', 'exam-del-ok', 'Quitar');
    case 'exam-last': { const n = planNodes()[S.examKey]; if (n && (n.lastWeek || addDays(n.exam, -7) > today())) { n.lastWeek = !n.lastWeek; saveAndDraw(); } return; }
    case 'exam-after': return afterSheet();
    case 'exam-after-set': { const n = planNodes()[S.examKey]; if (n) { if (ds.v) n.after = ds.v; else delete n.after; } closeSheet(); return saveAndDraw(); }
    case 'exam-map': return examMap();
    case 'exam-resist': return practiceResist(mapScope(S.examKey));
    case 'start-min': S.planStart.min = ds.v === 'free' ? null : Number(ds.v); return renderPlanStart();
    case 'start-ok': return startOk(false);
    case 'start-edit': return startOk(true);
    case 'start-own': P().startDone = true; savePrefsSoon(); return go('plan');
  }
}
// «Quitar el examen» confirmado (lo llama app.js)
export function removeExam() {
  const n = planNodes()[S.examKey];
  if (n) { delete n.exam; delete n.lastWeek; delete n.after; if (!Object.keys(n).length) delete planNodes()[S.examKey]; }
  savePrefsSoon(); closeSheet(); toast('Examen quitado'); go('plan');
}

/* ===================== nuevo examen ===================== */
export function examSheet(key) {
  const n = key && planNodes()[key], t = today(), items = planItems();
  const date = n?.exam && n.exam >= t ? n.exam : addDays(t, 60);
  S.examDraft = { key: key || items[0]?.key || '', old: key || '', date, month: date.slice(0, 8) + '01' };
  drawExamSheet();
}
function drawExamSheet() {
  const x = S.examDraft, t = today(), rem = remaining();
  const items = planItems();
  if (x.key && !items.some(i => i.key === x.key) && keyExists(x.key)) items.unshift({ key: x.key, name: keyName(x.key), ico: keyIcon(x.key), decks: keyDecks(x.key), fid: x.key.startsWith('f:') ? x.key.slice(2) : '' });
  const opts = items.map(it => {
    const left = sum(it.decks.map(d => d.id), rem), pages = it.fid ? [...S.pages.values()].filter(p => p.folder_id === it.fid).length : 0;
    const sub = it.fid ? ['carpeta', pages ? plural(pages, 'apunte', 'apuntes') : '', plural(it.decks.length, 'lista', 'listas'), left ? plural(left, 'nueva', 'nuevas') : ''].filter(Boolean).join(' · ') : 'lista suelta';
    return `<button type="button" class="ex-opt" role="radio" aria-checked="${x.key === it.key}" data-pl="exam-pick" data-key="${esc(it.key)}">${it.ico}<span><b>${esc(it.name)}</b><small>${sub}</small></span><i class="ex-radio"></i></button>`;
  }).join('');
  // Calendario del mes
  const m = dayDate(x.month), first = x.month, lead = weekdayOf(first), dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead)].map(() => '<span></span>').concat([...Array(dim)].map((_, i) => {
    const k = addDays(first, i), past = k < t;
    return `<button type="button" class="cal-d${k === x.date ? ' on' : ''}${k === t ? ' today' : ''}" data-pl="exam-day" data-k="${k}" ${past ? 'disabled' : ''} aria-label="${longDate(k)}" aria-pressed="${k === x.date}">${i + 1}</button>`;
  })).join('');
  // Cuántas nuevas al día hacen falta
  const ids = keyDecks(x.key).map(d => d.id), left = sum(ids, rem), days = newDays(x.key, t, x.date, x.old ? planNodes()[x.old]?.lastWeek : daysBetween(t, x.date) > 21);
  const need = Math.ceil(left / days), per = sum(ids, newPlan('all', { steady: true }));
  const lvl = baseLevel(rootKey(x.key)), name = esc(shortName(keyName(x.key)));
  const tip = !x.key ? '' : !left ? '<p>Ya lo has visto todo: hasta el examen, a repasar.</p>'
    : `<p><b class="ex-need">≈ ${need}</b> ${need === 1 ? 'nueva' : 'nuevas'} al día ${need === 1 ? 'basta' : 'bastan'} para ver todo antes del ${shortDate(x.date)}.${per >= need * 2 && lvl !== 'low' ? ` Sobra tiempo: puedes bajar ${name} a «Poco».` : per < need ? ` Ahora le tocan ${per}: súbelo de nivel o empieza ya.` : ''}</p>`;
  openSheet(`<div class="ex-sheet"><h2 class="sheet-hand">${x.old ? 'Cambiar el examen' : 'Nuevo examen'}</h2>
    <p class="st-lab">¿De qué es?</p><div class="ex-opts" role="radiogroup">${opts || '<p class="muted">Aún no tienes listas.</p>'}</div>
    <div class="cal-h"><p class="st-lab">¿Cuándo?</p><span class="cal-nav"><button type="button" class="icon-btn" data-pl="exam-month" data-d="-1" aria-label="Mes anterior">${icon('chevron-left', { size: 18 })}</button><b>${MONTHS_LONG[m.getMonth()]} ${m.getFullYear()}</b><button type="button" class="icon-btn" data-pl="exam-month" data-d="1" aria-label="Mes siguiente">${icon('chevron-right', { size: 18 })}</button></span></div>
    <div class="cal-grid">${WEEK_SHORT.map(d => `<small>${d}</small>`).join('')}${cells}</div>
    ${tip ? `<div class="ex-tip">${tip}</div>` : ''}
    <button class="primary big" data-pl="exam-save" ${x.key ? '' : 'disabled'}>Guardar examen</button></div>`);
}
// Días con nuevas hasta el examen: sin el examen, sin los libres (de tu semana o días especiales) y, si la
// última semana es solo de repasos, sin esa semana
function newDays(key, t, exam, lastWeek) {
  let n = 0;
  for (let k = t; k < exam; k = addDays(k, 1)) {
    if (lastWeek && daysBetween(k, exam) <= 7) continue;
    if (minutesOn(P(), k) === 0) continue;
    n++;
  }
  return Math.max(1, n);
}
function saveExam() {
  const x = S.examDraft, N = planNodes();
  if (!x.key || !isDay(x.date)) return;
  let extra = { lastWeek: daysBetween(today(), x.date) > 21, after: 'reviews' };
  if (x.old && N[x.old]) {
    extra = { lastWeek: N[x.old].lastWeek, after: N[x.old].after };
    if (x.old !== x.key) { delete N[x.old].exam; delete N[x.old].lastWeek; delete N[x.old].after; if (!Object.keys(N[x.old]).length) delete N[x.old]; }
  }
  N[x.key] = { ...(N[x.key] || {}), exam: x.date };
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete N[x.key][k]; else N[x.key][k] = v;
  savePrefsSoon(); closeSheet();
  toast(x.old ? 'Examen cambiado' : 'Examen guardado');
  if (S.view === 'exam') { S.examKey = x.key; renderExam(); } else saveAndDraw();
}

/* ===================== ficha del examen ===================== */
const mapScope = key => (key.startsWith('f:') ? 'folder:' + key.slice(2) : key);
function examMap() {
  const key = S.examKey;
  setMapView(mapScope(key), true);
  if (key.startsWith('f:')) go('decks', { folderId: key.slice(2) }); else go('deck', { deckId: key, cardQuery: '' });
}
const AFTER = { reviews: 'pasa a «Solo repasar»', paused: 'se pone en pausa', low: 'pasa a «Poco»', '': 'sigue igual' };
function afterSheet() {
  const n = planNodes()[S.examKey] || {};
  openSheet(`<h2 class="sheet-hand">Después del examen</h2><p class="muted">Qué pasa con ${esc(keyName(S.examKey))} a partir del día siguiente.</p>
    <div class="fix-list">${[['reviews', 'Solo repasar', 'Lo repasas para no olvidarlo, sin nuevas.'], ['low', 'Poco', 'Sigues con nuevas, pero menos.'], ['paused', 'Pausa', 'No entra nada.'], ['', 'Sigue igual', 'Como lo tengas en el plan.']].map(([v, l, h]) => `<button type="button" class="fix-opt" role="radio" aria-checked="${(n.after || '') === v}" data-pl="exam-after-set" data-v="${v}"><span class="fix-dot"></span><span><b>${l}</b><small>${h}</small></span></button>`).join('')}</div>`);
}
export function renderExam() {
  const key = S.examKey, n = planNodes()[key];
  if (!n?.exam || !keyExists(key)) { S.view = 'plan'; return renderPlan(); }
  const t = today(), days = daysBetween(t, n.exam), fc = forecast(), e = fc.exams.find(x => x.key === key);
  const ids = keyDecks(key).map(d => d.id), idSet = new Set(ids);
  const cards = [...S.cards.values()].filter(c => idSet.has(c.deck_id)), seen = cards.filter(c => S.progress.get(c.id)).length;
  const known = cards.filter(c => (S.progress.get(c.id)?.interval || 0) >= 21).length, pct = cards.length ? Math.round((100 * seen) / cards.length) : 0;
  const per = sum(ids, newPlan('all', { steady: true }));
  const status = days < 0 ? `<div class="pl-sum"><h2>El examen ya pasó</h2><p>Si lo terminaste, ${esc(keyName(key))} ${AFTER[n.after || '']}.</p></div>`
    : !e?.start ? '<div class="pl-sum ok"><h2>Ya has visto todo el temario</h2><p>Hasta el examen, a repasar.</p></div>'
    : e.late ? `<div class="pl-sum late"><h2>Así no llegas</h2><p>Te quedan ${plural(e.start, 'pregunta nueva', 'preguntas nuevas')}: al ${shortDate(n.exam)} ${missing(e.left)}. <button class="link" data-nav="plan">Ver cómo arreglarlo</button></p></div>`
    : `<div class="pl-sum"><h2>Vas bien: acabas el temario el ${shortDate(e.finish)}</h2><p>Te quedan ${plural(e.start, 'pregunta nueva', 'preguntas nuevas')}. Con ${per || 'unas pocas'} al día llegas${e.margin > 0 ? ` con ${plural(e.margin, 'día', 'días')} de margen para repasar` : ''}.</p></div>`;
  // Lo que más se te resiste (del mapa)
  const m = mapModel(mapScope(key));
  const resist = m ? [...m.cells.values()].filter(c => c.state === 'resiste').sort((a, b) => b.events.filter(x => x.grade === 1).length - a.events.filter(x => x.grade === 1).length).slice(0, 3) : [];
  const rn = m ? resistIds(m).length : 0;
  const resistHTML = resist.length ? `<div class="section-h"><h2>Lo que más se te resiste</h2></div><ul class="exr-list">${resist.map(c => {
    const card = S.cards.get(c.ids[0]);
    return `<li><span class="exr-chip">${esc(c.label)}</span><span><b>${esc(S.decks.get(card?.deck_id)?.name || '')}</b><small>${esc(failNote(c) || `${plural(c.ids.length, 'pregunta', 'preguntas')}`)}</small></span></li>`;
  }).join('')}</ul><button class="soft-btn big" data-pl="exam-resist">Practicar lo que se resiste · ${rn}</button>` : '';
  const lastFrom = addDays(n.exam, -7), inLast = lastFrom <= t;
  main.innerHTML = `<div class="ex-page"><div class="crumbs-row"><button class="back-round" data-nav="plan" aria-label="Volver al plan">${icon('chevron-left', { size: 22 })}</button><button class="link crumb-link" data-nav="plan">Plan de estudio ›</button></div>
    <div class="ex-head">${calIcon(n.exam, 96)}<div><small>examen · ${longDate(n.exam)}</small><h1>${esc(keyName(key))}</h1><b>${days > 1 ? `faltan ${days} días` : days === 1 ? 'es mañana' : days === 0 ? 'es hoy' : `fue hace ${plural(-days, 'día', 'días')}`}</b></div></div>
    <div class="ex-grid"><div class="ex-l">
    ${status}
    <div class="section-h"><h2>Cómo llevas el temario</h2></div>
    <div class="ex-bar"><span style="width:${pct}%"></span></div>
    <div class="ex-bar-l"><span>${pct} % visto · ${seen} de ${cards.length}</span><span>te las sabes: ${cards.length ? Math.round((100 * known) / cards.length) : 0} %</span></div>
    ${m ? '<button class="link" data-pl="exam-map">Ver el mapa de lo que sabes</button>' : ''}
    ${resistHTML}
    <div class="section-h"><h2>La recta final</h2></div>
    <div class="set-row${inLast && !n.lastWeek ? ' is-off' : ''}"><div class="set-l"><b id="exLastL">La última semana, solo repasos</b><small>${inLast ? (n.lastWeek ? 'Ya estás en la última semana: no entran preguntas nuevas.' : 'Ya estás en la última semana: las nuevas siguen entrando hasta el examen.') : n.lastWeek ? `Desde el ${shortDate(lastFrom)} no entran preguntas nuevas.` : 'Las nuevas siguen entrando hasta el examen.'}</small></div>
      <div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="exLastL" data-pl="exam-last" ${n.lastWeek ? 'checked' : ''} ${inLast && !n.lastWeek ? 'disabled' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>
    <div class="set-row"><div class="set-l"><b>Después del examen</b><small>${esc(keyName(key))} ${AFTER[n.after || '']}.</small></div><div class="set-c"><button class="link" data-pl="exam-after">cambiar</button></div></div>
    <div class="ex-foot"><button class="link" data-pl="exam-edit" data-key="${esc(key)}">Cambiar fecha</button><button class="link danger" data-pl="exam-del">Quitar el examen</button></div>
    </div><div class="ex-r">${simBlockHTML(key)}</div></div></div>`;
}

/* ===================== primera vez: «Hagamos tu plan» ===================== */
const START_MIN = [[15, '15 min', 'un rato'], [30, '30 min', 'lo normal'], [60, '1 h', 'en serio'], ['free', 'a mi aire', 'cada día']];
// Etapas propuestas: por cada examen, acabar su temario (Mucho; los demás exámenes, Poco) y la recta final
// (Repasar), que dura el 25 % del tiempo que queda: entre 2 y 7 días. Lo de exámenes ya pasados, a repasar. Después del último examen, nada.
export function proposeStages(exams, t = today()) {
  const out = [];
  let start = t;
  exams.forEach((e, i) => {
    const rk = rootKey(e.key), later = exams.slice(i + 1).map(x => rootKey(x.key)).filter(k => k !== rk), before = exams.slice(0, i).map(x => rootKey(x.key)).filter(k => k !== rk);
    const levels = () => Object.fromEntries([...before.map(k => [k, 'reviews']), ...later.map(k => [k, 'low'])]);
    const fin = Math.min(7, Math.max(2, Math.round(daysBetween(start, e.exam) * 0.25)));
    const finEnd = addDays(e.exam, -(fin + 1)), name = shortName(keyName(e.key));
    if (finEnd >= start) { out.push({ id: newId(), name: `Acabar el temario de ${name}`, from: start, to: finEnd, levels: { ...levels(), [rk]: 'high' }, order: {} }); start = addDays(finEnd, 1); }
    if (e.exam >= start) out.push({ id: newId(), name: `Recta final de ${name}`, from: start, to: e.exam, levels: { ...levels(), [rk]: 'reviews' }, order: {} });
    start = addDays(e.exam, 1);
  });
  return out;
}
export function renderPlanStart() {
  const exams = examList();
  if (!exams.length) { S.view = 'plan'; return renderPlan(); }
  if (!S.planStart) {
    const m = S.prefs.study.tandaMin;
    S.planStart = { min: P().week ? Math.round(weekAverage(P().week, m)) : m >= 45 ? 60 : m >= 20 ? 30 : m >= 13 ? 15 : 15 };
  }
  const ps = S.planStart, stages = proposeStages(exams);
  const week = ps.min ? Object.fromEntries(WEEK.map(d => [d, ps.min])) : null;
  ps.stages = stages; ps.week = week;
  // Las nuevas al día que caben en ese rato (una de cada cuatro preguntas de la tanda); a tu aire, las de siempre
  const fits = ps.min ? Math.max(5, Math.round(tandaSize(ps.min, shortInfo().secs) / 4)) : S.newPerDay;
  const plan2 = { ...P(), stages, week };
  let npd = fits, fc = forecast(plan2, npd);
  // Si así no llegas, la propuesta ya lleva cuántas nuevas hacen falta
  if (fc.exams.some(e => e.late)) {
    let lo = npd, hi = 500;
    if (forecast(plan2, hi).exams.some(e => e.late)) npd = hi;
    else { while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (forecast(plan2, mid).exams.some(e => e.late)) lo = mid; else hi = mid; } npd = hi; }
    fc = forecast(plan2, npd);
  }
  ps.npd = npd;
  const raised = npd > fits;
  const late = fc.exams.filter(e => e.late);
  const names = exams.map(e => `<b>${esc(keyName(e.key))} el ${shortDate(e.exam)}</b>`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0];
  const cards = stages.map((s, i) => `<li class="psx"><span class="ps-num">${i + 1}</span><div><small>${s.from === today() ? 'hoy' : shortDate(s.from)} → ${shortDate(s.to)}</small><b>${esc(s.name)}</b>
    <span class="psx-lv">${Object.entries(s.levels).map(([k, l]) => `${keyIcon(k)}<em class="pill lv-${l}">${levelLabel(l)}</em>`).join('')}</span></div></li>`).join('');
  const verdict = late.length ? `<div class="st-verdict bad"><b class="hand">Así no llegas a ${late.length === exams.length && exams.length > 1 ? 'ninguno' : `${esc(shortName(keyName(late[0].key)))}`}</b><p>Ni con  nuevas al día: mueve el examen o cambia las etapas después.</p></div>`
    : `<div class="st-verdict"><b class="hand">${exams.length === 1 ? 'Así llegas' : exams.length === 2 ? 'Así llegas a los dos' : `Así llegas a los ${exams.length}`}</b><p class="pls-npd">${raised ? `Para llegar, ${npd} nuevas al día.` : `Con ${npd} nuevas al día.`}</p><p>${cap(fc.exams.filter(e => e.finish).map(e => `acabas ${esc(shortName(keyName(e.key)))} el ${shortDate(e.finish)}`).join(' y '))}${fc.exams.some(e => e.finish) ? '.' : 'Ya lo has visto todo: a repasar.'}</p></div>`;
  main.innerHTML = `<div class="pls-page"><div class="crumbs-row"><button class="back-round" data-nav="plan" aria-label="Volver al plan">${icon('chevron-left', { size: 22 })}</button><h1>Hagamos tu plan</h1></div>
    <p class="pls-lead">Tienes ${exams.length === 1 ? 'un examen' : exams.length === 2 ? 'dos exámenes' : `${exams.length} exámenes`}: ${list}. Contesta una cosa y te propongo cómo repartirlo.</p>
    <p class="st-lab">¿Cuánto tiempo sueles tener al día?</p>
    <div class="pls-min" role="radiogroup">${START_MIN.map(([v, l, h]) => `<button type="button" class="pls-opt" role="radio" data-pl="start-min" data-v="${v}" aria-checked="${(ps.min ?? 'free') === v}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>
    <p class="muted small">Luego puedes cambiarlo día a día, y marcar vacaciones.</p>
    <div class="section-h pls-h"><h2>Así lo haría yo</h2><span class="pl-hand">lo cambias cuando quieras</span></div>
    <ol class="psx-list">${cards}</ol>
    ${verdict}
    <div class="btnrow pls-btns"><button class="primary big" data-pl="start-ok">Me vale</button><button class="ghost big" data-pl="start-edit">Lo cambio</button></div>
    <button class="link pls-own" data-pl="start-own">Prefiero hacerlo yo desde cero</button></div>`;
}
function startOk(edit) {
  const ps = S.planStart;
  if (!ps) return;
  P().week = ps.week ? { ...ps.week } : null;
  if (ps.npd) S.newPerDay = ps.npd;
  for (const s of ps.stages) putIn(P().stages, s);
  P().startDone = true;
  const first = ps.stages[0]?.id;
  S.planStart = null;
  savePrefsSoon();
  go('plan');
  toast('Plan guardado');
  if (edit && first) stageSheet(first);
}
