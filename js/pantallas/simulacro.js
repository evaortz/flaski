// Flaski · Simulacro de examen: un examen de prueba con preguntas al azar de lo ya empezado, con tiempo, sin
// corregir hasta entregar y con nota. No cambia los repasos: cada fallo solo se adelanta a mañana (como un
// «Otra vez» en su próxima tanda, sin tocar su intervalo). Bloque en la ficha del examen, «Preparar», la pregunta,
// «¿Entregas ya?», la nota y «Las respuestas». Lo terminado va en prefs.sims (se junta por id entre dispositivos);
// el que está a medias, en este navegador, con el reloj parado mientras la app está cerrada.
import * as api from '../api.js';
import { icon } from '../icons.js';
import { DAY, startOfDay } from '../srs.js';
import { checkTyped, checkNumber, choiceOptions } from '../cardtypes.js';
import { trimSims } from '../prefs.js';
import { decksUnder, childrenOf, folderKey, dayKey } from '../plan.js';
import { $, main, S, esc, fmt, plain, toast, cardList } from '../comun.js';
import { plural } from './mazos.js';
import { cardModel, faceHTML, clozeChoices, startSession } from './estudio.js';
import { openSheet, closeSheet } from './editor.js';
import { savePrefsSoon } from './perfil.js';
import { mapModel } from './mapa.js';
import { keyDecks, keyName, shortDate, renderExam } from './plan.js';
import { go } from '../app.js';

/* ===================== datos ===================== */
const STORE = () => `flaski-simulacro:${S.uid}`;
const TEST = ['choice', 'clozechoice', 'type', 'number'];
const FLIP = ['flip', 'cloze'];
const N_OPTS = [20, 40, 60, 100], TIME_OPTS = [0, 30, 40, 60], PEN_OPTS = [[0, 'No'], [3, '⅓'], [4, '¼']];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const dec = n => String(Math.round(n * 100) / 100).replace('.', ',');
const kindOf = mode => (['choice', 'clozechoice'].includes(mode) ? 'choice' : mode === 'type' ? 'typed' : mode === 'number' ? 'number' : 'flip');
export const simsOf = exam => (S.prefs.sims || []).filter(s => s && !s.deleted && s.exam === exam).sort((a, b) => a.done - b.done);
const goalOf = exam => Number(S.prefs.plan.simGoal?.[exam]) || 7;
// Lo que entra: preguntas ya empezadas de un ámbito (el examen o una de sus partes) y de los tipos que se pueden corregir
function eligible(scopeKey, testOnly) {
  const ids = new Set(keyDecks(scopeKey).map(d => d.id));
  return cardList().filter(c => ids.has(c.deck_id) && S.progress.get(c.id)).filter(c => {
    const m = cardModel(c).tpl.mode;
    return TEST.includes(m) || (!testOnly && FLIP.includes(m));
  });
}
// Las partes de un examen que se pueden elegir: sus subcarpetas y sus listas
function scopesOf(exam) {
  if (!exam.startsWith('f:')) return [];
  const fid = exam.slice(2), k = childrenOf(fid, S.decks, S.folders);
  return [...k.folders.map(f => folderKey(f.id)), ...decksUnder(fid, S.decks, S.folders).map(d => d.id)];
}
// El tema de una pregunta (la sección del mapa o el nombre de la lista) y su referencia («Tema 1 · Art. 27»)
function topicsFor(exam, ids) {
  const scope = exam.startsWith('f:') ? 'folder:' + exam.slice(2) : exam, m = mapModel(scope), out = new Map();
  if (m) for (const s of m.sections) for (const cell of s.cells) for (const id of cell.ids) {
    const name = s.name && !s.loose ? s.name : null;
    out.set(id, { topic: name, ref: cell.n != null ? `Art. ${cell.n}` : '' });
  }
  return new Map(ids.map(id => { const c = S.cards.get(id), x = out.get(id) || {}; return [id, { topic: x.topic || S.decks.get(c?.deck_id)?.name || 'Sin tema', ref: x.ref || '' }]; }));
}

/* ===================== simulacro en marcha ===================== */
const save = () => { try { if (S.sim) localStorage.setItem(STORE(), JSON.stringify(S.sim)); else localStorage.removeItem(STORE()); } catch {} };
export const pendingSim = () => { try { return JSON.parse(localStorage.getItem(STORE()) || 'null'); } catch { return null; } };
const elapsed = sim => sim.elapsed + (sim.since ? Date.now() - sim.since : 0);
const leftMs = sim => (sim.limit ? Math.max(0, sim.limit - elapsed(sim)) : null);
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
// El reloj se para con la app cerrada o en segundo plano y sigue desde lo que quedaba
function pause() { if (S.sim?.since) { S.sim.elapsed = elapsed(S.sim); S.sim.since = null; save(); } }
function resume() { if (S.sim && !S.sim.since && S.view === 'sim' && S.sim.phase !== 'done') { S.sim.since = Date.now(); save(); } }
document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? pause() : resume()));
addEventListener('pagehide', pause);
let ticker = null;
function tick() {
  if (S.view !== 'sim' || !S.sim || !['q', 'review'].includes(S.sim.phase)) { clearInterval(ticker); ticker = null; return; }
  const left = leftMs(S.sim);
  for (const el of document.querySelectorAll('[data-clock]')) {
    el.textContent = clock(left ?? elapsed(S.sim));
    el.closest('.sm-clock')?.classList.toggle('warn', left != null && left <= 5 * 60e3);
  }
  const pace = document.getElementById('smPace');
  if (pace) pace.innerHTML = paceHTML();
  if (left === 0) { toast('Se acabó el tiempo'); submit(); }
}

