// Estadísticas: filtros (periodo, mazos, tipo de tarjeta) y gráficos SVG hechos a mano.
// statsView() calcula los datos y devuelve el HTML; drawStats() pinta los gráficos
// que dependen del ancho de la pantalla. Lo que señalas lo cuenta la cabecera de cada tarjeta (data-tip-*).
import { DAY, startOfDay, dateKey, GRADES } from './srs.js';
import { heatmap, progressSeries, progressView } from './charts.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nf = new Intl.NumberFormat('es-ES');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PERIODS = [{ d: 7, label: '7 días' }, { d: 30, label: '30 días' }, { d: 90, label: '3 meses' }, { d: 365, label: '1 año' }, { d: 0, label: 'Todo' }];

export function fmtDuration(ms) {
  const m = Math.round(ms / 60e3);
  if (m < 1) return ms > 0 ? `${Math.max(1, Math.round(ms / 1e3))} s` : '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')} min`;
}
const dayLabel = t => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

/* ---------------- agrupación por día / semana / mes ---------------- */
function buckets(startT, endT) {
  const days = Math.round((endT - startT) / DAY) + 1;
  const unit = days <= 120 ? 'day' : days <= 900 ? 'week' : 'month';
  const keyOf = t => {
    const d = new Date(startOfDay(t));
    if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (unit === 'month') d.setDate(1);
    return d.getTime();
  };
  const list = [];
  let t = keyOf(startT);
  while (t <= endT) {
    const d = new Date(t);
    const label = unit === 'month' ? `${MONTHS[d.getMonth()]}${d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''}` : dayLabel(t);
    const tip = unit === 'day' ? dayLabel(t) : unit === 'week' ? `Semana del ${dayLabel(t)}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    list.push({ t, label, tip, g: [0, 0, 0, 0], ms: 0, n: 0, ok: 0 });
    if (unit === 'day') t = startOfDay(t + DAY * 1.5);
    else if (unit === 'week') t = startOfDay(t + DAY * 7.5);
    else { const n = new Date(t); n.setMonth(n.getMonth() + 1); t = n.getTime(); }
  }
  const index = new Map(list.map((b, i) => [b.t, i]));
  return { list, unit, find: t => list[index.get(keyOf(t))] };
}

