// Flaski · plan de estudio: el domingo en Hoy. «Tu semana» (los días, lo hecho frente a lo previsto y si vas bien),
// el «Simulacro de la semana» con lo que ya has visto (temas acabados, con el formato del examen) y, si vas 2 días o
// más por detrás, el Repaso de la semana a pantalla completa con sus dos opciones: repartir lo que falta en la
// semana que viene o dejarlo así. Lo previsto se guarda el primer día que se abre la app cada semana
// (plan.weekly.snap). Todo se apaga en Ajustes del plan (weekly.on).
import { icon } from '../icons.js';
import { dayKey, weekdayOf, WEEK_SHORT, WEEK_NAMES } from '../plan.js';
import { main, S, esc, hooks } from '../comun.js';
import { forecast, liveExams, weekStart, weekSnap, weekReview, weekRecover } from '../plan2.js';
import { plan2, editPlan2, forecastNow, stateNow, doneToday, lateNow, todayPlan } from '../plan2-app.js';
import { plural } from './mazos.js';
import { savePrefsSoon } from './perfil.js';
import { launch, seenCount } from './simulacro.js';
import { simKey } from './plan-examen.js';
import { boostUntil, setBoost } from './plan-tema.js';
import { deckName, topicTag, shortDay, shortName } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';
import { go, render } from '../app.js';

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDay = k => { const [, m, d] = k.split('-').map(Number); return `${d} de ${MONTHS_LONG[m - 1]}`; };
const SIM_DEFAULT = { n: 40, time: 40, pen: 3, testOnly: true };
const WEAK = 0.6;

const weeklyOn = () => plan2().weekly?.on !== false && liveExams(plan2()).some(e => e.date && e.date >= dayKey());

// Lo previsto de la semana: se guarda la primera vez que se abre la app esa semana
export function keepWeekSnap() {
  if (!weeklyOn()) return;
  const k = dayKey(), w = plan2().weekly;
  if (w?.snap?.week === weekStart(k)) return;
  const p = editPlan2();
  p.weekly = { ...(p.weekly || { on: true }), snap: weekSnap(forecastNow(), doneToday()) };
  savePrefsSoon();
}
// Al cambiar el plan, lo previsto se rehace desde hoy (lo que cambias tú no es ir por detrás)
export function resnapWeek(p) {
  if (!p.weekly?.snap || p.weekly.snap.week !== weekStart(dayKey())) return;
  p.weekly = { ...p.weekly, snap: weekSnap(forecast({ ...stateNow(), plan: p }), doneToday(), p.weekly.snap) };
}
export const reviewNow = () => weekReview({ fc: forecastNow(), plan: plan2(), snap: plan2().weekly?.snap, progress: S.progress, events: S.events, late: lateNow()?.n || 0, fallbackMin: S.prefs.study.tandaMin });
// Hoy es domingo, el Repaso de la semana está encendido y hay lo previsto de antes de hoy (la primera vez que se
// abre la app un domingo no hay semana que mirar)
export function sundayOn() {
  const k = dayKey(), s = plan2().weekly?.snap;
  return weekdayOf(k) === 6 && weeklyOn() && s?.week === weekStart(k) && s.at < k;
}
// Vas 2 días o más por detrás y aún no lo has visto hoy: se abre a pantalla completa
export function weekAuto() {
  if (!sundayOn() || plan2().weekly?.seen === dayKey()) return false;
  return reviewNow().behind >= 2;
}

