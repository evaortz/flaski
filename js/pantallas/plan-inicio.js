// Flaski · plan de estudio: la pantalla del Plan. Una respuesta arriba (llegas o no, a cada examen), los exámenes
// con su barra, «Añadir un examen», Esta semana, Qué toca ahora y Ajustes del plan. Si no llegas, «Para llegar»
// con los arreglos del motor (calculados al abrir, sin bloquear). En el ordenador, dos columnas con la línea de
// tiempo de cada examen y «Cuánto te cunde».
import { icon } from '../icons.js';
import { dayKey, addDays, daysBetween, weekdayOf, WEEK_NAMES } from '../plan.js';
import { main, S, esc } from '../comun.js';
import { plan2, forecastNow, stateNow, todayPlan } from '../plan2-app.js';
import { todayQueue, dayDone, restLink } from './estudio.js';
import { fixes, liveExams } from '../plan2.js';
import { plural } from './mazos.js';
import { cundeHTML } from './plan-tiempo.js';
import { examBarHTML, legendHTML, weekRowHTML, weekTotalText, fixCardHTML, shortDay, shortName, topicTag, topicName, deckName, calIcon, daysLeft, VERDICT, MONTHS } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';

const upcoming = fc => fc.exams.filter(e => e.date && e.date >= dayKey()).sort((a, b) => a.date.localeCompare(b.date));
const weeks = n => (n >= 14 ? plural(Math.round(n / 7), 'semana', 'semanas') : plural(n, 'día', 'días'));
const twoWords = n => ({ 1: 'al examen', 2: 'a los dos exámenes' }[n] || `a los ${n} exámenes`);

export function renderPlanHome() {
  const y = scrollY, fc = forecastNow(), exams = upcoming(fc), late = exams.find(e => e.verdict === 'no');
  const wk = weekRowHTML(fc);
  main.innerHTML = `<div class="p2-plan">
    <header class="p2-head"><div class="crumbs-row"><button class="back-round" data-nav="profile" aria-label="Volver a Perfil">${icon('chevron-left', { size: 22 })}</button><span class="crumb-t">Perfil</span></div>
      <h1 class="p2-h1">Plan</h1>
      <div class="p2-head-btns"><button class="ghost" data-nav="planSettings">${icon('sliders-horizontal', { size: 18 })} Ajustes del plan</button><button class="primary" data-p2="exam-new">${icon('plus', { size: 18 })} Examen</button></div></header>
    <div class="p2-cols"><div class="p2-col-l">
      ${verdictHTML(fc, exams, late)}
      ${late && plan2().lateOk !== lateKey(late) ? `<section class="p2-sec" aria-labelledby="h-llegar" id="p2Fixes"><h2 class="p2-h2" id="h-llegar">Para llegar</h2><p class="muted">Calculando cómo llegar…</p></section>` : ''}
      ${exams.length ? `<ul class="p2-exams">${exams.map(examRowHTML).join('')}</ul>` : ''}
      <button class="link p2-add" data-p2="exam-new">${icon('plus', { size: 18 })} Añadir un examen</button>
    </div><div class="p2-col-r">
      <section class="p2-sec" aria-labelledby="h-semana"><div class="section-h"><h2 class="p2-h2" id="h-semana">Esta semana</h2><span class="sec-note">${weekTotalText(wk.total)}</span></div>${wk.html}<p class="muted p2-wnote">${wk.note}</p></section>
    </div></div>
    ${exams.length ? `<section class="p2-sec p2-desk" aria-labelledby="h-hasta"><div class="section-h"><h2 class="p2-h2" id="h-hasta">Hasta los exámenes</h2><span class="sec-note">toca un examen para ver sus temas</span></div>${timelineHTML(fc, exams)}</section>` : ''}
    <div class="p2-cols"><div class="p2-col-l">
      <section class="p2-sec" aria-labelledby="h-ahora"><h2 class="p2-h2" id="h-ahora">Qué toca ahora</h2>${todayLineHTML()}${nowHTML(fc, exams)}</section>
    </div><div class="p2-col-r p2-desk">
      <section class="p2-sec" aria-labelledby="h-p2cunde">${cundeHTML()}</section>
    </div></div>
    <button class="link p2-settings" data-nav="planSettings">${icon('sliders-horizontal', { size: 18 })} Ajustes del plan</button></div>`;
  if (S.view === 'plan') scrollTo(0, y);
  if (late && plan2().lateOk !== lateKey(late)) setTimeout(() => drawFixes(late.id), 30);
}
const lateKey = e => `${e.id}@${e.date}`;