/* ---------------- preparar ---------------- */
export function prepSheet(exam) {
  const last = S.prefs.plan.sim?.[exam] || {};
  S.simPrep = { exam, scope: scopesOf(exam).includes(last.scope) ? last.scope : '', n: last.n || 40, time: last.time ?? 40, pen: last.pen ?? 3, testOnly: last.testOnly ?? true };
  drawPrep();
}
function drawPrep() {
  const p = S.simPrep, avail = eligible(p.scope || p.exam, p.testOnly).length;
  // 20 · 40 · 60 · 100 (las que no caben, apagadas); con menos de 20, también «todas»
  const opts = avail && avail < N_OPTS[0] ? [avail, ...N_OPTS] : N_OPTS, ns = opts.filter(n => n <= avail);
  if (!ns.includes(p.n)) p.n = ns.filter(n => n <= p.n).at(-1) || ns[0] || 0;
  const seg = (k, opts) => `<div class="sm-seg" role="group">${opts.map(([v, l, off]) => `<button type="button" class="sm-opt" data-sim="prep-set" data-k="${k}" data-v="${v}" aria-pressed="${String(p[k]) === String(v)}" ${off ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
  const scopes = scopesOf(p.exam);
  openSheet(`<div class="sm-prep"><h2 class="sheet-hand">Preparar simulacro</h2><p class="muted small">Elige como en tu examen. Se guarda para la próxima vez.</p>
    ${scopes.length ? `<label class="st-lab" for="smScope">De qué temas</label><select id="smScope"><option value="">Todo · ${esc(keyName(p.exam))}</option>${scopes.map(k => `<option value="${esc(k)}" ${p.scope === k ? 'selected' : ''}>${esc(keyName(k))}</option>`).join('')}</select>` : `<p class="st-lab">De qué temas</p><p>${esc(keyName(p.exam))}</p>`}
    <p class="muted small">Solo entra lo que ya has empezado a estudiar: ${plural(avail, p.testOnly ? 'pregunta de test' : 'pregunta', p.testOnly ? 'preguntas de test' : 'preguntas')}.</p>
    <p class="st-lab">Cuántas preguntas</p>${seg('n', opts.map(n => [n, n, n > avail]))}
    <p class="st-lab">Tiempo</p>${seg('time', TIME_OPTS.map(t => [t, t ? `${t} min` : 'Sin límite']))}
    <p class="st-lab">Los fallos restan</p>${seg('pen', PEN_OPTS)}
    <p class="muted small">${p.pen ? `Cada ${p.pen} fallos te quitan un acierto. «En blanco» no resta.` : 'Los fallos no restan.'}</p>
    <div class="set-row"><div class="set-l"><b id="smTestL">Solo preguntas de test</b><small>Las de dar la vuelta las corriges tú al final.</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="smTestL" id="smTest" ${p.testOnly ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>
    <button class="primary big" data-sim="start" ${p.n ? '' : 'disabled'}>${p.n ? `Empezar · ${plural(p.n, 'pregunta', 'preguntas')}${p.time ? `, ${p.time} min` : ''}` : 'Aún no hay preguntas empezadas'}</button>
    <button class="link sm-later" data-act="close-sheet">Ahora no</button></div>`);
  $('#smScope')?.addEventListener('change', e => { p.scope = e.target.value; drawPrep(); });
  $('#smTest').addEventListener('change', e => { p.testOnly = e.target.checked; drawPrep(); });
}
function start() {
  const p = S.simPrep, pool = eligible(p.scope || p.exam, p.testOnly);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const qs = pool.slice(0, p.n).map(c => {
    const m = cardModel(c), kind = kindOf(m.tpl.mode), q = { id: c.id, kind, ans: null, flag: false };
    if (m.tpl.mode === 'clozechoice') { const ch = clozeChoices(c, m); q.opts = ch.opts; q.correct = ch.correct; }
    else if (m.tpl.mode === 'choice') {
      const others = cardList().filter(x => x.deck_id === c.deck_id && x.id !== c.id && x.type_id === c.type_id).map(x => { const mm = cardModel(x); return mm.fields[mm.tpl.answer] ?? x.back; });
      if (others.length < 3) others.push(...cardList().filter(x => x.deck_id === c.deck_id && x.id !== c.id).map(x => x.back));
      const ch = choiceOptions(m.tpl, m.fields, others); q.opts = ch.opts; q.correct = ch.correct;
    }
    return q;
  });
  S.prefs.plan.sim = { ...(S.prefs.plan.sim || {}), [p.exam]: { scope: p.scope, n: p.n, time: p.time, pen: p.pen, testOnly: p.testOnly } };
  savePrefsSoon();
  S.sim = { id: api.newId(), exam: p.exam, scope: p.scope, name: p.scope ? keyName(p.scope) : keyName(p.exam), settings: { n: qs.length, time: p.time, pen: p.pen, testOnly: p.testOnly }, qs, cur: 0, seen: [0], phase: 'q', elapsed: 0, since: Date.now(), limit: p.time * 60e3 };
  save(); closeSheet(); go('sim');
}

/* ---------------- pantallas ---------------- */
export function renderSim() {
  const sim = S.sim;
  // La pregunta, «¿Entregas ya?» y la nota van en el azul de la tanda; «Las respuestas», como las demás pantallas
  document.body.classList.toggle('in-study', S.simShow?.mode !== 'answers');
  $('#nav').hidden = S.simShow ? S.simShow.mode !== 'answers' : !!sim;
  document.body.classList.toggle('no-nav', $('#nav').hidden);
  if (S.simShow) { const html = S.simShow.mode === 'answers' ? answersHTML() : resultHTML(); if (html) main.innerHTML = html; return; }
  if (!sim) { S.view = 'plan'; return go('plan'); }
  resume();
  if (sim.phase === 'review') main.innerHTML = reviewHTML();
  else if (sim.phase === 'self') main.innerHTML = selfHTML();
  else main.innerHTML = questionHTML();
  const ti = $('#simTyped');
  if (ti) ti.addEventListener('input', () => { sim.qs[sim.cur].ans = ti.value; save(); paintMarks(); });
  if (!ticker && ['q', 'review'].includes(sim.phase)) ticker = setInterval(tick, 1000);
  tick();
}
const headHTML = (sub, back = 'exit') => {
  const sim = S.sim, left = leftMs(sim);
  return `<div class="sm-head"><button class="sm-x" data-sim="${back}" aria-label="${back === 'exit' ? 'Salir del simulacro' : 'Volver a la pregunta'}">${icon(back === 'exit' ? 'x' : 'chevron-left', { size: 22 })}</button>
    <div class="sm-ht"><b>Simulacro · ${esc(sim.name)}</b><small>${sub}</small></div>
    <button class="sm-clock${left != null && left <= 5 * 60e3 ? ' warn' : ''}" data-sim="review" aria-label="Tiempo · ¿Entregas ya?">${icon('timer', { size: 16 })}<span data-clock>${clock(left ?? elapsed(sim))}</span></button></div>`;
};
const qState = (q, i) => (i === S.sim.cur && S.sim.phase === 'q' ? 'cur' : q.flag ? 'flag' : answered(q) ? 'done' : S.sim.seen.includes(i) ? 'blank' : 'unseen');
const answered = q => q.ans != null && String(q.ans).trim() !== '';
function gridHTML(cols = '') {
  return `<div class="sm-grid ${cols}">${S.sim.qs.map((q, i) => `<button type="button" class="sm-n st-${qState(q, i)}" data-sim="goto" data-i="${i}" aria-label="Pregunta ${i + 1}">${i + 1}</button>`).join('')}</div>`;
}
function paceHTML() {
  const sim = S.sim, n = sim.qs.filter(answered).length, min = Math.round(elapsed(sim) / 60e3), per = sim.limit ? sim.limit / sim.qs.length : 0;
  const ok = !per || n * per >= elapsed(sim) - per;
  return `<div class="sm-tbar"><span style="width:${sim.limit ? Math.min(100, (100 * elapsed(sim)) / sim.limit) : 0}%"></span></div><p>${ok ? 'Vas a buen ritmo' : 'Vas un poco lento'}: ${plural(n, 'respondida', 'respondidas')} en ${min} min</p>`;
}
function questionHTML() {
  const sim = S.sim, q = sim.qs[sim.cur], c = S.cards.get(q.id);
  if (!sim.seen.includes(sim.cur)) sim.seen.push(sim.cur);
  const model = c ? cardModel(c) : null;
  const face = model ? faceHTML(model, { id: c.id, revealed: false, hint: false, typed: null, choice: null }) : { front: '<p>Esta pregunta ya no existe.</p>' };
  const last = sim.cur === sim.qs.length - 1;
  let ask = '';
  if (q.kind === 'choice') ask = `<div class="choices sm-choices">${q.opts.map((o, i) => `<button type="button" class="choice${q.ans === i ? ' picked' : ''}" data-sim="pick" data-i="${i}"><span class="ckey">${LETTERS[i]}</span><span>${fmt(o)}</span></button>`).join('')}</div>`;
  else if (q.kind === 'typed') ask = `<div class="typed sm-typed"><input id="simTyped" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escribe la respuesta" aria-label="Tu respuesta" value="${esc(q.ans || '')}"></div>`;
  else if (q.kind === 'number') ask = `<div class="typed sm-typed"><input id="simTyped" inputmode="decimal" autocomplete="off" placeholder="Tu respuesta" aria-label="Tu respuesta" value="${esc(q.ans || '')}">${model?.fields.u ? `<span>${esc(model.fields.u)}</span>` : ''}</div>`;
  else ask = `<p class="sm-flipnote">Piensa la respuesta. Al entregar verás la buena y dirás si la sabías.</p><button type="button" class="sm-mark${q.ans === 'seen' ? ' on' : ''}" data-sim="think">${q.ans === 'seen' ? 'Pensada ✓' : 'Ya la he pensado'}</button>`;
  const topic = c ? S.decks.get(c.deck_id)?.name || '' : '';
  return `<div class="sm-page"><div class="sm-main">${headHTML(`pregunta ${sim.cur + 1} de ${sim.qs.length}`)}
    <div class="sm-bar" style="--n:${sim.qs.length}">${sim.qs.map((x, i) => `<i class="st-${qState(x, i)}"></i>`).join('')}</div>
    <p class="sm-topic">${esc(topic)}</p>
    <div class="sm-q">${face.front}</div>${ask}
    <div class="sm-two"><button type="button" class="sm-blank" data-sim="blank">Dejar en blanco</button><button type="button" class="sm-flag${q.flag ? ' on' : ''}" data-sim="flag" aria-pressed="${q.flag}">${icon('flag', { size: 16 })} Revisar luego</button></div>
    <div class="sm-nav"><button class="sm-prev" data-sim="prev" ${sim.cur ? '' : 'disabled'} aria-label="Anterior">${icon('chevron-left', { size: 22 })}</button>
      <button class="sm-next" data-sim="${last ? 'review' : 'next'}"><span>${last ? 'Revisar y entregar' : 'Siguiente'}</span>${icon('chevron-right', { size: 20 })}</button></div>
    <p class="sm-foot">Toca el reloj para ver todas · no sabrás si aciertas hasta entregar</p></div>
    <aside class="sm-side"><div class="sm-big ${leftMs(sim) != null && leftMs(sim) <= 5 * 60e3 ? 'warn' : ''}"><span data-clock>${clock(leftMs(sim) ?? elapsed(sim))}</span></div><div id="smPace">${paceHTML()}</div>${gridHTML()}
      <button class="sm-submit" data-sim="review">Entregar</button><p class="sm-keys">1-4 eligen · B en blanco · R revisar · ← → cambiar · Esc entregar</p></aside></div>`;
}
function paintMarks() {
  const sim = S.sim;
  document.querySelectorAll('.sm-bar i').forEach((el, i) => { el.className = `st-${qState(sim.qs[i], i)}`; });
  document.querySelectorAll('.sm-grid .sm-n').forEach((el, i) => { el.className = `sm-n st-${qState(sim.qs[i], i)}`; });
}
function reviewHTML() {
  const sim = S.sim, done = sim.qs.filter(answered).length, flag = sim.qs.filter(q => q.flag).length, blank = sim.qs.length - done, left = leftMs(sim);
  return `<div class="sm-page sm-rev">${headHTML('antes de entregar', 'back')}
    <h1 class="sm-h">¿Entregas ya?</h1>
    <div class="sm-kpis"><div><b>${done}</b><small>respondidas</small></div><div class="flag"><b>${flag}</b><small>para revisar</small></div><div><b>${blank}</b><small>en blanco</small></div></div>
    ${gridHTML('sm-grid-8')}
    <div class="sm-legend"><span><i class="st-done"></i>respondida</span><span><i class="st-flag"></i>para revisar</span><span><i class="st-blank"></i>en blanco</span><span><i class="st-unseen"></i>sin ver</span></div>
    <p class="sm-note">${icon('alert-triangle', { size: 16 })} Toca un número para volver a esa pregunta.${left != null ? ` Te quedan ${Math.max(1, Math.ceil(left / 60e3))} minutos.` : ''}</p>
    <button class="sm-go" data-sim="submit">Entregar y ver la nota</button>
    ${flag ? `<button class="sm-go2" data-sim="goto-flag">Seguir · ir a ${flag === 1 ? 'la 1' : `las ${flag}`} para revisar</button>` : ''}</div>`;
}
// Las de dar la vuelta: tras entregar, «¿La sabías?» de cada una
function selfHTML() {
  const sim = S.sim, flips = sim.qs.map((q, i) => [q, i]).filter(([q]) => q.kind === 'flip');
  return `<div class="sm-page sm-rev"><div class="sm-head"><span></span><div class="sm-ht"><b>Simulacro · ${esc(sim.name)}</b><small>las de dar la vuelta</small></div><span></span></div>
    <h1 class="sm-h">¿La sabías?</h1><p class="sm-sub">Estas las corriges tú. Sin marcar, cuentan en blanco.</p>
    <ul class="sm-self">${flips.map(([q, i]) => { const c = S.cards.get(q.id); return `<li><span class="sm-num">${i + 1}</span><div><p>${esc(plain(c?.front || ''))}</p><p class="sm-right">${esc(plain(c?.back || ''))}</p>
      <div class="sm-yn"><button data-sim="self" data-i="${i}" data-v="yes" aria-pressed="${q.self === 'yes'}">Sí</button><button data-sim="self" data-i="${i}" data-v="no" aria-pressed="${q.self === 'no'}">No</button></div></div></li>`; }).join('')}</ul>
    <button class="sm-go" data-sim="finish">Ver la nota</button></div>`;
}

/* ---------------- corregir y guardar ---------------- */
function verdict(q) {
  const c = S.cards.get(q.id);
  if (!c) return 'b';
  const m = cardModel(c);
  if (q.kind === 'flip') return q.self === 'yes' ? 'o' : q.self === 'no' ? 'x' : 'b';
  if (!answered(q)) return 'b';
  if (q.kind === 'choice') return q.opts[q.ans] === q.correct ? 'o' : 'x';
  if (q.kind === 'typed') { const lang = m.type.fields.find(f => f.id === m.tpl.answer)?.lang || ''; const r = checkTyped(q.ans, String(m.fields[m.tpl.answer] ?? c.back), lang); return r.ok || r.near ? 'o' : 'x'; }
  if (q.kind === 'number') return checkNumber(q.ans, m.fields[m.tpl.answer], m.fields.t).ok ? 'o' : 'x';
  return 'b';
}
const answerText = q => (q.kind === 'choice' ? (q.ans != null ? q.opts[q.ans] : '') : q.kind === 'flip' ? (q.self === 'yes' ? 'La sabía' : q.self === 'no' ? 'No la sabía' : '') : String(q.ans || ''));
function submit() {
  const sim = S.sim;
  if (!sim) return;
  pause();
  if (sim.qs.some(q => q.kind === 'flip') && sim.phase !== 'self') { sim.phase = 'self'; save(); return renderSim(); }
  finish();
}
function finish() {
  const sim = S.sim, res = sim.qs.map(verdict), n = sim.qs.length;
  const ok = res.filter(r => r === 'o').length, bad = res.filter(r => r === 'x').length, blank = n - ok - bad, pen = sim.settings.pen;
  const score = Math.max(0, Math.round(((ok - (pen ? bad / pen : 0)) / Math.max(1, n)) * 1000) / 100);
  const topics = topicsFor(sim.exam, sim.qs.map(q => q.id)), byTopic = new Map();
  sim.qs.forEach((q, i) => { const t = topics.get(q.id).topic; if (!byTopic.has(t)) byTopic.set(t, { name: t, o: 0, x: 0, b: 0 }); byTopic.get(t)[res[i]]++; });
  const now = Date.now();
  const rec = { id: sim.id, exam: sim.exam, at: now, done: now, date: dayKey(now), name: sim.name, settings: sim.settings, n, min: Math.max(1, Math.round(elapsed(sim) / 60e3)), score, ok, bad, blank,
    topics: [...byTopic.values()], qs: sim.qs.map((q, i) => [q.id, answerText(q).slice(0, 80), q.flag ? 1 : 0, res[i], q.kind === 'choice' ? q.correct : null]) };
  S.prefs.sims = trimSims([...(S.prefs.sims || []), rec]);
  savePrefsSoon();
  // Cada fallo sale en la tanda de mañana (si tocaba más tarde), sin cambiar su intervalo
  const tomorrow = startOfDay() + DAY;
  sim.qs.forEach((q, i) => {
    const p = S.progress.get(q.id);
    if (res[i] !== 'x' || !p || p.due <= tomorrow) return;
    const next = { ...p, due: tomorrow };
    S.progress.set(q.id, next);
    api.saveProgress(S.uid, q.id, next).catch(() => {});
  });
  S.sim = null; save();
  S.simShow = { id: rec.id, mode: 'result' };
  renderSim(); scrollTo(0, 0);
}

/* ---------------- la nota y las respuestas ---------------- */
const recOf = id => (S.prefs.sims || []).find(s => s.id === id);
const penText = p => (p === 3 ? '⅓' : p === 4 ? '¼' : '');
function resultHTML() {
  const r = recOf(S.simShow.id);
  if (!r) { S.simShow = null; go('plan'); return ''; }
  const all = simsOf(r.exam), i = all.findIndex(x => x.id === r.id), prev = all[i - 1], best = all.slice(0, i).every(x => x.score < r.score);
  const ctx = !prev ? '' : r.score === prev.score ? 'Igual que el anterior' : `${best && r.score > prev.score ? 'Tu mejor simulacro hasta ahora · ' : ''}${r.score > prev.score ? '+' : '−'}${dec(Math.abs(r.score - prev.score))} que el anterior`;
  const pen = r.settings.pen, net = Math.round((r.ok - (pen ? r.bad / pen : 0)) * 100) / 100;
  const fails = (r.qs || []).filter(q => q[3] === 'x').map(q => q[0]).filter(id => S.cards.has(id));
  return `<div class="sm-page sm-res"><div class="sm-head"><button class="sm-x" data-sim="close" aria-label="Cerrar">${icon('x', { size: 22 })}</button><div class="sm-ht"><b>Simulacro · ${esc(r.name)}</b><small>${plural(r.n, 'pregunta', 'preguntas')} · ${r.min} min${pen ? ' · con penalización' : ''}</small></div><span></span></div>
    <div class="sm-score"><b>${dec(r.score)}</b><span>sobre 10</span></div>
    ${ctx ? `<p class="sm-ctx">${ctx}</p>` : ''}
    <div class="sm-kpis"><div><b>${r.ok}</b><small>${r.ok === 1 ? 'acierto' : 'aciertos'}</small></div><div class="bad"><b>${r.bad}</b><small>${r.bad === 1 ? 'fallo' : 'fallos'}</small></div><div><b>${r.blank}</b><small>en blanco</small></div></div>
    ${pen ? `<p class="sm-pen">Los fallos restan ${penText(pen)}: ${r.ok} − ${r.bad} ÷ ${pen} = ${dec(net)} netas de ${r.n}.${r.blank ? ` Dejar en blanco ${r.blank} te ha salvado algo.` : ''}</p>` : ''}
    <h2 class="sm-h2">Por tema</h2>
    <ul class="sm-topics">${r.topics.map(t => { const n = t.o + t.x + t.b; return `<li><div><span>${esc(t.name)}</span><span>${t.o} de ${n}</span></div><div class="sm-tb"><i class="o" style="width:${(100 * t.o) / n}%"></i><i class="x" style="width:${(100 * t.x) / n}%"></i><i class="b" style="width:${(100 * t.b) / n}%"></i></div></li>`; }).join('')}</ul>
    <div class="sm-legend"><span><i class="o"></i>acierto</span><span><i class="x"></i>fallo</span><span><i class="b"></i>en blanco</span></div>
    <h2 class="sm-h2">Tus simulacros</h2>${chartSVG(r.exam, true)}
    ${r.bad ? `<p class="sm-note">${icon('refresh-cw', { size: 16 })} ${r.bad === 1 ? 'El fallo ya está' : `Los ${r.bad} fallos ya están`} en tu tanda de mañana.</p>` : ''}
    ${fails.length ? `<button class="sm-go" data-sim="fails" data-id="${esc(r.id)}">Repasar ${fails.length === 1 ? 'el fallo' : `los ${fails.length} fallos`} ahora</button>` : ''}
    ${r.qs ? `<button class="sm-go2" data-sim="answers" data-id="${esc(r.id)}">${r.n === 1 ? 'Ver la respuesta' : `Ver las ${r.n} respuestas`}</button>` : ''}</div>`;
}
function answersHTML() {
  const r = recOf(S.simShow.id);
  if (!r) { S.simShow = null; go('plan'); return ''; }
  const f = S.simShow.filter || 'all', rows = (r.qs || []).map((q, i) => [q, i]);
  const count = k => rows.filter(([q]) => q[3] === k).length;
  const show = rows.filter(([q]) => f === 'all' || q[3] === f);
  const topics = topicsFor(r.exam, rows.map(([q]) => q[0]));
  const chip = (k, l, n) => `<button type="button" class="sm-fchip f-${k}" data-sim="filter" data-f="${k}" aria-pressed="${f === k}">${k === 'all' ? '' : '<i></i>'}${l} · ${n}</button>`;
  const list = show.map(([q, i]) => {
    const c = S.cards.get(q[0]);
    if (!c) return `<li class="sm-a"><span class="sm-num">${i + 1}</span><div><p class="muted">Esta pregunta ya no existe.</p></div></li>`;
    const m = cardModel(c), right = q[4] || String(m.fields[m.tpl.answer] ?? plain(c.back)).replace(/\{\{|\}\}/g, ''), t = topics.get(q[0]);
    return `<li class="sm-a"><span class="sm-num">${i + 1}<i class="r-${q[3]}"></i></span><div><p class="sm-aq">${esc(plain(c.front).replace(/\{\{(.+?)(::.+?)?\}\}/g, '…'))}</p>
      ${q[3] === 'x' && q[1] ? `<p class="sm-yours"><s>${esc(q[1])}</s></p>` : q[3] === 'b' ? '<p class="sm-yours muted">en blanco</p>' : ''}
      <p class="sm-right">${icon('check', { size: 14 })} ${esc(plain(right))}</p>
      <p class="sm-ref"><span>${esc(t.topic)}${t.ref ? ` · ${esc(t.ref)}` : ''}</span>${c.page_id && S.pages.has(c.page_id) ? `<button class="link" data-open-page="${c.page_id}" data-open-block="${esc(c.block_id || '')}">Ver en el apunte</button>` : ''}</p></div></li>`;
  }).join('');
  const fails = rows.filter(([q]) => q[3] === 'x').map(([q]) => q[0]).filter(id => S.cards.has(id));
  return `<div class="sm-page sm-ans"><div class="crumbs-row"><button class="back-round" data-sim="result" aria-label="Volver a la nota">${icon('chevron-left', { size: 22 })}</button><div class="sm-ht"><b>Simulacro · ${shortDate(r.date)}</b><small>${dec(r.score)} · ${plural(r.ok, 'acierto', 'aciertos')}, ${plural(r.bad, 'fallo', 'fallos')}, ${r.blank} en blanco</small></div></div>
    <h1 class="sm-h">Las respuestas</h1>
    <div class="sm-fchips">${chip('all', 'Todas', rows.length)}${chip('x', 'Fallos', count('x'))}${chip('b', 'En blanco', count('b'))}${chip('o', 'Aciertos', count('o'))}</div>
    <ol class="sm-alist">${list || '<li class="muted">Nada por aquí.</li>'}</ol>
    ${fails.length ? `<button class="primary big" data-sim="fails" data-id="${esc(r.id)}">Repasar ${fails.length === 1 ? 'el fallo' : `los ${fails.length} fallos`} ahora</button>` : ''}</div>`;
}
// Gráfica de las notas de un examen, con la raya de tu objetivo (se cambia tocándola)
function chartSVG(exam, light = false) {
  const all = simsOf(exam).slice(-8), goal = goalOf(exam), W = 300, H = 120, pad = 22;
  if (!all.length) return '';
  const x = i => (all.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (all.length - 1)), y = v => H - 24 - (v / 10) * (H - 44);
  const pts = all.map((s, i) => `${x(i)},${y(s.score)}`).join(' ');
  return `<button type="button" class="sm-chart${light ? ' light' : ''}" data-sim="goal" data-exam="${esc(exam)}" aria-label="Tus notas; tu objetivo, ${dec(goal)}. Toca para cambiarlo">
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" class="goal"/><text x="${W}" y="${y(goal) + 14}" text-anchor="end" class="goal-t">tu objetivo · ${dec(goal)}</text>
      <polyline points="${pts}" class="line"/>${all.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.score)}" r="${i === all.length - 1 ? 5.5 : 4}" class="${i === all.length - 1 ? 'last' : 'pt'}"/><text x="${x(i)}" y="${y(s.score) - 10}" class="v">${dec(s.score)}</text><text x="${x(i)}" y="${H - 4}" class="d">${shortDate(s.date)}</text>`).join('')}</svg></button>`;
}
function goalSheet(exam) {
  const cur = goalOf(exam);
  openSheet(`<h2 class="sheet-hand">Tu objetivo</h2><p class="muted">La nota que quieres sacar en ${esc(keyName(exam))}. Sale como una raya en la gráfica.</p>
    <div class="pw-opts">${[5, 6, 7, 8, 9, 10].map(v => `<button type="button" class="pw-opt" data-sim="goal-set" data-exam="${esc(exam)}" data-v="${v}" aria-pressed="${v === cur}">${v}</button>`).join('')}</div>`);
}

/* ---------------- en la ficha del examen y en Hoy ---------------- */
export function simBlockHTML(exam) {
  const all = simsOf(exam), pend = pendingSim();
  const up = all.length >= 2 ? all.at(-1).score - all[0].score : 0;
  const last = all.slice().reverse().slice(0, 5);
  return `<section class="sm-block" aria-labelledby="h-sims"><div class="sm-bh"><h2 id="h-sims">Simulacros</h2><small>${all.length ? plural(all.length, 'hecho', 'hechos') : ''}</small></div>
    <p>Como el examen de verdad: preguntas al azar de todo lo que has visto, con tiempo y sin ver si aciertas hasta entregar. <b>No cambia tus repasos</b>; solo los fallos pasan a tu tanda.</p>
    ${chartSVG(exam)}
    ${all.length >= 2 ? `<p class="sm-up">${icon('chart-line', { size: 16 })} ${up > 0 ? `Vas subiendo: +${dec(up)} desde el primero` : up < 0 ? `${dec(up)} desde el primero` : 'Igual que el primero'}</p>` : ''}
    ${pend?.exam === exam ? `<button class="primary big" data-sim="continue">Seguir el simulacro a medias</button>` : `<button class="primary big" data-sim="prep" data-exam="${esc(exam)}">Hacer un simulacro</button>`}</section>
    ${last.length ? `<div class="section-h"><h2>Los últimos</h2></div><ul class="sm-last">${last.map(s => `<li><button data-sim="${s.qs ? 'answers' : 'result'}" data-id="${esc(s.id)}"><b>${dec(s.score)}</b><span><span>${esc(s.name)} · ${plural(s.n, 'pregunta', 'preguntas')}</span><small>${shortDate(s.date)} · ${s.min} min · ${plural(s.bad, 'fallo', 'fallos')}</small></span>${icon('chevron-right', { size: 18 })}</button></li>`).join('')}</ul>` : ''}`;
}
// Al abrir la app con un simulacro a medias
export function maybeResumeSim() {
  const p = pendingSim();
  if (!p || S.view === 'sim') return false;
  const left = p.limit ? Math.max(0, p.limit - p.elapsed) : null;
  openSheet(`<h2 class="sheet-hand">Tienes un simulacro a medias</h2><p>${esc(p.name)} · ${left != null ? `te quedan ${Math.max(1, Math.ceil(left / 60e3))} min` : `llevas ${Math.round(p.elapsed / 60e3)} min`}</p>
    <div class="btnrow"><button class="ghost" data-sim="discard">Descartar</button><span class="spacer"></span><button class="primary" data-sim="continue">Seguir</button></div>`);
  return true;
}

/* ===================== clics y teclado ===================== */
export function simClick(b) {
  const ds = b.dataset, sim = S.sim;
  switch (ds.sim) {
    case 'prep': return prepSheet(ds.exam);
    case 'prep-set': S.simPrep[ds.k] = Number(ds.v); return drawPrep();
    case 'start': return start();
    case 'continue': S.sim = pendingSim(); S.simShow = null; closeSheet(); if (S.sim) { S.sim.since = null; go('sim'); } return;
    case 'discard': S.sim = null; save(); closeSheet(); return toast('Simulacro descartado');
    case 'pick': sim.qs[sim.cur].ans = sim.qs[sim.cur].ans === Number(ds.i) ? null : Number(ds.i); save(); return renderSim();
    case 'think': sim.qs[sim.cur].ans = sim.qs[sim.cur].ans === 'seen' ? null : 'seen'; save(); return renderSim();
    case 'blank': sim.qs[sim.cur].ans = null; save(); return move(1);
    case 'flag': sim.qs[sim.cur].flag = !sim.qs[sim.cur].flag; save(); return renderSim();
    case 'prev': return move(-1);
    case 'next': return move(1);
    case 'goto': sim.cur = Number(ds.i); sim.phase = 'q'; save(); renderSim(); return scrollTo(0, 0);
    case 'goto-flag': sim.cur = sim.qs.findIndex(q => q.flag); sim.phase = 'q'; save(); return renderSim();
    case 'review': sim.phase = 'review'; save(); renderSim(); return scrollTo(0, 0);
    case 'back': sim.phase = 'q'; save(); return renderSim();
    case 'submit': return submit();
    case 'self': sim.qs[Number(ds.i)].self = ds.v; save(); return renderSim();
    case 'finish': return finish();
    case 'exit': return openSheet(`<h2>¿Salir del simulacro?</h2><p class="muted">Si sales, se pierde este simulacro.</p>
      <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Seguir</button><button class="danger solid primary" data-sim="quit">Salir</button></div>`);
    case 'quit': { const exam = sim?.exam; S.sim = null; save(); closeSheet(); return exam ? go('exam', { examKey: exam }) : go('plan'); }
    case 'close': { const r = recOf(S.simShow?.id); S.simShow = null; return r ? go('exam', { examKey: r.exam }) : go('plan'); }
    case 'result': S.simShow = { id: S.simShow?.id || ds.id, mode: 'result' }; if (S.view !== 'sim') return go('sim'); renderSim(); return scrollTo(0, 0);
    case 'answers': S.simShow = { id: ds.id || S.simShow?.id, mode: 'answers', filter: 'all' }; if (S.view !== 'sim') return go('sim'); renderSim(); return scrollTo(0, 0);
    case 'filter': S.simShow.filter = ds.f; return renderSim();
    case 'fails': { const r = recOf(ds.id); const ids = (r?.qs || []).filter(q => q[3] === 'x').map(q => q[0]).filter(id => S.cards.has(id)); S.simShow = null; return startSession(r.exam.startsWith('f:') ? 'folder:' + r.exam.slice(2) : r.exam, { ids }); }
    case 'goal': return goalSheet(ds.exam);
    case 'goal-set': S.prefs.plan.simGoal = { ...(S.prefs.plan.simGoal || {}), [ds.exam]: Number(ds.v) }; savePrefsSoon(); closeSheet(); return S.view === 'exam' ? renderExam() : renderSim();
  }
}
function move(d) {
  const sim = S.sim, i = sim.cur + d;
  if (i < 0) return;
  if (i >= sim.qs.length) { sim.phase = 'review'; save(); return renderSim(); }
  sim.cur = i; save(); renderSim(); scrollTo(0, 0);
}
// Teclado (ordenador): 1-4 eligen, B en blanco, R revisar, ← → cambian, Esc «¿Entregas ya?»
export function simKey(e) {
  if (S.view !== 'sim' || !S.sim || !$('#sheet').hidden || e.ctrlKey || e.metaKey || e.altKey) return false;
  const sim = S.sim, typing = e.target.matches?.('input, textarea');
  if (sim.phase === 'review' && e.key === 'Escape') { simClick({ dataset: { sim: 'back' } }); return true; }
  if (sim.phase !== 'q') return false;
  if (e.key === 'Escape') { simClick({ dataset: { sim: 'review' } }); return true; }
  if (typing) { if (e.key === 'Enter') { e.preventDefault(); move(1); return true; } return false; }
  const q = sim.qs[sim.cur];
  if (/^[1-6]$/.test(e.key) && q.kind === 'choice' && q.opts[Number(e.key) - 1] != null) { simClick({ dataset: { sim: 'pick', i: String(Number(e.key) - 1) } }); return true; }
  const k = e.key.toLowerCase();
  if (k === 'b') { simClick({ dataset: { sim: 'blank' } }); return true; }
  if (k === 'r') { simClick({ dataset: { sim: 'flag' } }); return true; }
  if (e.key === 'ArrowRight') { move(1); return true; }
  if (e.key === 'ArrowLeft') { move(-1); return true; }
  return false;
}
