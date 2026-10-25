// Flaski · plan nuevo (paso B): «Tu tiempo» (minutos de cada día, días especiales, pausa y cuánto te cunde),
// «Hoy solo tengo…» y lo que Hoy y la tanda dicen con el motor. Solo con el interruptor «plan2» (plan2-app.js).
import { icon } from '../icons.js';
import { WEEK, WEEK_NAMES, dayKey, addDays, isDay, live, daysBetween, weekdayOf } from '../plan.js';
import { main, S, esc, toast } from '../comun.js';
import { plan2, editPlan2, todayPlan, forecastNow, minutesToday } from '../plan2-app.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { savePrefsSoon } from './perfil.js';
import { render, go } from '../app.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dd = k => { const [y, m, d] = k.split('-').map(Number); return { y, m: m - 1, d }; };
export const shortDay = k => { const x = dd(k); return `${x.d} ${MONTHS[x.m]}`; };
const longDay = k => { const x = dd(k); return `${x.d} de ${MONTHS_LONG[x.m]}`; };
const range = (a, b) => (a === b ? shortDay(a) : dd(a).m === dd(b).m ? `${dd(a).d} – ${shortDay(b)}` : `${shortDay(a)} – ${shortDay(b)}`);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const touch = x => { x.at = Date.now(); return x; };
const T = () => editPlan2().time || (editPlan2().time = { week: null, special: [], today: null, pause: null });
function saved() { T().updated_at = Date.now(); savePrefsSoon(); render(); }
const weekOf = () => plan2().time?.week || Object.fromEntries(WEEK.map(d => [d, S.prefs.study.tandaMin]));
const weekTotal = w => WEEK.reduce((a, d) => a + (Number(w[d]) || 0), 0);
export const pauseOn = (k = dayKey()) => { const p = plan2().time?.pause; return p && isDay(p.from) && isDay(p.to) && p.from <= k && k <= p.to ? p : null; };

/* ===================== Tu tiempo ===================== */
export function renderPlanTime() {
  const w = weekOf(), t = dayKey();
  const rows = WEEK.map((d, i) => {
    const m = Number(w[d]) || 0;
    return `<li class="p2-wd"><label for="p2w-${d}">${cap(WEEK_NAMES[i])}</label>
      <input type="range" id="p2w-${d}" min="0" max="180" step="5" value="${m}" style="--p:${(m / 180) * 100}%" data-p2="week" data-day="${d}" aria-valuetext="${m ? `${m} minutos` : 'libre'}">
      <output for="p2w-${d}">${m ? `${m} min` : 'libre'}</output></li>`;
  }).join('');
  const sp = live(plan2().time?.special).filter(s => isDay(s.to) && s.to >= t).sort((a, b) => a.from.localeCompare(b.from));
  const pause = plan2().time?.pause, pauseLive = pause && isDay(pause.to) && pause.to >= t;
  main.innerHTML = `<div class="pl-page p2-time">
    <div class="crumbs-row"><button class="back-round" data-nav="plan" aria-label="Volver al plan">${icon('chevron-left', { size: 22 })}</button><h1>Tu tiempo</h1></div>
    <p class="p2-lead">Lo único que el plan necesita saber de ti. Con esto calcula cuántas nuevas caben cada día, después de los repasos.</p>
    <ul class="p2-week" aria-label="Minutos de cada día">${rows}</ul>
    <p class="muted" id="p2WeekTotal">${fmtMin(weekTotal(w))} a la semana</p>
    <section class="pl-sec" aria-labelledby="h-p2sp"><div class="section-h"><h2 id="h-p2sp">Días especiales</h2></div>
      ${sp.map(s => `<button type="button" class="p2-sp" data-p2="special" data-id="${esc(s.id)}">${icon('sun', { size: 18 })}<span><b>${esc(s.label || 'Días especiales')}</b><small>${range(s.from, s.to)} · ${s.minutes ? `${s.minutes} min` : 'libre'}</small></span>${icon('pencil', { size: 16 })}</button>`).join('')}
      <button type="button" class="link p2-add" data-p2="special">${icon('plus', { size: 16 })} Añadir vacaciones o un día con menos tiempo</button>
      ${pauseLive ? `<p class="p2-pause">${icon('timer', { size: 16 })} <span>En pausa ${pause.from <= t ? `hasta el ${longDay(pause.to)}` : `del ${range(pause.from, pause.to)}`}. <button class="link" data-p2="unpause">Quitar la pausa</button></span></p>`
        : `<button type="button" class="link p2-add" data-p2="pause">${icon('timer', { size: 16 })} Pausar unos días</button>`}
    </section>
    <section class="pl-sec" aria-labelledby="h-p2cunde">${cundeHTML()}</section></div>`;
}
// «Cuánto te cunde»: tu ritmo y lo que da de sí un día normal, con las cuentas del motor
function cundeHTML() {
  const fc = forecastNow(), { secNew, secReview, measured } = fc.pace;
  // El mismo cálculo que la tanda de Hoy: el día de hoy si tiene minutos (lo que da el día entero, como al empezarlo);
  // si es libre, el próximo con tiempo
  const day = fc.days.find(d => d.minutes > 0);
  return `<div class="section-h"><h2 id="h-p2cunde">Cuánto te cunde</h2><span class="sec-note">${measured ? 'medido' : 'por ahora, lo normal'}</span></div>
    <div class="p2-cunde"><div class="p2-tiles"><div><b class="hand">${secNew} s</b><span>una pregunta nueva, con sus primeras vueltas</span></div><div><b class="hand">${secReview} s</b><span>un repaso</span></div></div>
    <p id="p2Cunde">${measured ? 'Medido en tus últimas 300 respuestas.' : 'Aún tienes pocas respuestas: hasta tener 50, cuenta 40 s y 12 s.'}${day ? ` Un día de ${day.minutes} min da para unos <b>${plural(day.reviews, 'repaso', 'repasos')} y ${plural(day.new, 'nueva', 'nuevas')}</b>.` : ''} Cuando hay más repasos, entran menos nuevas: el plan ya lo tiene en cuenta.</p></div>`;
}
// Mientras se arrastra, solo cambia el número; al soltar, se guarda
export function p2Input(el) {
  if (el.dataset.p2 !== 'week') return;
  const m = Number(el.value) || 0, out = el.parentElement.querySelector('output');
  if (out) out.textContent = m ? `${m} min` : 'libre';
  el.setAttribute('aria-valuetext', m ? `${m} minutos` : 'libre');
  el.style.setProperty('--p', `${(m / 180) * 100}%`);
  const w = { ...weekOf(), [el.dataset.day]: m }, tot = document.getElementById('p2WeekTotal');
  if (tot) tot.textContent = `${fmtMin(weekTotal(w))} a la semana`;
}
function setWeek(d, m) {
  T().week = { ...weekOf(), [d]: Math.max(0, Math.min(600, m)) };
  saved();
}

