// Flaski · plan de estudio: un tema de un examen. «Ya me lo sé» (con «Comprobar · 10 preguntas»: las de un tema al
// azar, sin reloj, con la pieza del simulacro) y «Refuerza este tema» (más repasos de lo que te cuesta, 7 días).
//   Comprobar, con 8 de 10 o más: el tema pasa a repaso (lo que no salió, como repasos repartidos en una semana,
//   empezando por ahí) y las falladas entran como nuevas. Con menos, el tema sigue en el plan y las acertadas
//   cuentan como vistas. Antes de guardar, «Así queda el plan».
import { icon } from '../icons.js';
import { DAY, startOfDay } from '../srs.js';
import { dayKey, addDays } from '../plan.js';
import { S, esc, hooks } from '../comun.js';
import * as api from '../api.js';
import { toRow } from '../rows.js';
import { forecast, liveExams } from '../plan2.js';
import { plan2, forecastNow, stateNow } from '../plan2-app.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { recordAnswer } from './estudio.js';
import { launch } from './simulacro.js';
import { compareHTML, deckName, topicTag, shortDay } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';
import { go } from '../app.js';

const CHECK_N = 10, PASS = 0.8, BOOST_DAYS = 7;
const cardsOf = deckId => [...S.cards.values()].filter(c => c.deck_id === deckId);

