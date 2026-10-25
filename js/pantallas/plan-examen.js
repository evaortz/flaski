// Flaski · plan de estudio: un examen. Cómo va (llegas, con cuánto repaso, el ritmo), el camino (cada tema con sus
// fechas, el repaso, la última semana y el examen), «Un tema tras otro | Varios a la vez», cambiar el orden
// arrastrando, fijar una fecha a un tema, la recta final y los simulacros.
import { icon } from '../icons.js';
import { dayKey, addDays, daysBetween, weekdayOf, WEEK_NAMES, isDay } from '../plan.js';
import { main, S, esc, toast } from '../comun.js';
import { plan2, forecastNow } from '../plan2-app.js';
import { liveExams } from '../plan2.js';
import { examIdFor } from '../plan2-migrar.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { simBlockHTML } from './simulacro.js';
import { examBarHTML, shortDay, longDay, rangeDay, shortName, topicTag, topicName, deckName, calIcon, daysLeft, asiSoon, asiNow } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';
import { go } from '../app.js';

// La clave del examen de antes (carpeta «f:id» o lista): con ella van sus simulacros y su objetivo de nota
export const simKey = ex => (ex?.scope?.folders?.[0] ? 'f:' + ex.scope.folders[0] : ex?.scope?.decks?.[0] || ex?.scope?.pages?.[0] || ex?.id);
export const examById = id => liveExams(plan2()).find(e => e.id === id || simKey(e) === id || examIdFor(id || '') === e.id) || null;
const ex0 = () => examById(S.examKey || S.examId);
const AFTER = { pause: 'pasa a pausa', archive: 'se archiva', keep: 'sigue con repasos muy espaciados', next: 'sigue para otra convocatoria' };

export function renderPlanExam() {
  const ex = ex0();
  if (!ex) { S.view = 'plan'; return go('plan'); }
  S.examId = ex.id; S.examKey = null;
  const fc = forecastNow(), e = fc.exams.find(x => x.id === ex.id), t = dayKey(), date = ex.date;
  const pages = ex.scope?.folders?.length ? [...S.pages.values()].filter(p => ex.scope.folders.includes(p.folder_id)).length : (ex.scope?.pages || []).length;
  const nTopics = e.topics.length, order = S.p2Order === ex.id;
  main.innerHTML = `<div class="p2-exam-page">
    <div class="crumbs-row"><button class="back-round" data-nav="plan" aria-label="Volver al plan">${icon('chevron-left', { size: 22 })}</button><span class="crumb-t">Plan</span></div>
    <div class="p2-exhead">${calIcon(date, 72)}<div><h1 class="p2-h1">${esc(ex.name)}</h1><p class="muted">${isDay(date) ? `Examen el ${WEEK_NAMES[weekdayOf(date)]} ${longDay(date)} · ${daysLeft(date)}` : 'Sin fecha'}</p></div></div>
    <div class="p2-cols"><div class="p2-col-l">
    ${statusHTML(e, fc)}
    <section class="p2-sec" aria-labelledby="h-camino"><div class="section-h"><h2 class="p2-h2" id="h-camino">El camino</h2><span class="sec-note">${plural(nTopics, 'tema', 'temas')}${pages ? ` · ${plural(pages, 'apunte', 'apuntes')}` : ''}</span></div>
      <div class="seg p2-mode" role="group" aria-label="Cómo van los temas"><button type="button" class="seg-b" data-p2="mode" data-v="seq" aria-pressed="${ex.mode !== 'parallel'}">Un tema tras otro</button><button type="button" class="seg-b" data-p2="mode" data-v="parallel" aria-pressed="${ex.mode === 'parallel'}">Varios a la vez</button></div>
      ${order ? orderHTML(ex, e) : pathHTML(ex, e)}
      ${order ? `<button class="primary big" data-p2="order-done">Listo</button>` : `<div class="p2-exbtns"><button class="ghost" data-p2="order">Cambiar el orden</button><button class="ghost" data-p2="fix-date">Fijar una fecha</button></div>
      <p class="muted small">Las fechas de cada tema salen solas de tu ritmo. Si fijas una (por ejemplo, «${esc(topicTag(deckName(e.topics.find(x => x.state === 'study')?.id || e.topics[0]?.id)))} antes del ${shortDay(addDays(t, 10))}»), las demás se recolocan.</p>`}
    </section></div><div class="p2-col-r">
    <section class="p2-sec" aria-labelledby="h-recta"><h2 class="p2-h2" id="h-recta">La recta final</h2>
      ${switchRow('lastWeek', 'La última semana, solo repasar', ex.lastWeek ? 'Recomendado: llegas con todo fresco.' : 'Las nuevas siguen entrando hasta el examen.', ex.lastWeek)}
      ${switchRow('after', 'Después del examen, en pausa', ex.after === 'pause' ? 'Si apruebas, ya no te salen sus preguntas.' : ex.after ? `${esc(shortName(ex.name))} ${AFTER[ex.after]}.` : 'Al pasar la fecha te preguntaremos qué hacer.', ex.after === 'pause')}</section>
    ${simBlockHTML(simKey(ex))}
    <p class="p2-exfoot"><button class="link" data-p2="exam-edit" data-id="${esc(ex.id)}">Cambiar la fecha</button> · <button class="link danger" data-p2="exam-del">Quitar el examen</button></p>
    </div></div></div>`;
  if (order) bindOrder(ex);
}
const switchRow = (k, label, sub, on) => `<div class="set-row"><div class="set-l"><b id="p2s-${k}">${label}</b><small>${sub}</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="p2s-${k}" data-p2="exam-flag" data-k="${k}" ${on ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>`;