/* ---------------- días especiales y pausa ---------------- */
const SP_MIN = [0, 5, 10, 15, 20, 30, 45, 60, 90];
function specialSheet(id) {
  const t = dayKey(), s = (id && live(plan2().time?.special).find(x => x.id === id)) || { from: t, to: addDays(t, 6), minutes: 0, label: '' };
  openSheet(`<h2 class="sheet-hand">${id ? 'Días especiales' : 'Vacaciones o menos tiempo'}</h2>
    <p class="muted">Unos días con otros minutos. Con «libre» no te toca nada.</p>
    <label for="spLabel">Nombre</label><input id="spLabel" maxlength="40" placeholder="Ej.: Navidad" value="${esc(s.label || '')}">
    <div class="pl-dates"><label>Desde<input type="date" id="spFrom" value="${s.from}"></label><label>Hasta<input type="date" id="spTo" value="${s.to}"></label></div>
    <label for="spMin">Minutos esos días</label><select id="spMin">${SP_MIN.map(m => `<option value="${m}" ${m === Number(s.minutes) ? 'selected' : ''}>${m ? `${m} min` : 'Libre'}</option>`).join('')}</select>
    <div class="btnrow">${id ? `<button class="ghost danger" data-p2="special-del" data-id="${esc(id)}">Borrar</button>` : ''}<span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-p2="special-save" data-id="${esc(id || '')}">Guardar</button></div>`);
}
function saveSpecial(id) {
  const from = document.getElementById('spFrom').value, to = document.getElementById('spTo').value;
  if (!isDay(from) || !isDay(to)) return toast('Pon las dos fechas');
  const [a, b] = [from, to].sort(), list = T().special || (T().special = []);
  const item = touch({ id: id || newId(), from: a, to: b, minutes: Number(document.getElementById('spMin').value) || 0, label: document.getElementById('spLabel').value.trim().slice(0, 40) });
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
  closeSheet(); saved();
}
function deleteSpecial(id) {
  const list = T().special || [], i = list.findIndex(x => x.id === id);
  if (i >= 0) list[i] = touch({ id, deleted: true });
  closeSheet(); saved();
}
function pauseSheet() {
  const t = dayKey();
  openSheet(`<h2 class="sheet-hand">Pausar unos días</h2>
    <p class="muted">Para cuando no puedes (una mudanza, unos días malos…). Mientras dure no te toca nada, ni nuevas ni repasos, y el plan se recoloca solo: lo que se junte se hace a la vuelta, poco a poco.</p>
    <div class="pl-dates"><label>Desde<input type="date" id="psFrom" value="${t}"></label><label>Hasta<input type="date" id="psTo" value="${addDays(t, 2)}"></label></div>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-p2="pause-save">Pausar</button></div>`);
}
function savePause() {
  const from = document.getElementById('psFrom').value, to = document.getElementById('psTo').value;
  if (!isDay(from) || !isDay(to)) return toast('Pon las dos fechas');
  const [a, b] = [from, to].sort();
  T().pause = { from: a, to: b };
  closeSheet(); saved();
  toast(`En pausa hasta el ${longDay(b)}`);
}

