// Flaski · plan de estudio: la hoja de nuevo examen (y la de cambiarlo). Qué entra (una carpeta, una lista o
// varias), cuándo es, cuánto tiempo tienes, el resultado en vivo y los dos interruptores (la última semana, solo
// repasar; después del examen, en pausa).
import { icon } from '../icons.js';
import { WEEK, WEEK_NAMES, dayKey, addDays, daysBetween, weekdayOf, isDay, childrenOf, decksUnder } from '../plan.js';
import { S, esc, toast, folderIcon, deckIcon } from '../comun.js';
import { plan2, forecastNow, stateNow } from '../plan2-app.js';
import { whatIf, liveExams, examTopics } from '../plan2.js';
import { examIdFor } from '../plan2-migrar.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { fmtMin } from './plan-tiempo.js';
import { examBarHTML, longDay, shortDay, shortName } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';
import { go } from '../app.js';

const byName = (a, b) => a.name.localeCompare(b.name, 'es', { numeric: true });
// Lo que puede entrar en un examen: las carpetas (de cualquier nivel) y las listas sueltas
export function scopeItems() {
  const top = childrenOf(null, S.decks, S.folders), out = [];
  const walk = (f, depth) => { out.push({ key: 'f:' + f.id, name: f.name, depth, ico: folderIcon(f) }); for (const c of childrenOf(f.id, S.decks, S.folders).folders.sort(byName)) walk(c, depth + 1); };
  for (const f of top.folders.sort(byName)) walk(f, 0);
  for (const d of top.decks.sort(byName)) out.push({ key: d.id, name: d.name, depth: 0, ico: deckIcon(d) });
  return out.filter(x => (x.key.startsWith('f:') ? decksUnder(x.key.slice(2), S.decks, S.folders).length : true));
}
const scopeOf = keys => ({ folders: keys.filter(k => k.startsWith('f:')).map(k => k.slice(2)), decks: keys.filter(k => !k.startsWith('f:')), pages: [] });
const keyName = k => (k.startsWith('f:') ? S.folders.get(k.slice(2))?.name : S.decks.get(k)?.name) || '';
const ctx = () => ({ decks: S.decks, folders: S.folders, pages: S.pages });
// «8 temas · 525 preguntas · 100 vistas»
function scopeSummary(keys) {
  const ids = examTopics({ scope: scopeOf(keys) }, ctx()), set = new Set(ids);
  let n = 0, seen = 0;
  for (const c of S.cards.values()) if (set.has(c.deck_id)) { n++; if (S.progress.has(c.id)) seen++; }
  return `${plural(ids.length, 'tema', 'temas')} · ${plural(n, 'pregunta', 'preguntas')} · ${plural(seen, 'vista', 'vistas')}`;
}
const weekText = w => {
  const groups = [];
  for (const d of WEEK) { const m = Number(w[d]) || 0, g = groups.at(-1); if (g && g.m === m) g.days.push(d); else groups.push({ m, days: [d] }); }
  const name = ds => (ds.length > 2 ? `de ${WEEK_NAMES[WEEK.indexOf(ds[0])]} a ${WEEK_NAMES[WEEK.indexOf(ds.at(-1))]}` : ds.map(d => WEEK_NAMES[WEEK.indexOf(d)]).join(' y '));
  const txt = groups.map((g, i) => `${i ? name(g.days) : name(g.days).replace(/^./, c => c.toUpperCase())} ${g.m ? `${g.m}${i ? '' : ' min'}` : 'libre'}`);
  return `${txt.slice(0, -1).join(', ')}${txt.length > 1 ? ' y ' : ''}${txt.at(-1)}.`;
};