// «Llegas a los dos exámenes» o «Así no llegas a Auxiliar»
function verdictHTML(fc, exams, late) {
  if (!exams.length) return `<div class="p2-verdict"><h2 class="p2-vt">Sin exámenes a la vista</h2><p>Añade uno y te digo si llegas, con tu tiempo. Mientras, lo nuevo se reparte entre tus listas.</p></div>`;
  if (late) {
    const days = forecastNow().days, end = Math.min(days.length - 1, daysBetween(dayKey(), late.date) - 1);
    const study = days.slice(0, end + 1).filter(d => d.minutes > 0), got = study.reduce((a, d) => a + Object.entries(d.newBy).filter(([id]) => late.topics.some(t => t.id === id)).reduce((s, [, n]) => s + n, 0), 0);
    const per = study.length ? Math.round(got / study.length) : 0, need = study.length ? Math.ceil(late.start / study.length) : late.start;
    return `<div class="p2-verdict late"><h2 class="p2-vt">Así no llegas a ${esc(shortName(late.name))}</h2>
      <p>Al ${shortDay(late.date)} te quedarían <b>${late.left} de ${late.start}</b> preguntas sin ver. Con tu semana actual caben unas ${plural(per, 'nueva', 'nuevas')} al día y harían falta ${need}.</p></div>`;
  }
  const [first, ...rest] = exams, justo = exams.some(e => e.verdict === 'justo');
  const firstText = !first.start ? `Ya has visto todo el temario de ${esc(shortName(first.name))}` : `Acabas el temario de ${esc(shortName(first.name))} el <b>${shortDay(first.finish)}</b>${first.review >= 1 ? ` y te quedan ${weeks(first.review)} para repasar` : ''}`;
  const restText = rest.map(e => `${esc(shortName(e.name))}, ${e.start ? `el ${shortDay(e.finish)}` : 'ya visto'}`).join('; ');
  return `<div class="p2-verdict"><h2 class="p2-vt">${justo ? 'Llegas justo' : 'Llegas'} ${twoWords(exams.length)}</h2>
    <p>${firstText}.${restText ? ` ${restText.charAt(0).toUpperCase() + restText.slice(1)}.` : ''}</p>${legendHTML()}</div>`;
}

function examRowHTML(e) {
  return `<li><button class="p2-exrow" data-p2="exam" data-id="${esc(e.id)}">
    <span class="p2-exrow-h">${calIcon(e.date, 40)}<span><b>${esc(e.name)}</b><small>${shortDay(e.date)} · ${daysLeft(e.date)} · ${e.seen} % visto</small></span><em class="p2-pill ${e.verdict}">${VERDICT[e.verdict] || ''}</em>${icon('chevron-right', { size: 18 })}</span>
    ${examBarHTML(e)}</button></li>`;
}