/* ---------------- «Hoy solo tengo…» ---------------- */
const TODAY_MIN = [5, 10, 15, 20, 30, 45, 60];
function usualToday() { const p = plan2(), w = p.time?.week; return w ? Number(w[WEEK[weekdayOf(dayKey())]]) || 0 : S.prefs.study.tandaMin; }
function todaySheet() {
  const cur = minutesToday() ?? S.prefs.study.tandaMin, usual = usualToday();
  openSheet(`<h2 class="sheet-hand">¿Cuánto tienes hoy?</h2>
    <p class="muted">Cambia solo hoy: tu semana sigue igual. Si no caben todos los repasos, lo que quede pasa a mañana.</p>
    <div class="pw-opts" role="group" aria-label="Minutos de hoy">${TODAY_MIN.map(m => `<button type="button" class="pw-opt" data-p2="today-set" data-min="${m}" aria-pressed="${m === cur}">${m} min</button>`).join('')}</div>
    <button type="button" class="link" data-p2="today-reset">Lo de siempre${usual ? ` (${usual} min)` : ' (libre)'}</button>`);
}
function setToday(m) {
  const t = T();
  if (m == null) t.today = null; else t.today = { day: dayKey(), minutes: m };
  closeSheet(); saved();
  toast(m == null ? 'Hoy, lo de siempre' : `Hoy, ${m} min`);
}

export function p2Click(b) {
  const ds = b.dataset;
  switch (ds.p2) {
    case 'week': return setWeek(ds.day, Number(b.value) || 0);
    case 'special': return specialSheet(ds.id);
    case 'special-save': return saveSpecial(ds.id);
    case 'special-del': return deleteSpecial(ds.id);
    case 'pause': return pauseSheet();
    case 'pause-save': return savePause();
    case 'unpause': T().pause = null; saved(); return toast('Sin pausa');
    case 'today-min': return todaySheet();
    case 'today-set': return setToday(Number(ds.min));
    case 'today-reset': return setToday(null);
    case 'time': return go('planTime');
  }
}