/* ---------------- cálculo de todos los datos ---------------- */
export function computeStats(ctx, f) {
  const now = Date.now(), today = startOfDay(now);
  const deckSet = ctx.deckSet;
  const allScope = f.scope === 'all' && !f.mode;
  const cardOk = c => c && deckSet.has(c.deck_id) && (!f.mode || ctx.modeOf(c) === f.mode);
  const evOk = e => { if (!(e.grade >= 1 && e.grade <= 4) || !Number.isFinite(e.t)) return false; const c = ctx.cards.get(e.card_id); return c ? cardOk(c) : allScope; };
  const scoped = ctx.events.filter(evOk);
  // No se da por hecho que vengan ordenados por fecha
  const first = scoped.length ? startOfDay(scoped.reduce((m, e) => Math.min(m, e.t), Infinity)) : today;
  const start = f.period ? today - (f.period - 1) * DAY : Math.min(first, today - 6 * DAY);
  const evs = scoped.filter(e => e.t >= start);

  // Por fecha
  const B = buckets(start, today);
  const byState = { new: [0, 0, 0, 0], learning: [0, 0, 0, 0], review: [0, 0, 0, 0] };
  const hours = Array.from({ length: 24 }, () => ({ n: 0, ok: 0 }));
  const byDeck = new Map();
  let ms = 0, ok = 0;
  const activeDays = new Set();
  for (const e of evs) {
    const b = B.find(e.t);
    if (b) { b.g[e.grade - 1]++; b.n++; b.ms += e.ms || 0; if (e.grade > 1) b.ok++; }
    const st = e.state === 'relearning' ? 'learning' : byState[e.state] ? e.state : 'review';
    byState[st][e.grade - 1]++;
    const h = new Date(e.t).getHours(); hours[h].n++; if (e.grade > 1) hours[h].ok++;
    if (e.deck_id) { const x = byDeck.get(e.deck_id) || { n: 0, ok: 0, ms: 0 }; x.n++; x.ms += e.ms || 0; if (e.grade > 1) x.ok++; byDeck.set(e.deck_id, x); }
    ms += e.ms || 0; if (e.grade > 1) ok++;
    activeDays.add(dateKey(e.t));
  }
  const periodDays = Math.round((today - start) / DAY) + 1;

  // Tarjetas del filtro (estado actual)
  const cards = [...ctx.cards.values()].filter(cardOk);
  const prog = new Map();
  for (const c of cards) { const p = ctx.progress.get(c.id); if (p) prog.set(c.id, p); }

  // Calendario: con filtros se rehace a partir de las respuestas; sin filtros, el registro diario completo
  let log = ctx.log;
  if (!allScope) { log = {}; for (const e of scoped) { const k = dateKey(e.t); log[k] = (log[k] || 0) + 1; } }

  // Tarjetas más difíciles: más fallos; a igualdad, menor facilidad
  const misses = new Map();
  for (const e of evs) if (e.grade === 1) misses.set(e.card_id, (misses.get(e.card_id) || 0) + 1);
  const hard = cards.filter(c => (prog.get(c.id)?.lapses || 0) > 0 || misses.get(c.id))
    .map(c => ({ c, p: prog.get(c.id), lapses: prog.get(c.id)?.lapses || 0, miss: misses.get(c.id) || 0 }))
    .sort((a, b) => (b.lapses + b.miss) - (a.lapses + a.miss) || (a.p?.ease || 9) - (b.p?.ease || 9));
  const hardN = hard.length;
  hard.length = Math.min(hard.length, 10);

  // Previsión: tarjetas que tocan cada día (hoy incluye las atrasadas)
  const fc = new Array(f.fcDays).fill(0);
  for (const p of prog.values()) { const i = p.due <= now ? 0 : Math.round((startOfDay(p.due) - today) / DAY); if (i >= 0 && i < fc.length) fc[i]++; }

  return { fc, f, B, evs, allEvs: scoped, hardN, deckName: id => (ctx.decks.has(id) ? ctx.deckName(id) : ''), scopedN: scoped.length, ms, ok, activeDays: activeDays.size, periodDays, byState, hours, byDeck, cards, prog, log, hard, start };
}

/* ---------------- HTML de la página (lo que no depende del ancho) ----------------
   Cada tarjeta empieza con su cifra (una etiqueta pequeña, un número grande y una frase) y la cabecera
   cuenta lo que señalas en el gráfico (data-live: ver liveShow en charts.js). Todo en tonos del color del tema. */
const lvHead = (id, label, n, of, sub = '', right = '') => `<div class="lv-h"><h2 class="lv-k" id="st-${id}">${label}<span class="lv-day"></span></h2>${right}</div>
      <div class="lv-big"><b class="lv-n">${n}</b><span class="lv-of">${of}</span></div><p class="lv-sub">${sub}</p>`;