/* ---------------- Tu semana (Hoy) ---------------- */
const behindText = n => (n ? `vas ${plural(n, 'día', 'días')} por detrás` : 'vas bien');
function examLine(r) {
  const x = r.exam;
  if (!x) return '';
  const name = esc(shortName(x.name));
  if (!x.finish) return x.verdict === 'no' ? `Así no llegas a ${name}.` : '';
  if (r.behind && x.was && x.was !== x.finish) return `Si sigues así, acabas el temario de ${name} el ${shortDay(x.finish)} en vez del ${shortDay(x.was)}.`;
  return `Acabas ${name} el ${shortDay(x.finish)}${x.was === x.finish ? ', como estaba previsto' : ''}.`;
}
const reviewsText = r => (r.late ? plural(r.late, 'repaso atrasado', 'repasos atrasados') : 'repasos al día');
export function weekCardHTML(r = reviewNow()) {
  const tiles = r.days.map(d => {
    const cls = d.studied ? 'on' : !d.planned ? 'free' : d.past ? 'miss' : 'next';
    const say = d.studied ? 'estudiaste' : !d.planned ? 'libre' : d.past ? 'no estudiaste' : 'por hacer';
    return `<span class="p2-wd ${cls}" role="img" aria-label="${WEEK_NAMES[weekdayOf(d.day)]}: ${say}"><i></i><small>${WEEK_SHORT[weekdayOf(d.day)]}</small></span>`;
  }).join('');
  return `<section class="p2-wk" aria-labelledby="h-wk"><div class="p2-wk-h"><h2 class="hand" id="h-wk">Tu semana</h2><em class="p2-pill${r.behind ? ' justo' : ''}">${behindText(r.behind)}</em></div>
    <div class="p2-wdays">${tiles}</div>
    <p>${r.studied} de ${plural(r.planned, 'día', 'días')}${r.newPlanned ? ` · ${r.newDone} de ${plural(r.newPlanned, 'nueva', 'nuevas')}` : ''} · ${reviewsText(r)}. ${examLine(r)}
    <button class="link" data-p2="week-open">Ver la semana</button></p></section>`;
}

/* ---------------- Simulacro de la semana ---------------- */
// Lo que ya has visto del examen más cercano (de los temas empezados o acabados, las vistas), con el formato de su simulacro
function weekSim() {
  const k = dayKey(), e = forecastNow().exams.filter(x => x.date && x.date >= k).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!e) return null;
  const ex = liveExams(plan2()).find(x => x.id === e.id), key = simKey(ex);
  const done = e.topics.filter(t => t.state === 'known' || t.total > t.fresh).map(t => t.id).filter(id => S.decks.has(id));
  if (!done.length) return null;
  const f = { ...SIM_DEFAULT, ...(plan2().sim?.[key] || {}) };
  // Sin preguntas de test, también las de dar la vuelta
  let have = seenCount(done, f.testOnly);
  if (have < 5 && f.testOnly) { f.testOnly = false; have = seenCount(done, false); }
  if (have < 5) return null;
  return { examId: e.id, key, name: shortName(e.name), decks: done, n: Math.min(f.n, have), time: f.time, pen: f.pen, testOnly: f.testOnly };
}
const fmtText = s => [s.testOnly ? 'tipo test' : null, s.time ? `${s.time} min` : 'sin reloj', s.pen ? 'las mal restan' : null].filter(Boolean).join(', ');
export function weekSimHTML(primary) {
  const s = weekSim();
  if (!s) return '';
  const tags = s.decks.map(id => topicTag(deckName(id))), what = tags.length > 1 ? `de ${tags[0]} a ${tags.at(-1)}` : `de ${tags[0]}`;
  return `<section class="p2-wsim${primary ? ' main' : ''}" aria-labelledby="h-wsim"><small id="h-wsim">${icon('flag', { size: 18 })} Simulacro de la semana · opcional</small>
    <h2 class="hand">${plural(s.n, 'pregunta', 'preguntas')} ${esc(what)}</h2>
    <p>Lo que ya has visto, con el formato de tu examen: ${fmtText(s)}. Sirve para ver qué se te ha quedado.</p>
    <button class="${primary ? 'p2-go' : 'ghost big'}" data-p2="week-sim">Hacer el simulacro${s.time ? ` · ${s.time} min` : ''}</button></section>`;
}
function startWeekSim() {
  const s = weekSim();
  if (s) launch({ exam: s.key, decks: s.decks, n: s.n, time: s.time, pen: s.pen, testOnly: s.testOnly, name: `${s.name} · semana`, examId: s.examId });
}