/* ===================== Hoy con el plan nuevo ===================== */
// La tanda de hoy: el tema principal, la barra (nuevas de cada examen y repasos) y «Empezar · N min»
export function heroHTML({ hi, back }) {
  const t = todayPlan(), fc = forecastNow(), k = dayKey(), pause = pauseOn(k);
  const examOf = id => fc.exams.filter(e => e.date >= k).find(e => e.topics.some(x => x.id === id && x.state === 'study'));
  const groups = new Map();
  for (const [id, n] of Object.entries(t.newBy)) { const e = examOf(id), key = e ? e.name : ''; groups.set(key, (groups.get(key) || 0) + n); }
  const main_ = Object.entries(t.newBy).sort((a, b) => b[1] - a[1])[0];
  if (pause) {
    return `<h1 class="hero-hi hero-done">Estás en pausa</h1><p class="day-next">Hasta el ${longDay(pause.to)} no te toca nada. A la vuelta, el plan se recoloca solo. <button class="link" data-p2="unpause">Volver ya</button></p>`;
  }
  if (t.rest) {
    const next = fc.days.find((d, i) => i > 0 && d.minutes > 0);
    const opt = t.reviews ? `Hoy tocan <b class="p2-n">${plural(t.reviews, 'repaso', 'repasos')}</b>. Si te apetece, 10 min de repasos adelantan el ${next ? WEEK_NAMES[weekdayOf(next.day)] : 'próximo día'}. Si no, nada que hacer. <button class="link day-rest" data-act="tanda-short">Estudiar 10 min</button>` : 'No te toca nada. Mañana seguimos.';
    return `<h1 class="hero-hi hero-done">Hoy es tu día libre</h1><p class="day-next">${opt}</p>
      <button class="link p2-min" data-p2="today-min">${icon('pencil', { size: 15 })} Hoy sí tengo un rato</button>`;
  }
  if (!t.total) {
    return `<h1 class="hero-hi hero-done">${hi}, estás al día</h1><p class="muted">Hoy no te queda nada. Vuelve mañana.</p>`;
  }
  const total = Math.max(1, t.total), mins = Math.max(1, Math.min(t.minutes, Math.ceil(Math.min(t.secs, t.minutes * 60) / 60)));
  const segs = [...groups].map(([, n], i) => `<i class="p2-seg p2-s${Math.min(i, 2)}" style="width:${(100 * n) / total}%"></i>`).join('') + (t.reviews ? `<i class="p2-seg p2-sr" style="width:${(100 * t.reviews) / total}%"></i>` : '');
  const legend = [...[...groups].map(([name, n], i) => `<span><i class="p2-s${Math.min(i, 2)}"></i>${i ? n : plural(n, 'nueva', 'nuevas')}${name ? ` de ${esc(shortName(name))}` : ''}</span>`),
    t.reviews ? `<span><i class="p2-sr"></i>${plural(t.reviews, 'repaso', 'repasos')}</span>` : ''].join('');
  const title = main_ ? S.decks.get(main_[0])?.name || 'Tus nuevas' : 'Tus repasos';
  const changed = plan2().time?.today?.day === k;
  return `<div class="p2-tanda"><small>${back ? `${hi}. ` : ''}Tu tanda de hoy · ${t.minutes} min</small>
      <h1 class="p2-topic">${esc(title)}</h1>
      <div class="p2-bar" aria-hidden="true">${segs}</div>
      <div class="p2-legend">${legend}</div>
      <button class="p2-go" data-act="tanda-short">Empezar · ${mins} min</button></div>
    ${t.short ? `<p class="p2-short">Hoy tienes ${plural(t.reviews, 'repaso', 'repasos')} y ${t.minutes} min: caben ${t.reviewsFit}. Lo que quede pasa a mañana.</p>` : ''}
    <p class="p2-less">${changed ? `Hoy, ${t.minutes} min. <button class="link" data-p2="today-reset">Volver a lo de siempre</button>` : `¿Hoy tienes menos tiempo? <button class="link" data-p2="today-min">Hoy solo tengo…</button>`}</p>`;
}
const shortName = s => s.replace(/\s*[·(].*$/, '').replace(/\s+[A-C][12]$|\s+N[1-5]$/, '').split(' ')[0] || s;
// El examen más cercano, con lo que dice el motor: «Auxiliar · llegas · acabas el temario el 23 nov · faltan 80 días»
export function examCardHTML() {
  const k = dayKey(), e = forecastNow().exams.filter(x => x.date && x.date >= k).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!e) return '';
  const d = dd(e.date), days = daysBetween(k, e.date);
  const say = e.verdict === 'no' ? `así no llegas · te faltarían ${e.left}` : e.finish ? `acabas el temario el ${shortDay(e.finish)}` : 'ya lo has visto todo: a repasar';
  return `<button class="p2-exam" data-nav="plan"><span class="hoy-cal" aria-hidden="true"><i></i><b>${d.d}</b></span>
    <span><b>${esc(shortName(e.name))} · ${e.verdict === 'no' ? 'no llegas' : e.verdict === 'justo' ? 'llegas justo' : 'llegas'}</b><small>${say} · ${days === 0 ? 'es hoy' : days === 1 ? 'falta 1 día' : `faltan ${days} días`}</small></span>${icon('chevron-right', { size: 18 })}</button>`;
}
// «Por qué esta pregunta» (al mantenerla pulsada en la tanda)
export function whyCard(c) {
  const p = S.progress.get(c.id), k = dayKey(), deck = S.decks.get(c.deck_id)?.name || 'una lista';
  if (!p) {
    const e = forecastNow().exams.find(x => x.topics.some(t => t.id === c.deck_id && t.state === 'study'));
    return `Es nueva de ${deck}${e ? `, para ${shortName(e.name)}` : ''}`;
  }
  if (p.last >= new Date(k + 'T00:00:00').getTime() && p.interval === 0) return 'La has fallado hace un rato: vuelve hoy';
  const late = Math.floor((Date.now() - p.due) / 864e5);
  return late >= 1 ? `Toca repasarla: lleva ${plural(late, 'día', 'días')} esperando` : 'Toca repasarla hoy';
}