// key: la carpeta o lista con la que se empieza (desde Biblioteca); id: un examen que ya existe (cambiarlo)
export function newExamSheet({ key = '', id = '' } = {}) {
  const ex = id ? liveExams(plan2()).find(e => e.id === id) : null, t = dayKey(), items = scopeItems();
  const keys = ex ? [...(ex.scope.folders || []).map(f => 'f:' + f), ...(ex.scope.decks || [])] : [key || items[0]?.key].filter(Boolean);
  const date = ex?.date && ex.date >= t ? ex.date : addDays(t, 60);
  S.p2New = { id: ex?.id || '', keys, date, time: 'week', min: 30, lastWeek: ex ? !!ex.lastWeek : daysBetween(t, date) > 21, pause: ex ? ex.after === 'pause' : true, lwTouched: !!ex };
  drawNewExam();
}
function draftChange() {
  const x = S.p2New, week = plan2().time?.week;
  return p => {
    const e = { ...(p.exams.find(y => y.id === x.id) || {}), id: x.id || '__nuevo', name: x.keys.map(keyName).join(' y ') || 'Examen', scope: scopeOf(x.keys), date: x.date, approx: false, lastWeek: x.lastWeek, after: x.pause ? 'pause' : null, retention: 0.9, retentionLast: 0.95 };
    const i = p.exams.findIndex(y => y.id === e.id);
    if (i >= 0) p.exams[i] = e; else p.exams.push(e);
    if (x.time !== 'week' || !week) p.time = { ...(p.time || {}), week: Object.fromEntries(WEEK.map(d => [d, x.time === 'week' ? S.prefs.study.tandaMin : x.min])) };
  };
}
function drawNewExam() {
  const x = S.p2New, items = scopeItems(), week = plan2().time?.week, t = dayKey();
  const total = week ? WEEK.reduce((a, d) => a + (Number(week[d]) || 0), 0) : 0;
  const picks = x.keys.map((k, i) => `<div class="p2-pick">${selectHTML(items, k, i)}${x.keys.length > 1 ? `<button type="button" class="icon-btn" data-p2="new-unpick" data-i="${i}" aria-label="Quitar ${esc(keyName(k))}">${icon('x', { size: 18 })}</button>` : ''}</div>`).join('');
  const times = [[week ? 'week' : 'tanda', week ? `Mi semana · ${fmtMin(total)}` : `Cada día · ${S.prefs.study.tandaMin} min`], ['30', '30 min/día'], ['60', '1 h/día'], ['other', 'Otro']];
  const cur = x.time === 'week' ? (week ? 'week' : 'tanda') : x.other ? 'other' : String(x.min);
  const after = whatIf(stateNow(), draftChange()), e = after.exams.find(y => y.id === (x.id || '__nuevo')), before = forecastNow();
  openSheet(`<div class="p2-new"><h2 class="sheet-hand">${x.id ? 'Cambiar el examen' : 'Nuevo examen'}</h2>
    <section><h3 class="p2-step-h"><span class="p2-num">1</span>¿Qué entra?</h3>${picks || '<p class="muted">Aún no tienes listas.</p>'}
      <p class="muted small">${x.keys.length ? scopeSummary(x.keys) + ' · ' : ''}Una carpeta, una lista o varias. <button type="button" class="link" data-p2="new-pick-more">Añadir otra</button></p></section>
    <section><h3 class="p2-step-h"><span class="p2-num">2</span>¿Cuándo es?</h3>
      <label class="p2-date">${icon('calendar', { size: 20 })}<input type="date" id="p2nDate" data-p2="new-date" min="${addDays(t, 1)}" value="${x.date}" aria-describedby="p2nDays"></label>
      <p class="muted small" id="p2nDays">${isDay(x.date) ? `${WEEK_NAMES[weekdayOf(x.date)].replace(/^./, c => c.toUpperCase())} ${longDay(x.date)} · faltan ${daysBetween(t, x.date)} días` : ''}</p></section>
    <section><h3 class="p2-step-h"><span class="p2-num">3</span>¿Cuánto tiempo tienes?</h3>
      <div class="p2-chips" role="radiogroup" aria-label="Cuánto tiempo tienes">${times.map(([v, l]) => `<button type="button" class="p2-chip" role="radio" aria-checked="${cur === v}" data-p2="new-time" data-v="${v}">${l}</button>`).join('')}</div>
      ${cur === 'other' ? `<label class="p2-other">Cada día <input type="number" id="p2nMin" data-p2="new-min" min="5" max="600" step="5" value="${x.min}"> min</label>` : ''}
      <p class="muted small">${cur === 'week' ? `${weekText(week)} Lo cambias en «Tu tiempo».` : cur === 'tanda' ? 'Los minutos de tu tanda de Ajustes, todos los días. Lo cambias en «Tu tiempo».' : `${x.min} min todos los días. Lo cambias en «Tu tiempo».`}</p></section>
    ${e ? resultHTML(e, after, before) : ''}
    ${toggle('new-lw', 'La última semana, solo repasar', 'Recomendado: llegas con todo fresco.', x.lastWeek)}
    ${toggle('new-pause', 'Después del examen, en pausa', 'Si apruebas, ya no te salen sus preguntas.', x.pause)}
    <button class="primary big" data-p2="new-save" ${x.keys.length && isDay(x.date) ? '' : 'disabled'}>Guardar el examen</button></div>`);
}
const toggle = (k, label, sub, on) => `<div class="set-row"><div class="set-l"><b id="p2t-${k}">${label}</b><small>${sub}</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="p2t-${k}" data-p2="${k}" ${on ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>`;
function selectHTML(items, k, i) {
  return `<label class="p2-sel">${icon(k.startsWith('f:') ? 'folder' : 'layers', { size: 20 })}<select data-p2="new-pick" data-i="${i}" aria-label="Qué entra en el examen">${items.map(it => `<option value="${esc(it.key)}" ${it.key === k ? 'selected' : ''}>${'  '.repeat(it.depth)}${esc(it.name)}</option>`).join('')}</select></label>`;
}
// «Llegas»: cuándo acabas y cómo se reparte con los otros exámenes
function resultHTML(e, after) {
  const others = after.exams.filter(o => o.id !== e.id && o.date && o.date >= dayKey());
  const nearest = after.exams.filter(o => o.date && o.date >= dayKey()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const drip = others.length && nearest?.id === e.id ? (() => {
    const d = after.days.find(y => y.minutes > 0 && y.new), o = others[0], ids = new Set(o.topics.map(t => t.id));
    const n = d ? Object.entries(d.newBy).filter(([id]) => ids.has(id)).reduce((a, [, k]) => a + k, 0) : 0;
    return ` Al ser el examen más cercano, se lleva el 80 % de tus nuevas${n ? `; ${esc(shortName(o.name))} sigue con un goteo de ${n} al día` : ''}.`;
  })() : '';
  const title = e.verdict === 'no' ? 'Así no llegas' : e.verdict === 'justo' ? 'Llegas justo' : 'Llegas';
  const text = e.verdict === 'no' ? `Al ${shortDay(e.date)} te quedarían ${e.left} de ${e.start} preguntas sin ver. Prueba con más tiempo o otra fecha; también puedes guardarlo y ver los arreglos en el Plan.`
    : !e.start ? 'Ya has visto todo: hasta el examen, a repasar.'
    : `Acabas el temario el <b>${shortDay(e.finish)}</b>${e.review >= 1 ? `, con ${e.review >= 14 ? plural(Math.round(e.review / 7), 'semana', 'semanas') : plural(e.review, 'día', 'días')} para repasar` : ''}.${drip}`;
  return `<div class="p2-result ${e.verdict}" role="status" aria-live="polite"><h3 class="hand">${title}</h3><p>${text}</p>${examBarHTML(e)}</div>`;
}

export function newExamInput(el) {
  const x = S.p2New, ds = el.dataset;
  if (!x) return;
  if (ds.p2 === 'new-pick') x.keys[Number(ds.i)] = el.value;
  else if (ds.p2 === 'new-date') { if (!isDay(el.value)) return; x.date = el.value; if (!x.lwTouched) x.lastWeek = daysBetween(dayKey(), x.date) > 21; }
  else if (ds.p2 === 'new-min') { const m = Number(el.value); if (!(m >= 5)) return; x.min = Math.min(600, m); x.time = 'min'; x.other = true; }
  else if (ds.p2 === 'new-lw') { x.lastWeek = el.checked; x.lwTouched = true; }
  else if (ds.p2 === 'new-pause') x.pause = el.checked;
  drawNewExam();
}
export function newExamClick(b) {
  const x = S.p2New, ds = b.dataset;
  if (ds.p2 === 'new-time') {
    x.other = ds.v === 'other';
    if (ds.v === 'week' || ds.v === 'tanda') x.time = 'week';
    else { x.time = 'min'; if (!x.other) x.min = Number(ds.v); }
    return drawNewExam();
  }
  if (ds.p2 === 'new-pick-more') { const free = scopeItems().find(it => !x.keys.includes(it.key)); if (free) x.keys.push(free.key); return drawNewExam(); }
  if (ds.p2 === 'new-unpick') { x.keys.splice(Number(ds.i), 1); return drawNewExam(); }
  if (ds.p2 === 'new-save') return saveNewExam();
}
function saveNewExam() {
  const x = S.p2New, week = plan2().time?.week;
  if (!x.keys.length || !isDay(x.date)) return toast('Elige qué entra y la fecha');
  const exams = liveExams(plan2());
  let id = x.id || examIdFor(x.keys[0]);
  if (!x.id) for (let n = 2; exams.some(e => e.id === id) || (plan2().exams || []).some(e => e.id === id && !e.deleted); n++) id = `${examIdFor(x.keys[0])}-${n}`;
  closeSheet();
  commitPlan(x.id ? 'Examen cambiado' : 'Examen guardado', p => {
    const name = x.keys.map(keyName).join(' y ');
    const old = p.exams.find(e => e.id === id) || {};
    const e = { order: [], mode: 'seq', shares: {}, fixed: {}, known: [], exclude: [], boost: {}, retention: 0.9, retentionLast: 0.95, approx: false, ...old, id, name: old.deleted || !old.name ? name : old.name, scope: scopeOf(x.keys), date: x.date, lastWeek: x.lastWeek, after: x.pause ? 'pause' : old.after === 'pause' ? null : old.after ?? null };
    delete e.deleted;
    if (x.keys.length && (!old.name || old.deleted || old.name === keyName(x.keys[0]))) e.name = name;
    const i = p.exams.findIndex(y => y.id === id);
    if (i >= 0) p.exams[i] = e; else p.exams.push(e);
    if (x.time !== 'week' || !week) p.time = { ...(p.time || {}), week: Object.fromEntries(WEEK.map(d => [d, x.time === 'week' ? S.prefs.study.tandaMin : x.min])) };
  }, { redraw: false });
  go('exam', { examId: id });
}
