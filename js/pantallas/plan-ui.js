// Flaski · plan de estudio: las piezas que comparten sus pantallas. La barra de un examen (temario por ver,
// repaso y última semana sobre el tiempo que queda, con «acabas el…»), la fila de la semana, el grupo de
// deslizadores que suma 100, la franja «Así quedaría» y la tarjeta de un arreglo. Las cuentas son del motor.
import { WEEK, WEEK_SHORT, WEEK_NAMES, dayKey, addDays, daysBetween, weekdayOf, isDay, live } from '../plan.js';
import { S, esc } from '../comun.js';
import { plan2, forecastNow, stateNow } from '../plan2-app.js';
import { whatIf, liveExams } from '../plan2.js';
import { plural } from './mazos.js';
import { fmtMin } from './plan-tiempo.js';

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ymd = k => { const [y, m, d] = k.split('-').map(Number); return { y, m: m - 1, d }; };
export const shortDay = k => (isDay(k) ? `${ymd(k).d} ${MONTHS[ymd(k).m]}` : '');
export const longDay = k => (isDay(k) ? `${ymd(k).d} de ${MONTHS_LONG[ymd(k).m]}` : '');
export const dayName = k => WEEK_NAMES[weekdayOf(k)];
export const rangeDay = (a, b) => (!a ? '' : a === b || !b ? shortDay(a) : ymd(a).m === ymd(b).m ? `${ymd(a).d} – ${shortDay(b)}` : `${shortDay(a)} – ${shortDay(b)}`);
// «Auxiliar Administrativo» → «Auxiliar»; «Inglés B2» → «Inglés»
export const shortName = s => String(s || '').replace(/\s*[·(].*$/, '').replace(/\s+[A-C][12]$|\s+N[1-5]$/, '').split(' ')[0] || s;
// «T3 · Cortes Generales» → «T3»; si no, las dos primeras letras
export const topicTag = name => { const m = /^(\S{1,4})\s*·/.exec(name || ''); return m ? m[1] : String(name || '?').slice(0, 2).toUpperCase(); };
export const topicName = name => String(name || '').replace(/^\S{1,4}\s*·\s*/, '') || name;
export const deckName = id => S.decks.get(id)?.name || 'Lista';
const left = (k, t) => { const d = daysBetween(t, k); return d === 0 ? 'es hoy' : d === 1 ? 'falta 1 día' : d < 0 ? `fue hace ${plural(-d, 'día', 'días')}` : `faltan ${d} días`; };
export const daysLeft = (k, t = dayKey()) => left(k, t);
export const VERDICT = { llegas: 'llegas', justo: 'llegas justo', no: 'no llegas' };

export const calIcon = (k, size = 22) => `<svg class="cal-ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" fill="var(--bg)" stroke="currentColor" stroke-width="1.6"/><path d="M3 9.5h18V7.5a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 7.5z" fill="#FF9F92" stroke="currentColor" stroke-width="1.6"/><path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><text x="12" y="18.6" text-anchor="middle" font-size="8.5" font-family="var(--font-hand)" fill="currentColor">${isDay(k) ? ymd(k).d : ''}</text></svg>`;

/* ---------------- la barra de un examen ---------------- */
// De hoy al examen: temario por ver (rayado), repaso (verde) y última semana (crema), con la marca «acabas el…»
export function examBarHTML(e, { labels = true, t = dayKey() } = {}) {
  if (!e?.date) return '';
  const total = Math.max(1, daysBetween(t, e.date)), at = k => Math.max(0, Math.min(100, (daysBetween(t, k) / total) * 100));
  const lw = e.phases?.lastWeek, fin = e.verdict === 'no' ? null : e.finish;
  const endT = fin ? at(addDays(fin, 1)) : e.verdict === 'no' ? 100 : 0, lwFrom = lw ? at(lw[0]) : 100;
  const temario = e.start > 0 ? Math.min(endT, lwFrom) : 0;
  const segs = `<i class="pb-t${e.verdict === 'no' ? ' late' : ''}" style="width:${temario}%"></i><i class="pb-r" style="width:${Math.max(0, lwFrom - temario)}%"></i>${lw ? `<i class="pb-l" style="width:${100 - lwFrom}%"></i>` : ''}`;
  const mark = fin && e.start > 0 ? `<b class="pb-mark" style="left:${endT}%"></b>` : '';
  // (todo en <span>: la barra va a menudo dentro de un botón, y en Safari un <div> en columna no se estira)
  const label = !labels ? '' : `<span class="pb-lab"><span class="pb-hoy">hoy</span>${fin && e.start > 0 ? `<span class="pb-fin" style="left:${endT}%">acabas el ${shortDay(fin)}</span>` : ''}<span class="pb-date">${shortDay(e.date)}</span></span>`;
  return `<span class="pb" role="img" aria-label="${esc(barText(e))}"><span class="pb-bar">${segs}${mark}</span>${label}</span>`;
}
// Las etiquetas de la barra nunca se montan: si «acabas el …» toca «hoy» o la fecha del examen, va en su propia línea
// (sin salirse por los lados). Se mira al pintarse cada barra
export function fitBarLabels(root = document) {
  for (const lab of root.querySelectorAll('.pb-lab')) {
    const fin = lab.querySelector('.pb-fin');
    if (!fin) continue;
    lab.classList.remove('pb-apart'); fin.style.removeProperty('--pb-x');
    const L = lab.getBoundingClientRect();
    if (!L.width) continue;
    const f = fin.getBoundingClientRect(), h = lab.querySelector('.pb-hoy').getBoundingClientRect(), d = lab.querySelector('.pb-date').getBoundingClientRect();
    if (f.left >= h.right + 6 && f.right <= d.left - 6) continue;
    const x = Math.max(0, Math.min(L.width - f.width, f.left - L.left));
    lab.classList.add('pb-apart');
    fin.style.setProperty('--pb-x', `${Math.round(x)}px`);
  }
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  let raf = 0;
  new MutationObserver(() => { if (!raf && document.querySelector('.pb-lab .pb-fin')) raf = requestAnimationFrame(() => { raf = 0; fitBarLabels(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', () => fitBarLabels());
}
export function barText(e) {
  if (e.verdict === 'no') return `No llegas: al ${shortDay(e.date)} te quedarían ${e.left} sin ver`;
  if (!e.start) return `Ya lo has visto todo: hasta el ${shortDay(e.date)}, repaso`;
  return `Acabas el temario el ${shortDay(e.finish)}; repaso hasta el ${shortDay(e.date)}`;
}
export const legendHTML = () => '<p class="pb-legend"><span><i class="pb-t"></i>temario por ver</span><span><i class="pb-r"></i>repaso</span><span><i class="pb-l"></i>última semana</span></p>';

/* ---------------- las nuevas de un día, por grupos ---------------- */
// Cada examen (sus temas) y lo que no tiene examen («tus listas»), del que más nuevas da al que menos; en cada
// grupo, sus listas igual. g.label: «de Auxiliar», «de Japonés» (una lista suelta) o «de 5 listas»
export function newGroups(newBy, fc, k = dayKey()) {
  const exams = fc.exams.filter(e => !e.date || e.date >= k), out = new Map();
  for (const [id, n] of Object.entries(newBy || {})) {
    if (!(n > 0)) continue;
    const e = exams.find(x => x.topics.some(t => t.id === id && t.state === 'study'));
    const key = e ? e.id : 'free';
    if (!out.has(key)) out.set(key, { key, exam: e || null, n: 0, decks: [] });
    const g = out.get(key); g.n += n; g.decks.push([id, n]);
  }
  const gs = [...out.values()].sort((a, b) => b.n - a.n);
  for (const g of gs) {
    g.decks.sort((a, b) => b[1] - a[1]);
    g.name = g.exam ? shortName(g.exam.name) : g.decks.length === 1 ? deckName(g.decks[0][0]) : 'Tus listas';
    g.label = g.exam ? `de ${shortName(g.exam.name)}` : g.decks.length === 1 ? `de ${deckName(g.decks[0][0])}` : `de ${g.decks.length} listas`;
  }
  return gs;
}
// La etiqueta de un día de la semana: el tema que se lleva más de la mitad (y el siguiente del mismo examen si se
// lleva un cuarto, como «T3·T4»), o dos temas del mismo examen a la par; si se reparte entre varias listas, nada
export function dayTags(d, fc) {
  if (!d.new) return [];
  const gs = newGroups(d.newBy, fc, d.day), all = gs.flatMap(g => g.decks.map(([id, n]) => ({ id, n, g }))).sort((a, b) => b.n - a.n);
  const top = all[0], tag = x => topicTag(deckName(x.id));
  if (top.n > d.new / 2) {
    const next = all.find(x => x !== top && x.g === top.g && top.g.exam && x.n >= d.new / 4);
    return next ? [tag(top), tag(next)] : [tag(top)];
  }
  if (gs.length === 1 && gs[0].exam) return all.filter(x => x.n >= d.new / 4).slice(0, 2).map(tag);
  return [];
}

/* ---------------- la fila de la semana ---------------- */
// Los próximos 7 días (desde hoy) con sus minutos y el tema que toca; al tocar un día, Tu tiempo
export function weekRowHTML(fc = forecastNow()) {
  const t = dayKey(), days = fc.days.slice(0, 7);
  const tiles = days.map((d, i) => {
    const tags = dayTags(d, fc);
    const free = !d.minutes;
    return `<button type="button" class="p2-day${free ? ' free' : ''}${i === 0 ? ' now' : ''}" data-p2="time" aria-label="${dayName(d.day)}: ${free ? 'libre' : `${d.minutes} minutos`}${tags.length ? `, ${tags.join(' y ')}` : ''}">
      <small>${WEEK_SHORT[weekdayOf(d.day)]}</small><b>${free ? '·' : d.minutes}</b><small>${free ? 'libre' : 'min'}</small><em>${esc([...new Set(tags)].join('·'))}</em></button>`;
  }).join('');
  const w = plan2().time?.week, total = w ? WEEK.reduce((a, d) => a + (Number(w[d]) || 0), 0) : 0;
  const nNew = days.reduce((a, d) => a + d.new, 0), nRev = days.reduce((a, d) => a + d.reviews, 0);
  const sp = live(plan2().time?.special).filter(s => isDay(s.to) && s.to >= t).sort((a, b) => a.from.localeCompare(b.from))[0];
  return { total, html: `<div class="p2-week7">${tiles}</div>`, note: `Unas ${plural(nNew, 'nueva', 'nuevas')} y ${plural(nRev, 'repaso', 'repasos')}. Toca un día para cambiar sus minutos.${sp ? ` <b>${rangeDay(sp.from, sp.to)} · ${esc(sp.label || 'días especiales')}, ${sp.minutes ? `${sp.minutes} min` : 'libre'}.</b>` : ''}` };
}
export const weekTotalText = total => (total ? fmtMin(total) : '');

/* ---------------- deslizadores que suman 100 ---------------- */
// Mover uno: los demás se reparten lo que sobra en proporción a lo que tenían (si todos estaban a 0, a partes
// iguales). Enteros, siempre suman 100.
export function rebalance(values, id, v) {
  const ids = Object.keys(values), others = ids.filter(x => x !== id);
  const out = { [id]: Math.max(0, Math.min(100, Math.round(v))) };
  if (!others.length) return { [id]: 100 };
  const rest = 100 - out[id], sum = others.reduce((a, x) => a + (Number(values[x]) || 0), 0);
  let given = 0;
  others.forEach((x, i) => {
    const share = sum > 0 ? ((Number(values[x]) || 0) / sum) * rest : rest / others.length;
    const n = i === others.length - 1 ? rest - given : Math.round(share);
    out[x] = Math.max(0, n); given += out[x];
  });
  // Si el redondeo se pasa, se quita del más grande de los demás
  let diff = ids.reduce((a, x) => a + out[x], 0) - 100;
  for (const x of [...others].sort((a, b) => out[b] - out[a])) { if (!diff) break; const k = Math.min(out[x], diff); out[x] -= k; diff -= k; }
  return out;
}
// group: nombre del grupo; items: [{ id, label, sub, value }]
export function slidersHTML(group, items) {
  return `<div class="p2-sl" data-group="${esc(group)}">${items.map(it => `<div class="p2-sl-row">
    <div class="p2-sl-h"><span><b>${esc(it.label)}</b>${it.sub ? `<small data-sub="${esc(it.id)}">${it.sub}</small>` : ''}</span><output class="hand" data-out="${esc(it.id)}">${it.value} %</output></div>
    <input type="range" min="0" max="100" step="5" value="${it.value}" style="--p:${it.value}%" data-p2="share" data-group="${esc(group)}" data-id="${esc(it.id)}" aria-label="${esc(it.label)}" aria-valuetext="${it.value} %"></div>`).join('')}</div>`;
}
export const shareBarHTML = values => `<div class="p2-share">${Object.entries(values).map(([id, v], i) => `<i class="p2-sh${Math.min(i, 3)}" style="width:${v}%" data-bar="${esc(id)}"></i>`).join('')}</div>`;
// Pinta los valores nuevos del grupo (deslizadores, números y barra) sin repintar la hoja
export function paintShares(root, group, values) {
  for (const [id, v] of Object.entries(values)) {
    const inp = root.querySelector(`input[data-group="${CSS.escape(group)}"][data-id="${CSS.escape(id)}"]`);
    if (inp) { inp.value = v; inp.style.setProperty('--p', `${v}%`); inp.setAttribute('aria-valuetext', `${v} %`); }
    const out = root.querySelector(`[data-group="${CSS.escape(group)}"] [data-out="${CSS.escape(id)}"]`);
    if (out) out.textContent = `${v} %`;
    const bar = root.querySelector(`[data-sharebar="${CSS.escape(group)}"] [data-bar="${CSS.escape(id)}"]`);
    if (bar) bar.style.width = `${v}%`;
  }
}

/* ---------------- «Así quedaría» ---------------- */
// Compara las fechas de cada examen de ahora con las que salen con un cambio
// auto: «Así sigues llegando» si se llega a todos; si no, «Así quedaría»
export function compareHTML(before, after, { title = 'Así quedaría', auto = false } = {}) {
  const rows = after.exams.filter(e => e.date && e.date >= dayKey()).map(e => {
    const b = before.exams.find(x => x.id === e.id);
    const now = e.verdict === 'no' ? `no llegas (te faltarían ${e.left})` : e.finish ? `acabas el temario el <b>${shortDay(e.finish)}</b>` : 'ya lo has visto todo';
    const was = !b ? '' : b.verdict === 'no' ? 'antes, no llegabas' : b.finish && b.finish !== e.finish ? `antes, ${shortDay(b.finish)}` : '';
    return `${esc(shortName(e.name))}: ${now}${was ? ` (${was})` : ''}.`;
  });
  const ok = after.exams.every(e => e.verdict !== 'no');
  if (auto) title = ok ? 'Así sigues llegando' : 'Así quedaría';
  return `<div class="p2-asi${ok ? '' : ' late'}" role="status"><b>${title}</b><p>${rows.join(' ') || 'Sin exámenes por delante.'}</p></div>`;
}
// Pide whatIf al motor 150 ms después del último cambio y pinta la franja en el elemento
let asiT = null;
export function asiSoon(el, change, opts) {
  clearTimeout(asiT);
  asiT = setTimeout(() => {
    if (!el?.isConnected) return;
    const st = stateNow(), before = forecastNow(), after = whatIf(st, change);
    el.innerHTML = compareHTML(before, after, opts);
  }, 150);
}
export const asiNow = (change, opts) => compareHTML(forecastNow(), whatIf(stateNow(), change), opts);

/* ---------------- un arreglo ---------------- */
const DAYS_PL = { sat: 'los sábados', sun: 'los domingos' };
const daysText = ds => (ds.length === 5 && !ds.includes('sat') && !ds.includes('sun') ? 'de lunes a viernes' : ds.length >= 6 ? 'los días que estudias' : ds.map(d => WEEK_NAMES[WEEK.indexOf(d)]).join(', '));
// Lo que dice cada palanca: título y explicación
export function leverText(l, exam) {
  const examName = id => shortName(liveExams(plan2()).find(e => e.id === id)?.name || 'el otro examen');
  switch (l.kind) {
    case 'minutes': return [`${l.add} min más ${daysText(l.days)}`, `Tu semana pasa a tener ${fmtMin(l.add * l.days.length)} más.`];
    case 'freeDay': return [`Estudiar ${l.minutes} min ${DAYS_PL[l.day] || `los ${WEEK_NAMES[WEEK.indexOf(l.day)]}`}`, 'Un día que ahora tienes libre.'];
    case 'pauseOther': return [`${examName(l.exam)} en pausa hasta el examen`, `${examName(l.exam)} sigue con sus repasos; no entran nuevas hasta el ${shortDay(addDays(l.until, 1))}.`];
    case 'lastWeek': return ['Quitar la semana de solo repasar', 'Las nuevas siguen entrando hasta el examen.'];
    case 'later': return [`Dejar ${l.topics.map(id => topicTag(deckName(id))).join(' y ')} para después del examen`, `Son ${plural(l.topics.reduce((a, id) => a + (exam?.topics.find(t => t.id === id)?.fresh || 0), 0), 'pregunta', 'preguntas')}. Las ves después, por si hay segunda vuelta.`];
    case 'cap': return [`Subir a ${l.newPerDay} nuevas al día`, `Ahora, como mucho ${l.from} (Ajustes).`];
    case 'date': return [`Mover la fecha al ${shortDay(l.date)}`, 'Tu fecha es aproximada: con unas semanas más, llegas.'];
    default: return [l.kind, ''];
  }
}
export function fixTitle(o, exam) {
  const parts = o.levers.map(l => leverText(l, exam));
  return { title: parts.map(p => p[0]).join(' y ').replace(/^(.)/, c => c.toUpperCase()), text: parts.map(p => p[1]).filter(Boolean).join(' ') };
}
export function fixTag(e) {
  if (!e) return '';
  if (e.verdict === 'justo') return `<span class="p2-tag justo">Llegas justo: acabas el ${shortDay(e.finish)}</span>`;
  return `<span class="p2-tag ok">Llegas: acabas el ${shortDay(e.finish)}</span>`;
}
export function fixCardHTML(o, i, picked, exam) {
  const { title, text } = fixTitle(o, exam);
  return `<button type="button" class="p2-fix" role="radio" aria-checked="${i === picked}" data-p2="fix-pick" data-i="${i}"><span class="fix-dot"></span><span><b>${esc(title)}</b><small>${esc(text)}</small>${fixTag(o.exam)}</span></button>`;
}