// El domingo en Hoy. Día libre: la semana y el simulacro como única propuesta (opcional). Si estudias: la tanda
// primero y debajo la semana y el simulacro como segunda opción
export function sundayFreeHTML(late = '') {
  const t = forecastNow().days.find((d, i) => i > 0 && d.minutes > 0), n = todayPlan().reviews;
  return `${weekCardHTML()}${weekSimHTML(true)}
    <p class="p2-sunfree">${n ? `Hoy es tu día libre. Tocan ${plural(n, 'repaso', 'repasos')}: si te apetece, <button class="link" data-act="tanda-short">10 min de repasos</button> adelantan el ${t ? WEEK_NAMES[weekdayOf(t.day)] : 'próximo día'}; si no, pasan a mañana.` : 'Hoy es tu día libre: no te toca nada.'}</p>
    <button class="link p2-min" data-p2="today-min">${icon('pencil', { size: 15 })} Hoy sí tengo un rato</button>${late}`;
}
export const sundayStudyHTML = () => `${weekCardHTML()}${weekSimHTML(false)}`;

/* ---------------- Repaso de la semana (pantalla completa) ---------------- */
const bar = (label, a, b) => `<div class="p2-wbar"><div><b>${label}</b><span>${a} de ${b}</span></div><i style="--w:${b ? Math.min(100, (100 * a) / b) : 100}%"></i></div>`;
function missedText(r) {
  const miss = r.days.filter(d => d.past && d.planned && !d.studied).map(d => WEEK_NAMES[weekdayOf(d.day)]);
  const days = !miss.length ? '' : miss.length === 1 ? `El ${miss[0]} no estudiaste. ` : `El ${miss.slice(0, -1).join(', el ')} y el ${miss.at(-1)} no estudiaste. `;
  return `${days}${r.late ? `Tienes ${plural(r.late, 'repaso atrasado', 'repasos atrasados')}.` : 'Repasos, al día.'}`;
}
// «de lunes a sábado» o «el lunes, el miércoles y el viernes»
function daysText(ks) {
  const w = ks.map(weekdayOf), run = w.every((x, i) => !i || x === w[i - 1] + 1);
  if (ks.length > 2 && run) return `de ${WEEK_NAMES[w[0]]} a ${WEEK_NAMES[w.at(-1)]}`;
  const n = w.map(x => `el ${WEEK_NAMES[x]}`);
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} y ${n.at(-1)}`;
}
function recoverNow(r) {
  const rec = weekRecover(plan2(), r, forecastNow().pace, dayKey());
  if (!rec) return null;
  const p = { ...plan2(), time: { ...plan2().time, special: [...(plan2().time?.special || []), ...rec.special] } };
  const e = forecast({ ...stateNow(), plan: p }).exams.find(x => x.id === r.exam?.id);
  return { ...rec, finish: e?.finish || null, verdict: e?.verdict || null };
}
const verdictTag = v => (v === 'no' ? '<em class="p2-tag no">Así no llegas</em>' : v === 'justo' ? '<em class="p2-tag justo">Llegas justo</em>' : '<em class="p2-tag ok">Llegas igual</em>');
export function renderWeek() {
  const r = reviewNow(), k = dayKey(), x = r.exam, rec = r.behind && r.missing ? recoverNow(r) : null;
  const pick = rec ? S.p2Week || 'rec' : 'keep';
  const weeks = x?.review ? Math.floor(x.review / 7) : 0;
  const reach = !x ? '' : x.verdict === 'no' ? 'Así no llegas al examen.' : weeks >= 1 ? `Aún llegas, con ${plural(weeks, 'semana', 'semanas')} de repaso.` : 'Aún llegas, justo.';
  const opt = (id, title, text, tag) => `<button type="button" class="p2-wopt" role="radio" aria-checked="${pick === id}" data-p2="week-pick" data-v="${id}"><i aria-hidden="true"></i><span><b>${title}</b><small>${text}</small>${tag}</span></button>`;
  main.innerHTML = `<div class="pl-page p2-week">
    <div class="crumbs-row"><button class="back-round" data-p2="week-close" aria-label="Cerrar">${icon('x', { size: 22 })}</button><span class="muted">${WEEK_NAMES[weekdayOf(k)]} ${longDay(k)}</span></div>
    <h1 class="hand">Tu semana</h1>
    <section class="p2-wstats">${bar('Días que estudiaste', r.studied, r.planned)}${bar('Nuevas', r.newDone, r.newPlanned)}${bar('Repasos', r.reviewsDone, r.reviewsDone + r.late)}
      <p>${missedText(r)}</p></section>
    ${r.behind ? `<section class="p2-wbehind"><h2 class="hand">Vas ${plural(r.behind, 'día', 'días')} por detrás</h2><p>${examLine(r)} ${reach}</p></section>`
      : `<section class="p2-wok"><h2 class="hand">Vas bien</h2><p>${examLine(r)}</p></section>`}
    ${rec ? `<h2 class="hand p2-h2">¿Lo recuperamos?</h2><div role="radiogroup" aria-label="¿Lo recuperamos?" class="p2-wopts">
      ${opt('rec', `Repartir ${r.missing === 1 ? 'la que falta' : `las ${r.missing} que faltan`} en la semana`, `${plural(rec.perDay, 'nueva', 'nuevas')} más al día, ${daysText(rec.days)} (unos ${rec.more} min más).`, rec.finish ? `<em class="p2-tag ok">Vuelves al ${shortDay(rec.finish)}</em>` : verdictTag(rec.verdict))}
      ${opt('keep', 'Dejarlo así', `El plan se mueve ${plural(r.behind, 'día', 'días')}. No pasa nada.`, verdictTag(x?.verdict))}</div>` : ''}
    <button class="primary big" data-p2="week-done">Hecho</button>
    <p class="muted small p2-wfoot">Sale el domingo al abrir la app. Se puede apagar en Ajustes del plan.</p></div>`;
}
function seen() { const p = editPlan2(); p.weekly = { ...(p.weekly || { on: true }), seen: dayKey() }; savePrefsSoon(); }
function weekDone() {
  const r = reviewNow(), rec = S.p2Week !== 'keep' && r.behind && r.missing ? weekRecover(plan2(), r, forecastNow().pace, dayKey()) : null;
  S.p2Week = null;
  seen();
  if (rec) commitPlan(`Recuperas la semana: ${plural(rec.perDay, 'nueva', 'nuevas')} más al día, ${daysText(rec.days)}`, p => { p.time.special = [...(p.time.special || []), ...rec.special]; }, { redraw: false });
  go('home');
}

/* ---------------- el simulacro: «Refuerza este tema» ---------------- */
// Los temas que han salido flojos (3 preguntas o más y menos del 60 % bien), del examen del plan que los tiene
hooks.simWeak = r => {
  const by = new Map();
  for (const q of r.qs || []) { const d = S.cards.get(q[0])?.deck_id; if (!d) continue; const t = by.get(d) || { o: 0, n: 0 }; t.n++; if (q[3] === 'o') t.o++; by.set(d, t); }
  const k = dayKey(), exams = forecastNow().exams.filter(e => !e.date || e.date >= k);
  const weak = [...by].filter(([, t]) => t.n >= 3 && t.o / t.n < WEAK).sort((a, b) => a[1].o / a[1].n - b[1].o / b[1].n).slice(0, 3)
    .map(([id, t]) => ({ id, t, ex: exams.find(e => e.topics.some(x => x.id === id)) })).filter(w => w.ex);
  if (!weak.length) return '';
  return `<h2 class="sm-h2">Lo que ha salido flojo</h2><ul class="p2-weak">${weak.map(({ id, t, ex }) => {
    const until = boostUntil(ex.id, id);
    return `<li><span><b>${esc(deckName(id))}</b><small>${t.o} de ${t.n} bien</small></span>${until ? `<small>Reforzado hasta el ${shortDay(until)}</small>` : `<button class="ghost" data-p2="week-boost" data-exam="${esc(ex.id)}" data-deck="${esc(id)}">Refuerza este tema</button>`}</li>`;
  }).join('')}</ul>`;
};

export function weekClick(el) {
  const a = el.dataset.p2, ds = el.dataset;
  switch (a) {
    case 'week-open': return go('week');
    case 'week-pick': S.p2Week = ds.v; return render();
    case 'week-done': return weekDone();
    case 'week-close': S.p2Week = null; seen(); return go('home');
    case 'week-sim': return startWeekSim();
    case 'week-boost': return setBoost(ds.exam, ds.deck, true);
  }
}