/* ---------------- Ya me lo sé ---------------- */
export function knownSheet(examId, deckId) {
  const n = Math.min(CHECK_N, cardsOf(deckId).length), need = Math.ceil(n * PASS);
  S.p2Topic = { ...(S.p2Topic || {}), examId, deckId };
  openSheet(`<div class="p2-sheet"><h2 class="sheet-hand">Ya me lo sé</h2>
    <p class="muted">${esc(deckName(deckId))}: compruébalo con ${plural(n, 'pregunta', 'preguntas')} al azar, sin reloj. Si aciertas ${need}, el tema pasa a repaso sin verlo como nuevo.</p>
    <button class="primary big" data-p2="check-go">Comprobar · ${plural(n, 'pregunta', 'preguntas')}</button>
    <button class="link" data-p2="topic-known">Pasarlo a repaso sin comprobar</button></div>`);
}
export function startCheck() {
  const { examId, deckId } = S.p2Topic || {}, n = Math.min(CHECK_N, cardsOf(deckId).length);
  launch({ exam: deckId, n, time: 0, pen: 0, testOnly: false, fresh: true, mode: 'check', name: deckName(deckId), deckId, examId });
}
// Lo que cambia el progreso al seguir: las acertadas, vistas; con 8 o más, lo que no salió del tema, como repasos
function changesOf(check) {
  const now = Date.now(), right = check.qs.filter(([, r]) => r === 'o').map(([id]) => id), asked = new Set(check.qs.map(([id]) => id));
  const pass = right.length >= Math.ceil(check.qs.length * PASS);
  const untested = pass ? cardsOf(check.deckId).filter(c => !asked.has(c.id) && !S.progress.has(c.id)).map(c => c.id) : [];
  // Lo que no salió: repasos de aquí a una semana, unos cuantos cada día
  const rows = untested.map((id, i) => { const d = 1 + Math.floor((i * BOOST_DAYS) / Math.max(1, untested.length)); return [id, { reps: 1, interval: d, ease: 2.5, lapses: 0, due: startOfDay(now) + d * DAY, firstSeen: now, last: now, stability: d, difficulty: 5 }]; });
  return { right, pass, untested: rows, failed: check.qs.length - right.length };
}
// El resultado: «9 de 10 · Te lo sabes», qué pasa con el tema y «Así queda el plan»
function checkHTML(check) {
  const ch = changesOf(check), n = check.qs.length, ok = ch.right.length, tag = topicTag(deckName(check.deckId));
  // El plan con el progreso como quedaría (sin guardar nada)
  const prog = new Map(S.progress);
  for (const id of ch.right) prog.set(id, { reps: 1, interval: 3, ease: 2.5, lapses: 0, due: startOfDay() + 3 * DAY, firstSeen: Date.now(), last: Date.now(), stability: 3, difficulty: 5 });
  for (const [id, p] of ch.untested) prog.set(id, p);
  const after = forecast({ ...stateNow(), progress: prog, stockKey: 'comprobar' });
  const text = ch.pass ? `${tag} pasa a repaso: ${plural(cardsOf(check.deckId).length, 'pregunta sale', 'preguntas salen')} como repasos, empezando por las que no han salido aquí.${ch.failed ? ` ${ch.failed === 1 ? 'La que has fallado entra' : `Las ${ch.failed} que has fallado entran`} como nueva${ch.failed === 1 ? '' : 's'}.` : ''}`
    : `${tag} sigue en el plan, pero ${ok === 1 ? 'la acertada cuenta' : `las ${ok} acertadas cuentan`} como vista${ok === 1 ? '' : 's'}.`;
  const other = ch.pass ? `si sale menos de ${Math.ceil(n * PASS)} de ${n}:` : `si sale ${Math.ceil(n * PASS)} de ${n} o más:`;
  const otherText = ch.pass ? `«Aún no del todo»: ${tag} sigue en el plan, pero las acertadas cuentan como vistas.` : `«Te lo sabes»: ${tag} pasa a repaso y las falladas entran como nuevas.`;
  return `<div class="sm-page p2-check"><div class="sm-head"><button class="sm-x" data-sim="check-close" aria-label="Cerrar sin guardar">${icon('x', { size: 22 })}</button><div class="sm-ht"><b>Comprobar · ${esc(check.name)}</b></div><span></span></div>
    <div class="p2-check-bar" aria-hidden="true">${check.qs.map(([, r]) => `<i class="r-${r}"></i>`).join('')}</div>
    <div class="p2-check-res ${ch.pass ? 'ok' : 'no'}"><b class="hand">${ok} de ${n}</b><h1 class="hand">${ch.pass ? 'Te lo sabes' : 'Aún no del todo'}</h1><p>${esc(text)}</p></div>
    ${compareHTML(forecastNow(), after, { title: 'Así queda el plan' })}
    <div class="p2-check-other"><b class="hand">${other}</b><p>${esc(otherText)}</p></div>
    <button class="primary big" data-sim="check-ok">Seguir</button></div>`;
}
function applyCheck(check) {
  const ch = changesOf(check);
  for (const id of ch.right) recordAnswer(id, 3, 15000);
  if (ch.untested.length) {
    for (const [id, p] of ch.untested) S.progress.set(id, p);
    api.saveProgressMany(ch.untested.map(([id, p]) => toRow(S.uid, id, p))).catch(() => {});
  }
  const examId = check.examId;
  S.simShow = null;
  commitPlan(ch.pass ? `${topicTag(deckName(check.deckId))}: te lo sabes` : `${topicTag(deckName(check.deckId))}: ${plural(ch.right.length, 'acertada', 'acertadas')}`, () => {}, { redraw: false });
  go('exam', { examId, examKey: null });
}
hooks.check = { html: checkHTML, apply: applyCheck };

/* ---------------- Refuerza este tema ---------------- */
// 7 días con más repasos de lo que te cuesta de ese tema (exam.boost[lista] = hasta qué día)
export const boostUntil = (examId, deckId) => { const u = liveExams(plan2()).find(e => e.id === examId)?.boost?.[deckId]; return u && u >= dayKey() ? u : null; };
export function setBoost(examId, deckId, on) {
  const until = addDays(dayKey(), BOOST_DAYS - 1);
  closeSheet();
  commitPlan(on ? `Refuerzas ${topicTag(deckName(deckId))} hasta el ${shortDay(until)}` : `${topicTag(deckName(deckId))}, sin refuerzo`, p => {
    const x = p.exams.find(e => e.id === examId), b = { ...(x.boost || {}) };
    if (on) b[deckId] = until; else delete b[deckId];
    x.boost = b;
  });
}