const card = (id, head, body, extra = '') => `<section class="chart-card st-card lv${extra}" data-live aria-labelledby="st-${id}">${head}${body}</section>`;
// Una línea pequeña con la evolución (para las cifras de arriba)
function spark(vals, { bars = false } = {}) {
  const n = vals.length;
  if (n < 2) return '';
  const max = Math.max(1, ...vals.filter(v => v != null));
  const X = i => (i / (n - 1)) * 100, Y = v => 26 - (v / max) * 22;
  if (bars) return `<svg class="kpi-sp" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">${vals.map((v, i) => `<rect class="${i === n - 1 ? 'sp-hi' : 'sp-b'}" x="${(i / n) * 100 + 0.6}" y="${v ? 6 : 24}" width="${Math.max(0.8, 100 / n - 1.2)}" height="${v ? 20 : 2}"></rect>`).join('')}</svg>`;
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)}`; pen = true; });
  return `<svg class="kpi-sp" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path class="sp-l" d="${d}" vector-effect="non-scaling-stroke"></path></svg>`;
}
const fmtDays = d => (d < 1 ? 'menos de un día' : d < 14 ? plural(Math.round(d), 'día', 'días') : d < 60 ? plural(Math.round(d / 7), 'semana', 'semanas') : d < 730 ? plural(Math.round(d / 30), 'mes', 'meses') : plural(Math.round(d / 365), 'año', 'años'));

export function statsView(ctx, f) {
  const D = computeStats(ctx, f);
  const n = D.evs.length;
  const per = D.B.unit === 'day' ? 'al día' : D.B.unit === 'week' ? 'a la semana' : 'al mes';
  const perT = D.B.unit === 'day' ? 'por día' : D.B.unit === 'week' ? 'por semana' : 'por mes';

  const periodBtns = PERIODS.map(p => `<button type="button" class="seg-b" data-stp="${p.d}" aria-pressed="${p.d === f.period}">${p.label}</button>`).join('');
  const filters = `<div class="st-filters">
      <div class="seg seg-text" role="group" aria-label="Periodo">${periodBtns}</div>
      <div class="st-selects">
        <label class="sel"><span>Mazos</span><select id="st-scope">${ctx.scopeOptions(f.scope)}</select></label>
        <label class="sel"><span>Tipo de tarjeta</span><select id="st-mode"><option value="">Todos</option>${ctx.modes.map(m => `<option value="${m.id}" ${m.id === f.mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
      </div></div>`;

  const L = D.B.list;
  const kpi = (v, l, sp, tip = '') => `<div class="kpi"${tip ? ` title="${escA(tip)}"` : ''}><b>${v}</b><span>${l}</span>${sp}</div>`;
  const kpis = `<div class="kpis">
      ${kpi(nf.format(n), n === 1 ? 'respuesta' : 'respuestas', spark(L.map(b => b.n)))}
      ${kpi(fmtDuration(D.ms), 'de estudio', spark(L.map(b => b.ms)), n ? `${Math.round(D.ms / n / 1000)} s por tarjeta de media` : '')}
      ${kpi(n ? pct(D.ok, n) + ' %' : '—', 'de aciertos', spark(L.map(b => (b.n ? pct(b.ok, b.n) : null))), 'Respuestas que no fueron «Otra vez»')}
      ${kpi(`${D.activeDays}<small>/${D.periodDays}</small>`, 'días estudiando', spark(L.map(b => (b.n ? 1 : 0)), { bars: true }))}
    </div>`;

  // Estados vacíos: sin tarjetas, sin respuestas en el periodo o sin ninguna respuesta con estos filtros
  const filtered = f.scope !== 'all' || !!f.mode;
  const emptyBox = (ic, title, text, btns = '') => `<div class="st-empty" role="status"><h2>${ctx.icon(ic, { size: 18 })} ${title}</h2><p>${text}</p>${btns ? `<div class="btnrow">${btns}</div>` : ''}</div>`;
  const noCards = !D.cards.length;
  const empty = noCards
    ? (filtered ? emptyBox('chart-column', 'No hay tarjetas con estos filtros', 'Prueba con otro mazo o tipo de tarjeta.')
      : emptyBox('chart-column', 'Todavía no hay nada que medir', 'Cuando tengas mazos y estudies, aquí verás tu progreso: respuestas, aciertos, tiempo y previsión.', '<button class="primary" data-nav="explore">Ver mazos para empezar</button>'))
    : n ? ''
    : D.scopedN ? emptyBox('chart-column', 'Sin respuestas en este periodo', 'Elige un periodo más largo para ver tu actividad anterior.', '<button class="ghost" data-stp="0">Ver todo el historial</button>')
    : emptyBox('chart-column', 'Aún no hay respuestas', D.prog.size
      ? 'Las estadísticas detalladas (botones, tiempo, horas…) cuentan desde que actualizaste Flaski; el calendario incluye todo tu historial. Estudia un poco y aparecerán aquí.'
      : 'Estudia algunas tarjetas y aquí aparecerán tus respuestas, aciertos y tiempo.', `<button class="primary" data-start="${escA(f.scope)}">Estudiar ahora</button>`);
  const none = text => `<p class="st-none">${text}</p>`;
  const noProg = !D.prog.size;

  // Botones según la tarjeta: barras 100 % apiladas, de «Otra vez» (claro) a «Fácil» (oscuro)
  const again = Object.values(D.byState).reduce((a, g) => a + g[0], 0);
  const stRows = [['new', 'Nuevas'], ['learning', 'Aprendiendo'], ['review', 'Repaso']].map(([k, label]) => {
    const g = D.byState[k], tot = g.reduce((a, b) => a + b, 0);
    const segs = tot ? g.map((v, i) => v ? `<span class="bs-seg t-g${i + 1}" style="flex-grow:${v}" tabindex="0" data-tip-v="${pct(v, tot)} % ${GRADES[i].label === 'Otra vez' ? 'con «Otra vez»' : `con «${GRADES[i].label}»`}" data-tip-l="${label}" data-tip-x="${plural(v, 'respuesta', 'respuestas')} de ${nf.format(tot)}"></span>` : '').join('') : '<span class="bs-seg bs-empty" style="flex-grow:1"></span>';
    return `<li><span class="bs-lab">${label}</span><span class="bs-bar">${segs}</span><span class="bs-num">${tot ? pct(tot - g[0], tot) + ' %' : '—'}</span></li>`;
  }).join('');
  const gradeKey = `<p class="bs-key">${GRADES.map((x, i) => `<span><i class="t-g${i + 1}"></i>${x.label}</span>`).join('')}<span class="bs-key-r">% a la derecha: aciertos</span></p>`;

  // Por mazo (solo si se miran varios): el más estudiado, en tono oscuro
  const deckRows = [...D.byDeck.entries()].filter(([id]) => ctx.decks.has(id)).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const maxDeck = Math.max(1, ...deckRows.map(([, x]) => x.n));
  const deckHTML = deckRows.map(([id, x], i) => `<li><span class="hb-lab">${ctx.deckLabel(id)}<span>${escA(ctx.deckName(id))}</span></span>
      <span class="hb-track"><span class="hb-bar${i ? '' : ' hb-top'}" style="width:${Math.max(2, (x.n / maxDeck) * 100)}%" tabindex="0" data-tip-v="${plural(x.n, 'respuesta', 'respuestas')}" data-tip-l="${escA(ctx.deckName(id))}" data-tip-x="${pct(x.ok, x.n)} % de aciertos · ${fmtDuration(x.ms)}"></span></span>
      <span class="hb-num">${nf.format(x.n)}</span></li>`).join('');

  const hm = heatmap(D.log);
  // Las que más se te resisten, con una barra fina según sus fallos
  const maxHard = Math.max(1, ...D.hard.map(h => h.lapses + h.miss));
  const hardHTML = D.hard.length ? `<ul class="list hard-list">${D.hard.map(({ c, p, lapses, miss }) => `<li><button class="row" data-card="${c.id}">
      <span class="f">${ctx.cardFront(c)}</span><span class="hard-meta"><span class="hard-bar" style="--w:${Math.round(((lapses + miss) / maxHard) * 100)}%"></span>${[lapses && plural(lapses, 'olvido', 'olvidos'), miss && `${plural(miss, 'fallo', 'fallos')} en el periodo`, p && `facilidad ${Math.round((p.ease || 2.5) * 100)} %`].filter(Boolean).join(' · ')}</span>
      <span class="b">${ctx.deckLabel(c.deck_id)} ${escA(ctx.deckName(c.deck_id))}</span></button></li>`).join('')}</ul>`
    : none('Ninguna tarjeta se te resiste. 🎉');

  const fcOpts = [7, 30, 90].map(d => `<button type="button" class="seg-b" data-stfc="${d}" aria-pressed="${d === f.fcDays}">${d} d</button>`).join('');
  const fcSum = D.fc.reduce((a, b) => a + b, 0);

  // La mejor hora: la que más respuestas tiene
  const best = D.hours.reduce((b, h, i) => (h.n > D.hours[b].n ? i : b), 0), bh = D.hours[best];
  // Intervalo mediano y facilidad media
  const ivls = [...D.prog.values()].map(p => p.interval || 0).sort((a, b) => a - b);
  const median = ivls.length ? ivls[Math.floor((ivls.length - 1) / 2)] : 0;
  const eases = [...D.prog.values()].filter(p => p.reps || p.interval >= 1).map(p => p.ease || 2.5);
  const meanEase = eases.length ? Math.round((eases.reduce((a, b) => a + b, 0) / eases.length) * 100) : 0;
  const avg = n / Math.max(1, L.length);

  const periodCards = n ? `
    ${card('rev', lvHead('rev', `Respuestas ${perT}`, nf.format(n), n === 1 ? 'respuesta' : 'respuestas', `${nf.format(Math.round(avg * 10) / 10)} ${per} de media · ${pct(D.ok, n)} % de aciertos`), '<div class="st-chart" data-chart="reviews"></div>')}
    ${card('time', lvHead('time', 'Tiempo y aciertos', fmtDuration(D.ms), `de estudio · ${pct(D.ok, n)} % de aciertos`, `${Math.round(D.ms / n / 1000)} s por tarjeta de media`), '<div class="st-chart" data-chart="time"></div><div class="st-chart st-chart-sm" data-chart="acc"></div>')}
    ${card('btn', lvHead('btn', 'Botones según la tarjeta', `${pct(again, n)} %`, 'de las veces, «Otra vez»', 'Según si la tarjeta era nueva, la estabas aprendiendo o la repasabas'), `<ul class="bstack">${stRows}</ul>${gradeKey}`)}
    ${card('hour', lvHead('hour', 'Hora del día', `${best} h`, 'tu mejor hora', `${plural(bh.n, 'respuesta', 'respuestas')} · ${pct(bh.ok, bh.n)} % de aciertos a esa hora`), '<div class="st-chart" data-chart="hours"></div>')}
    ${deckRows.length > 1 ? card('deck', lvHead('deck', 'Por mazo', nf.format(deckRows[0][1].n), `respuestas en ${escA(ctx.deckName(deckRows[0][0]))}`, `${plural(deckRows.length, 'mazo', 'mazos')} con respuestas en el periodo`), `<ul class="hbars">${deckHTML}</ul>`) : ''}` : '';
  const html = `<div class="st-head"><h1>Estadísticas</h1><p class="muted">${escA(ctx.scopeName(f.scope))}${f.mode ? ' · ' + escA(ctx.modes.find(m => m.id === f.mode)?.label || '') : ''}</p></div>
    ${ctx.decks.size ? filters : ''}${noCards && !filtered ? '' : kpis}${empty}
    ${noCards ? '' : '<section class="chart-card st-card lv pg-card" id="stPg" aria-labelledby="st-pg"></section>'}
    ${periodCards}
    ${noCards ? '' : `
    ${card('cal', lvHead('cal', 'Calendario', nf.format(hm.active), hm.active === 1 ? 'día estudiando en el último año' : 'días estudiando en el último año', `${plural(hm.total, 'repaso', 'repasos')}`), hm.total ? hm.html : none('Aún no hay días de estudio en el último año.'))}
    ${card('fc', lvHead('fc', 'Previsión', nf.format(fcSum), `${fcSum === 1 ? 'repaso' : 'repasos'} en los próximos ${f.fcDays} días`, noProg ? '' : `Hoy ${nf.format(D.fc[0])} (con las atrasadas) · mañana ${nf.format(D.fc[1] || 0)}`, `<div class="seg seg-text" role="group" aria-label="Días de previsión">${fcOpts}</div>`), noProg ? none('Cuando estudies tarjetas, aquí verás cuántas tocan cada día.') : '<div class="st-chart" data-chart="forecast"></div>')}
    ${card('ivl', lvHead('ivl', 'Intervalos', noProg ? '—' : fmtDays(median), 'intervalo mediano', noProg ? '' : `La mitad de tus tarjetas vuelven en más de ${fmtDays(median)}`), noProg ? none('Aún no has estudiado ninguna tarjeta con estos filtros.') : '<div class="st-chart" data-chart="intervals"></div>')}
    ${card('ease', lvHead('ease', 'Facilidad', eases.length ? `${meanEase} %` : '—', 'de facilidad media', 'Cuanto más baja, más te cuesta la tarjeta'), noProg ? none('Aún no has estudiado ninguna tarjeta con estos filtros.') : '<div class="st-chart" data-chart="ease"></div>')}
    ${card('hard', lvHead('hard', 'Las que más se te resisten', nf.format(D.hardN), D.hardN === 1 ? 'tarjeta con fallos' : 'tarjetas con fallos', D.hard.length ? 'Estas son las que más' : ''), hardHTML)}`}`;
  return { html, data: D };
}

/* ---------------- gráfico de barras (sin rejilla ni eje: la cifra está en la cabecera) ---------------- */
// Ancho aproximado de un texto del eje (11 px), para reservar sitio y no cortarlo
const textW = s => String(s).length * 6.6;
// Barra con la parte de arriba redondeada (radio r) y la base recta
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return r ? `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z` : `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
}
let animate = false;   // drawStats lo activa al pintar por primera vez o al cambiar filtros (no al redimensionar)
// Etiqueta del eje X: centrada bajo la barra, salvo en los bordes, donde se ancla para no salirse
function xLabel(x, y, label, width, strong = false) {
  const half = textW(label) / 2;
  const [anchor, ax] = x - half < 0 ? ['start', 1] : x + half > width ? ['end', width - 1] : ['middle', x];
  return `<text class="ax${strong ? ' ax-strong' : ''}" x="${ax}" y="${y}" text-anchor="${anchor}">${escA(label)}</text>`;
}
const tipAttrs = r => `data-tip-v="${escA(r.tipV)}" data-tip-l="${escA(r.tipL)}"${r.tipX ? ` data-tip-x="${escA(r.tipX)}"` : ''}`;
// rows: [{ v, label, tipV, tipL, tipX }]; highlight(i, n): la barra destacada (en tono oscuro)
function barChart(width, rows, { height = 140, highlight = (i, n) => i === n - 1, labelEvery = (i, n, every) => (n - 1 - i) % every === 0 } = {}) {
  const n = rows.length;
  const max = Math.max(1, ...rows.map(r => r.v));
  const TOP = 6, BASE = height - 20, PLOT = BASE - TOP;
  const slot = width / Math.max(1, n);
  const bw = Math.max(2, Math.min(28, slot * (slot > 8 ? 0.66 : 0.8)));
  const step = Math.min(20, 400 / Math.max(1, n));   // escalonado de la animación: ~20 ms, 400 ms como mucho en total
  let bars = '', labels = '';
  const every = Math.max(1, Math.ceil(44 / slot));
  rows.forEach((r, i) => {
    const cx = slot * i + slot / 2, hi = highlight(i, n);
    const h = r.v ? Math.max(2, (r.v / max) * PLOT) : 0;
    const bar = r.v ? `<path class="st-bar${hi ? ' bar-strong' : ''}" d="${barPath(cx - bw / 2, BASE - h, bw, h, 2)}"></path>` : `<rect class="st-zero" x="${cx - bw / 2}" y="${BASE - 2}" width="${bw}" height="2" rx="1"></rect>`;
    bars += `<g class="bar-g"><g class="bar-stack"${animate ? ` style="animation-delay:${Math.round(i * step)}ms"` : ''}>${bar}</g>`
      + `<rect class="hit" x="${cx - slot / 2}" y="0" width="${slot}" height="${BASE}" tabindex="0" ${tipAttrs(r)}></rect></g>`;
    if (r.label && (labelEvery(i, n, every) || (hi && n < 40))) labels += xLabel(cx, BASE + 15, r.label, width, hi);
  });
  return `<svg class="st-svg${animate ? ' st-anim' : ''}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><line class="st-base" x1="0" x2="${width}" y1="${BASE + .5}" y2="${BASE + .5}"></line>${bars}${labels}</svg>`;
}
// Curva suave con su área (por horas, intervalos, facilidad): rows [{ v, label, tipV, tipL, tipX }]
// mark: índice de la marca (la mejor hora, la mediana…) con su texto
function areaChart(width, rows, { height = 120, mark = null, markText = '', labelAt = () => true, xFrac = null } = {}) {
  const n = rows.length, max = Math.max(1, ...rows.map(r => r.v));
  const TOP = 16, BASE = height - 20, PLOT = BASE - TOP;
  const X = i => (xFrac ? xFrac(i) : n > 1 ? i / (n - 1) : 0.5) * (width - 8) + 4, Y = v => BASE - (v / max) * PLOT;
  const pts = rows.map((r, i) => [X(i), Y(r.v)]);
  const line = smoothPath(pts);
  let out = `<path class="ar-area${animate ? ' ar-anim' : ''}" d="${line} L${pts[n - 1][0].toFixed(1)},${BASE} L${pts[0][0].toFixed(1)},${BASE} Z"></path><path class="ar-line${animate ? ' ar-anim' : ''}" d="${line}"></path>`;
  out += `<line class="st-base" x1="0" x2="${width}" y1="${BASE + .5}" y2="${BASE + .5}"></line>`;
  if (mark != null && rows[mark]) {
    const x = X(mark), y = Y(rows[mark].v);
    out += `<line class="ar-mark" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${(y + 4).toFixed(1)}" y2="${BASE}"></line><circle class="ar-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"></circle>`;
    if (markText) out += `<text class="ax ar-mark-t" x="${x.toFixed(1)}" y="${Math.max(10, y - 8).toFixed(1)}" text-anchor="${x < 40 ? 'start' : x > width - 40 ? 'end' : 'middle'}">${escA(markText)}</text>`;
  }
  let lastX = -99, lastW = 0;
  rows.forEach((r, i) => {
    const x = X(i), half = (i ? X(i) - X(i - 1) : X(1) - X(0)) / 2, half2 = (i < n - 1 ? X(i + 1) - X(i) : half * 2) / 2;
    out += `<rect class="hit" x="${(x - half).toFixed(1)}" y="0" width="${(half + half2).toFixed(1)}" height="${BASE}" tabindex="0" ${tipAttrs(r)}></rect>`;
    if (r.label && labelAt(i, n) && x - lastX > (lastW + textW(r.label)) / 2 + 10) { out += xLabel(x, BASE + 15, r.label, width); lastX = x; lastW = textW(r.label); }
  });
  return `<svg class="st-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${out}</svg>`;
}
// Una curva suave que pasa por todos los puntos sin pasarse (monótona)
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : '';
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    path += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return path;
}