// «Llegas con 7 semanas de repaso», la barra y el ritmo
function statusHTML(e, fc) {
  const head = !e.date ? 'Sin fecha: el plan va a tu ritmo' : e.verdict === 'no' ? `Así no llegas: te faltarían ${e.left}` : !e.start ? 'Ya has visto todo el temario' : e.verdict === 'justo' ? `Llegas justo: acabas el ${shortDay(e.finish)}` : `Llegas con ${e.review >= 14 ? plural(Math.round(e.review / 7), 'semana', 'semanas') : plural(e.review, 'día', 'días')} de repaso`;
  const ids = new Set(e.topics.map(x => x.id)), days = fc.days.filter(d => d.minutes > 0 && d.day <= (e.finish || e.date || d.day));
  const mine = d => Object.entries(d.newBy).filter(([id]) => ids.has(id)).reduce((a, [, n]) => a + n, 0);
  const got = days.reduce((a, d) => a + mine(d), 0), all = days.reduce((a, d) => a + d.new, 0);
  const per = days.length ? Math.round(got / days.length) : 0, pct = all ? Math.round((100 * got) / all) : 0;
  return `<div class="p2-exstat${e.verdict === 'no' ? ' late' : ''}"><h2>${head}</h2>${examBarHTML(e)}
    <p>${e.start ? `Ritmo: unas ${plural(per, 'nueva', 'nuevas')} al día${pct && pct < 100 ? ` (el ${pct} % de tus nuevas)` : ''}. ` : ''}${e.start} de ${e.total} preguntas por ver.${e.verdict === 'no' ? ' <button class="link" data-nav="plan">Ver cómo llegar</button>' : ''}</p></div>`;
}

// El camino: los temas en su orden, con sus fechas, y después el repaso, la última semana y el examen
function pathHTML(ex, e) {
  const t = dayKey(), fixed = ex.fixed || {};
  const cur = e.topics.find(x => x.state === 'study' && x.from && x.from <= t && (!x.finish || x.finish >= t)) || e.topics.find(x => x.state === 'study' && x.fresh > 0);
  const rows = e.topics.map(x => {
    const name = deckName(x.id), now = x === cur;
    const [mark, right] = x.state === 'done' ? ['done', 'hecho'] : x.state === 'known' ? ['done', 'ya lo sabes'] : x.state === 'exclude' ? ['off', 'no cae'] : x.state === 'later' ? ['off', 'después del examen']
      : now ? ['now', x.finish ? `hasta el ${shortDay(x.finish)}` : ''] : ['todo', x.from ? rangeDay(x.from, x.finish) : 'después'];
    const sub = x.state !== 'study' ? '' : `${now && x.finish && x.finish <= addDays(t, 6) ? 'esta semana · ' : ''}${plural(x.fresh, 'nueva', 'nuevas')}${fixed[x.id] ? ` · antes del ${shortDay(fixed[x.id])}` : ''}`;
    return `<li class="p2-step ${mark}"><i class="p2-dot" aria-hidden="true">${mark === 'done' ? icon('check', { size: 14 }) : ''}</i><button class="p2-step-b" data-p2="topic" data-id="${esc(x.id)}"><span><b>${esc(name)}</b>${sub ? `<small>${sub}</small>` : ''}</span><em>${right}</em></button></li>`;
  });
  // El repaso: por hacer (círculo vacío, como los temas), en marcha o, solo cuando ha pasado, hecho
  const rp = e.phases.repaso;
  if (rp && rp[0] <= rp[1]) {
    const mark = rp[1] < t ? 'done' : rp[0] <= t ? 'now' : 'todo';
    rows.push(`<li class="p2-step ${mark}"><i class="p2-dot" aria-hidden="true">${mark === 'done' ? icon('check', { size: 14 }) : ''}</i><div class="p2-step-b"><span><b>Repaso</b><small>solo repasos y simulacros</small></span><em>${rangeDay(rp[0], rp[1])}</em></div></li>`);
  }
  if (e.phases.lastWeek) rows.push(`<li class="p2-step last"><i class="p2-dot" aria-hidden="true">${icon('timer', { size: 14 })}</i><div class="p2-step-b"><span><b>Última semana</b><small>repasa lo que más te cuesta; sin nuevas</small></span><em>${rangeDay(e.phases.lastWeek[0], e.phases.lastWeek[1])}</em></div></li>`);
  if (e.date) rows.push(`<li class="p2-step exam"><i class="p2-dot" aria-hidden="true"></i><div class="p2-step-b"><span><b>Examen</b><small>${ex.after ? `después: ${esc(shortName(ex.name))} ${AFTER[ex.after]}` : 'después: te preguntaremos'}</small></span><em>${shortDay(e.date)}</em></div></li>`);
  return `<ol class="p2-path">${rows.join('')}</ol>`;
}