// Lo de hoy, lo mismo que dice Hoy: «Hoy, 45 min: 20 nuevas y 100 repasos», el día libre o «Hecho por hoy»
function todayLineHTML() {
  const t = todayPlan(), done = dayDone();
  if (done) {
    const q = todayQueue('all');
    return `<p class="p2-today day-done"><b>Hecho por hoy:</b> ${plural(done.n, 'pregunta', 'preguntas')} · ${done.minutes} min.${q.ids.length ? ` Lo que queda pasa a mañana. ${restLink(q)}` : ''}</p>`;
  }
  if (t.rest) return `<p class="p2-today">Hoy es tu día libre${t.reviews ? `: tocarían ${plural(t.reviews, 'repaso', 'repasos')}, que pasan a mañana si no los haces` : ''}.</p>`;
  if (!t.total) return '<p class="p2-today">Hoy no te queda nada.</p>';
  return `<p class="p2-today">Hoy, ${t.minutes} min: ${plural(t.new, 'nueva', 'nuevas')} y ${plural(t.reviews, 'repaso', 'repasos')}${t.short ? `; caben ${t.reviewsFit} repasos` : ''}. <button class="link" data-act="tanda-short">Empezar la tanda</button></p>`;
}
// «Qué toca ahora»: el tema de cada examen que da nuevas ahora (el próximo día con tiempo)
function nowHTML(fc, exams) {
  const k = dayKey(), day = fc.days.find(d => d.minutes > 0 && d.new > 0);
  if (!day) return '<p class="muted">Ahora no toca nada nuevo: solo repasos.</p>';
  const cards = [];
  for (const e of exams) {
    const ids = Object.keys(day.newBy).filter(id => e.topics.some(t => t.id === id && t.state === 'study'));
    if (!ids.length) continue;
    const id = ids.sort((a, b) => day.newBy[b] - day.newBy[a])[0], t = e.topics.find(x => x.id === id), main_ = exams[0]?.id === e.id || cards.length === 0;
    const until = t.finish ? `hasta el ${t.finish < addDays(k, 7) ? `${WEEK_NAMES[weekdayOf(t.finish)]} ` : ''}${shortDay(t.finish)}` : '';
    const ix = e.topics.findIndex(x => x.id === id), next = e.topics.slice(ix + 1).find(x => x.state === 'study');
    const sub = main_ ? [shortName(e.name), until, plural(t.fresh, 'nueva', 'nuevas'), next ? `luego ${topicTag(deckName(next.id))} ${topicName(deckName(next.id))}` : ''].filter(Boolean).join(' · ')
      : `${shortName(e.name)} · ${plural(day.newBy[id], 'nueva', 'nuevas')} al día${exams[0] && exams[0].id !== e.id && exams[0].finish ? ` hasta que acabes ${shortName(exams[0].name)}` : ''}`;
    cards.push(`<button class="p2-now" data-p2="exam" data-id="${esc(e.id)}"><span class="p2-now-tag hand">${esc(topicTag(deckName(id)))}</span><span><b>${esc(topicName(deckName(id)))}</b><small>${esc(sub)}</small></span>${icon('chevron-right', { size: 18 })}</button>`);
  }
  const free = Object.keys(day.newBy).filter(id => !exams.some(e => e.topics.some(t => t.id === id)));
  if (free.length) cards.push(`<div class="p2-now"><span class="p2-now-tag hand">${esc(topicTag(deckName(free[0])))}</span><span><b>${esc(deckName(free[0]))}</b><small>sin examen · ${plural(free.reduce((a, id) => a + day.newBy[id], 0), 'nueva', 'nuevas')} ${day.day === k ? 'hoy' : `el ${WEEK_NAMES[weekdayOf(day.day)]}`}</small></span></div>`);
  return cards.join('') || '<p class="muted">Ahora no toca nada nuevo: solo repasos.</p>';
}

// «Hasta los exámenes» (ordenador): una fila por examen sobre los meses que quedan
function timelineHTML(fc, exams) {
  const t = dayKey(), end = exams.at(-1).date, total = Math.max(1, daysBetween(t, end) + 4), at = k => (Math.max(0, daysBetween(t, k)) / total) * 100;
  const months = [];
  for (let k = addDays(t.slice(0, 8) + '01', 0); k <= end; k = addDays(k, 32).slice(0, 8) + '01') if (k > t) months.push(k);
  const ticks = months.map(k => `<span class="p2-tl-m" style="left:${at(k)}%">${MONTHS[Number(k.slice(5, 7)) - 1]}</span>`).join('');
  const rows = exams.map(e => {
    const ids = new Set(e.topics.map(x => x.id)), share = d => d.new ? Object.entries(d.newBy).filter(([id]) => ids.has(id)).reduce((a, [, n]) => a + n, 0) / d.new : 0;
    const mainFrom = fc.days.find(d => d.new && share(d) >= 0.5)?.day;
    const segs = [];
    if (e.start > 0 && e.finish) {
      const studyFrom = fc.days.find(d => share(d) > 0)?.day || t;
      if (mainFrom && mainFrom > studyFrom) {
        const per = Math.round(fc.days.filter(d => d.day < mainFrom && d.minutes > 0).reduce((a, d) => a + share(d) * d.new, 0) / Math.max(1, fc.days.filter(d => d.day < mainFrom && d.minutes > 0).length));
        segs.push(['goteo', studyFrom, addDays(mainFrom, -1), `goteo · ${per} al día`]);
      }
      const first = e.topics.find(x => x.state === 'study'), last = [...e.topics].reverse().find(x => x.state === 'study');
      segs.push(['temario', mainFrom && mainFrom > studyFrom ? mainFrom : studyFrom, e.finish, mainFrom && mainFrom > studyFrom ? '' : `temario · ${topicTag(deckName(first?.id))}${last && last !== first ? ` → ${topicTag(deckName(last.id))}` : ''}`]);
    }
    if (e.phases.repaso) segs.push(['repaso', e.phases.repaso[0], e.phases.repaso[1], 'repaso']);
    if (e.phases.lastWeek) segs.push(['ultima', e.phases.lastWeek[0], e.phases.lastWeek[1], '']);
    return `<button class="p2-tl-row" data-p2="exam" data-id="${esc(e.id)}"><span class="p2-tl-n"><b>${esc(e.name)}</b><small>${e.verdict === 'no' ? 'no llegas' : e.finish ? `acabas el temario el ${shortDay(e.finish)}` : 'todo visto'}</small></span>
      <span class="p2-tl-track">${segs.map(([c, a, b, l]) => `<i class="p2-tl-s ${c}" style="left:${at(a)}%;width:${Math.max(0.8, at(addDays(b, 1)) - at(a))}%">${l ? `<span>${esc(l)}</span>` : ''}</i>`).join('')}<span class="p2-tl-cal" style="left:${at(e.date)}%">${calIcon(e.date, 30)}</span></span></button>`;
  }).join('');
  return `<div class="p2-tl"><div class="p2-tl-ticks">${ticks}</div><div class="p2-tl-rows"><i class="p2-tl-now" aria-hidden="true"></i>${rows}</div></div>`;
}