/* ---------------- aciertos: una línea fina debajo del tiempo (los días sin respuestas la cortan) ---------------- */
function accStrip(width, rows, { height = 56 } = {}) {
  const TOP = 8, BASE = height - 8, PLOT = BASE - TOP, LW = 44;
  const n = rows.length, slot = (width - LW) / Math.max(1, n);
  const X = i => slot * i + slot / 2, Y = v => BASE - (v / 100) * PLOT;
  let path = '', hits = '', pen = false, last = null;
  rows.forEach((r, i) => {
    if (r.y === null) pen = false;
    else { path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r.y).toFixed(1)}`; pen = true; last = i; }
    hits += `<rect class="hit" x="${X(i) - slot / 2}" y="0" width="${slot}" height="${height}" tabindex="0" ${tipAttrs(r)}></rect>`;
  });
  const end = last == null ? '' : `<circle class="ar-dot" cx="${X(last).toFixed(1)}" cy="${Y(rows[last].y).toFixed(1)}" r="3"></circle><text class="acc-lab" x="${(width - LW + 8).toFixed(1)}" y="${(Y(rows[last].y) + 4).toFixed(1)}">${rows[last].y} %</text>`;
  return `<svg class="st-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><text class="ax" x="0" y="9">Aciertos</text><line class="st-ref" x1="0" x2="${width - LW}" y1="${Y(50)}" y2="${Y(50)}"></line><path class="ln" d="${path}"></path>${end}${hits}</svg>`;
}

/* ---------------- pinta los gráficos según el ancho disponible ---------------- */
export function drawStats(root, D, { animate: anim = false } = {}) {
  animate = anim;
  const today = startOfDay();
  const gradeText = g => GRADES.map((x, i) => (g[i] ? `${x.label} ${nf.format(g[i])}` : '')).filter(Boolean).join(' · ');
  const charts = {
    reviews: w => barChart(w, D.B.list.map(b => ({ v: b.n, label: b.label, tipL: b.tip, tipV: plural(b.n, 'respuesta', 'respuestas'), tipX: b.n ? gradeText(b.g) : 'Sin estudiar' }))),
    time: w => barChart(w, D.B.list.map(b => ({ v: b.ms, label: b.label, tipL: b.tip, tipV: b.ms ? fmtDuration(b.ms) : '0 min', tipX: b.n ? `de estudio · ${pct(b.ok, b.n)} % de aciertos en ${plural(b.n, 'respuesta', 'respuestas')}` : 'Sin estudiar' })), { height: 120 }),
    acc: w => accStrip(w, D.B.list.map(b => ({ y: b.n ? pct(b.ok, b.n) : null, tipL: b.tip, tipV: b.n ? `${pct(b.ok, b.n)} % de aciertos` : 'Sin respuestas', tipX: b.n ? `${nf.format(b.ok)} de ${nf.format(b.n)}` : '' }))),
    hours: w => {
      const best = D.hours.reduce((b, h, i) => (h.n > D.hours[b].n ? i : b), 0);
      return areaChart(w, D.hours.map((h, i) => ({ v: h.n, label: i % 6 === 0 || i === 23 ? `${i} h` : '', tipL: `de ${i}:00 a ${i}:59`, tipV: plural(h.n, 'respuesta', 'respuestas'), tipX: h.n ? `${pct(h.ok, h.n)} % de aciertos` : 'Nada a esta hora' })), { mark: D.hours[best].n ? best : null });
    },
    forecast: w => {
      const rows = D.fc.map((n, i) => { const t = startOfDay(today + i * DAY + DAY / 2); return { v: n, label: i === 0 ? 'hoy' : dayLabel(t), tipL: i === 0 ? 'hoy, con las atrasadas' : dayLabel(t), tipV: plural(n, 'repaso', 'repasos') }; });
      return barChart(w, rows, { highlight: i => i === 0 });
    },
    intervals: w => {
      const B = [['aprendiendo', 0, 1], ['1 d', 1, 2], ['2 d', 2, 3], ['3–6 d', 3, 7], ['1–2 sem', 7, 14], ['2–3 sem', 14, 21], ['3 sem–1 mes', 21, 31], ['1–3 meses', 31, 91], ['3–6 meses', 91, 182], ['+6 meses', 182, Infinity]];
      const cnt = B.map(() => 0);
      const ivls = [];
      for (const p of D.prog.values()) { const i = B.findIndex(([, a, b]) => p.interval >= a && p.interval < b); if (i >= 0) cnt[i]++; ivls.push(p.interval || 0); }
      ivls.sort((a, b) => a - b);
      const med = ivls[Math.floor((ivls.length - 1) / 2)] || 0, mi = B.findIndex(([, a, b]) => med >= a && med < b);
      const short = w < 520;
      return areaChart(w, B.map(([label], i) => ({ v: cnt[i], label: short ? label.replace(' sem–1 mes', 's–1m').replace(' meses', 'm').replace(' sem', 's').replace('aprendiendo', 'apr.') : label, tipL: i ? `vuelven en ${label}` : 'aprendiendo (menos de 1 día)', tipV: plural(cnt[i], 'tarjeta', 'tarjetas') })), { mark: mi, markText: 'mediana' });
    },
    ease: w => {
      const edges = [1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 2.9, Infinity];
      const cnt = edges.slice(0, -1).map(() => 0);
      let sum = 0, k = 0;
      for (const p of D.prog.values()) { if (!p.reps && p.interval < 1) continue; const i = edges.findIndex((e, j) => p.ease >= e && p.ease < edges[j + 1]); cnt[Math.max(0, i)]++; sum += p.ease || 2.5; k++; }
      const mean = k ? sum / k : 0, mi = Math.max(0, edges.findIndex((e, j) => mean >= e && mean < edges[j + 1]));
      return areaChart(w, cnt.map((c, i) => ({ v: c, label: i === cnt.length - 1 ? `≥${nf.format(edges[i] * 100)}` : nf.format(edges[i] * 100), tipL: i === cnt.length - 1 ? `facilidad de ${nf.format(edges[i] * 100)} % o más` : `facilidad de ${nf.format(edges[i] * 100)} a ${nf.format(edges[i + 1] * 100 - 1)} %`, tipV: plural(c, 'tarjeta', 'tarjetas') })), { mark: k ? mi : null, markText: 'media' });
    },
  };
  for (const el of root.querySelectorAll('[data-chart]')) {
    const fn = charts[el.dataset.chart];
    if (!fn) continue;
    el.innerHTML = fn(Math.max(260, Math.floor(el.clientWidth)));
    el.firstElementChild?.setAttribute('aria-label', el.closest('section')?.querySelector('h2')?.firstChild?.textContent || '');
  }
  // Tu progreso, con los mismos filtros (el periodo, el más cercano de los suyos)
  const pg = root.querySelector('#stPg');
  if (pg) {
    const period = D.f.period === 0 ? 'all' : D.f.period <= 30 ? 'm1' : D.f.period <= 90 ? 'm3' : 'y1';
    progressView(pg, { series: progressSeries({ events: D.allEvs, cards: D.cards, progress: D.prog, period }), width: Math.max(280, Math.floor(pg.clientWidth - 32)), title: 'Tu progreso', animate: anim, deckName: D.deckName });
    pg.querySelector('.lv-k').id = 'st-pg';
  }
}