/* ---------------- cambiar el orden ---------------- */
function orderHTML(ex, e) {
  const ids = e.topics.map(x => x.id);
  return `<p class="muted small">Arrastra los temas por el asa, o usa las flechas.</p><ul class="p2-order" id="p2Order">${ids.map((id, i) => `<li class="p2-ord" data-id="${esc(id)}"><span class="p2-ord-h" aria-hidden="true">${icon('grip-vertical', { size: 18 })}</span><b>${esc(deckName(id))}</b>
    <span class="p2-ord-btns"><button type="button" class="icon-btn" data-p2="order-move" data-id="${esc(id)}" data-d="-1" aria-label="Subir ${esc(deckName(id))}" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up', { size: 18 })}</button><button type="button" class="icon-btn" data-p2="order-move" data-id="${esc(id)}" data-d="1" aria-label="Bajar ${esc(deckName(id))}" ${i === ids.length - 1 ? 'disabled' : ''}>${icon('arrow-down', { size: 18 })}</button></span></li>`).join('')}</ul>`;
}
function setOrder(ids) {
  commitPlan('Orden de los temas', p => { p.exams.find(x => x.id === S.examId).order = ids; }, { quiet: true });
}
export function moveTopic(id, d) {
  const ids = [...document.querySelectorAll('#p2Order .p2-ord')].map(li => li.dataset.id), i = ids.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  setOrder(ids);
  document.querySelector(`#p2Order [data-p2="order-move"][data-id="${CSS.escape(id)}"][data-d="${d}"]`)?.focus();
}
function bindOrder() {
  const ul = document.getElementById('p2Order');
  if (!ul) return;
  ul.addEventListener('pointerdown', e => {
    const li = e.target.closest('.p2-ord-h')?.closest('.p2-ord');
    if (!li) return;
    e.preventDefault();
    li.classList.add('dragging');
    const move = ev => {
      const rows = [...ul.querySelectorAll('.p2-ord')].filter(r => r !== li);
      const after = rows.find(r => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      ul.insertBefore(li, after || null);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      li.classList.remove('dragging');
      setOrder([...ul.querySelectorAll('.p2-ord')].map(r => r.dataset.id));
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
}

/* ---------------- fijar una fecha ---------------- */
export function fixDateSheet(topicId) {
  const ex = ex0(), e = forecastNow().exams.find(x => x.id === ex.id), study = e.topics.filter(x => x.state === 'study');
  const id = topicId || study[0]?.id, cur = ex.fixed?.[id], t = dayKey();
  S.p2FixDate = { id, date: cur || addDays(t, 10) };
  openSheet(`<h2 class="sheet-hand">Fijar una fecha</h2>
    <p class="muted">Para una clase, un simulacro de la academia o un parcial. Ese tema sube lo justo para acabarlo antes; los demás se recolocan.</p>
    <label for="p2fdT">Tema</label><select id="p2fdT" data-p2="fd-change">${study.map(x => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(deckName(x.id))}</option>`).join('')}</select>
    <label for="p2fdD">Terminarlo antes del</label><input type="date" id="p2fdD" data-p2="fd-change" min="${t}" max="${ex.date || ''}" value="${S.p2FixDate.date}">
    <div id="p2Asi">${asiNow(fdChange())}</div>
    <div class="btnrow">${cur ? `<button class="ghost danger" data-p2="fd-clear">Quitar la fecha</button>` : ''}<span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-p2="fd-save">Guardar</button></div>`);
}
const fdChange = () => { const { id, date } = S.p2FixDate, exId = S.examId; return p => { const x = p.exams.find(y => y.id === exId); x.fixed = { ...(x.fixed || {}), [id]: date }; }; };
export function fixDateInput() {
  S.p2FixDate = { id: document.getElementById('p2fdT').value, date: document.getElementById('p2fdD').value };
  if (isDay(S.p2FixDate.date)) asiSoon(document.getElementById('p2Asi'), fdChange());
}
export function fixDateSave(clear = false) {
  const { id, date } = S.p2FixDate || {};
  if (!clear && !isDay(date)) return toast('Elige una fecha');
  closeSheet();
  commitPlan(clear ? 'Fecha quitada' : `${topicTag(deckName(id))} antes del ${shortDay(date)}`, p => {
    const x = p.exams.find(y => y.id === S.examId), f = { ...(x.fixed || {}) };
    if (clear) delete f[id]; else f[id] = date;
    x.fixed = f;
  });
}

/* ---------------- el resto ---------------- */
export function setMode(v) {
  if (v === 'parallel') return import('./plan-reparto.js').then(m => m.repartoSheet({ examId: S.examId, mode: 'parallel' }));
  commitPlan('Un tema tras otro', p => { p.exams.find(x => x.id === S.examId).mode = 'seq'; });
}
export function setFlag(k, on) {
  commitPlan(k === 'lastWeek' ? (on ? 'Última semana, solo repasar' : 'Nuevas hasta el examen') : on ? 'Después del examen, en pausa' : 'Después del examen, te preguntaremos', p => {
    const x = p.exams.find(y => y.id === S.examId);
    if (k === 'lastWeek') x.lastWeek = on; else x.after = on ? 'pause' : null;
  });
}
export function removeExam() {
  const ex = ex0();
  openSheet(`<h2>¿Quitar el examen de ${esc(ex.name)}?</h2><p class="muted">Sus listas y apuntes se quedan como están; solo deja de haber examen. Se puede deshacer.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="danger solid primary" data-p2="exam-del-ok">Quitar el examen</button></div>`);
}
export function removeExamOk() {
  const id = S.examId;
  closeSheet();
  commitPlan('Examen quitado', p => { const i = p.exams.findIndex(x => x.id === id); if (i >= 0) p.exams[i] = { id, deleted: true }; }, { redraw: false });
  go('plan');
}

/* ---------------- después del examen ---------------- */
// Al pasar la fecha, si no se decidió al crearlo: ¿y ahora? Mientras no se contesta, solo repasos
const AFTER_OPTS = [
  ['pause', 'Pausarlo', 'Ya no te salen sus preguntas. Si vuelves, lo reanudas.'],
  ['archive', 'Archivarlo', 'Se acabó: fuera del plan, ni nuevas ni repasos.'],
  ['keep', 'Mantenerlo con repasos', 'Sin nuevas; los repasos siguen, cada vez más espaciados.'],
  ['next', 'Preparar otra convocatoria', 'Lo que te quede sigue entrando; pon la fecha nueva cuando la sepas.'],
];
export const pendingAfter = () => forecastNow().exams.filter(e => e.date && e.date < dayKey() && !liveExams(plan2()).find(x => x.id === e.id)?.after);
export function afterQuestionHTML() {
  return pendingAfter().map(e => `<section class="p2-after" aria-labelledby="h-after-${esc(e.id)}"><h2 class="p2-h2" id="h-after-${esc(e.id)}">El examen de ${esc(shortName(e.name))} ya pasó</h2>
    <p class="muted">¿Y ahora? Mientras no lo decidas, solo te salen sus repasos.</p>
    <div class="p2-after-opts">${AFTER_OPTS.map(([v, l, h]) => `<button type="button" class="p2-row" data-p2="after-set" data-id="${esc(e.id)}" data-v="${v}"><span><b>${l}</b><small>${h}</small></span>${icon('chevron-right', { size: 18 })}</button>`).join('')}</div></section>`).join('');
}
export function setAfter(id, v) {
  const name = shortName(liveExams(plan2()).find(e => e.id === id)?.name || '');
  commitPlan(`${name}: ${AFTER_OPTS.find(o => o[0] === v)[1].toLowerCase()}`, p => { p.exams.find(e => e.id === id).after = v; });
  if (v === 'next') import('./plan-nuevo.js').then(m => m.newExamSheet({ id }));
}