/* ---------------- para llegar ---------------- */
// Los arreglos del motor para el examen al que no llegas (al abrir, sin bloquear la pantalla)
function drawFixes(id) {
  const host = document.getElementById('p2Fixes');
  if (!host) return;
  const fx = fixes(stateNow(), id), exam = forecastNow().exams.find(e => e.id === id);
  S.p2Fixes = { id, list: fx.options, drop: fx.drop, pick: 0 };
  if (!fx.options.length) {
    const d = fx.drop, names = (d?.topics || []).map(t => topicTag(deckName(t))).join(', ');
    host.innerHTML = `<h2 class="p2-h2" id="h-llegar">Para llegar</h2>
      ${d?.topics.length ? `<p class="muted">Ni con más tiempo llegas a todo. Puedes dejar ${names} para después del examen: ${d.exam.verdict === 'no' ? `aun así te faltarían ${d.exam.left}.` : `así llegas con el resto (acabas el ${shortDay(d.exam.finish)}).`}</p><button class="primary big" data-p2="drop-apply">Dejar ${esc(names)} para después</button>`
        : '<p class="muted">No hay forma de verlo todo antes del examen. Cambia la fecha o tus minutos y lo recalculo.</p>'}
      <button class="link" data-p2="late-ok">Lo dejo así</button>`;
    return;
  }
  host.innerHTML = `<h2 class="p2-h2" id="h-llegar">Para llegar</h2><p class="muted">Cada opción está calculada hasta que llegas. Elige una; se puede deshacer.</p>
    <div class="p2-fixes" role="radiogroup" aria-label="Para llegar">${fx.options.map((o, i) => fixCardHTML(o, i, 0, exam)).join('')}</div>
    <p class="muted small">Si ninguna te vale, cambia la fecha o tus minutos y lo recalculo. <button class="link" data-p2="late-ok">Lo dejo así</button></p>
    <button class="primary big" data-p2="fix-apply">Aplicar la primera</button>`;
}
export function pickFix(i) {
  if (!S.p2Fixes) return;
  S.p2Fixes.pick = i;
  for (const b of document.querySelectorAll('#p2Fixes .p2-fix')) b.setAttribute('aria-checked', String(Number(b.dataset.i) === i));
  const btn = document.querySelector('#p2Fixes [data-p2="fix-apply"]');
  if (btn) btn.textContent = ['Aplicar la primera', 'Aplicar la segunda', 'Aplicar la tercera'][i] || 'Aplicar';
}
export function applyFix(drop = false) {
  const f = S.p2Fixes, o = drop ? f?.drop : f?.list[f.pick];
  if (!o) return;
  const exams = o.plan.exams, caps = o.plan.caps, time = o.plan.time;
  commitPlan(drop ? 'Temas para después del examen' : 'Arreglo para llegar', p => { p.exams = exams; p.caps = caps; p.time = time; });
  S.p2Fixes = null;
}
export function lateOk() {
  const late = upcoming(forecastNow()).find(e => e.verdict === 'no');
  if (late) commitPlan('Lo dejas así', p => { p.lateOk = lateKey(late); }, { quiet: true });
}
export { liveExams };
