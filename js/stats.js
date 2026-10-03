// Estadísticas: filtros (periodo, mazos, tipo de tarjeta) y gráficos SVG hechos a mano.
// statsView() calcula los datos y devuelve el HTML; drawStats() pinta los gráficos
// que dependen del ancho de la pantalla. El tooltip es el compartido de charts.js (data-tip-*).
import { DAY, startOfDay, dateKey, GRADES } from './srs.js';
import { heatmap, maturity } from './charts.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nf = new Intl.NumberFormat('es-ES');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PERIODS = [{ d: 7, label: '7 días' }, { d: 30, label: '30 días' }, { d: 90, label: '3 meses' }, { d: 365, label: '1 año' }, { d: 0, label: 'Todo' }];
const GRADE_SERIES = GRADES.map(x => ({ cls: 's-g' + x.g, label: x.label }));

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
  const evOk = e => { const c = ctx.cards.get(e.card_id); return c ? cardOk(c) : allScope; };
  const scoped = ctx.events.filter(evOk);
  const first = scoped.length ? startOfDay(scoped[0].t) : today;
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
    .sort((a, b) => (b.lapses + b.miss) - (a.lapses + a.miss) || (a.p?.ease || 9) - (b.p?.ease || 9)).slice(0, 10);

  // Previsión: tarjetas que tocan cada día (hoy incluye las atrasadas)
  const fc = new Array(f.fcDays).fill(0);
  for (const p of prog.values()) { const i = p.due <= now ? 0 : Math.round((startOfDay(p.due) - today) / DAY); if (i >= 0 && i < fc.length) fc[i]++; }

  return { fc, f, B, evs, ms, ok, activeDays: activeDays.size, periodDays, byState, hours, byDeck, cards, prog, log, hard, start };
}

/* ---------------- HTML de la página (lo que no depende del ancho) ---------------- */
export function statsView(ctx, f) {
  const D = computeStats(ctx, f);
  const n = D.evs.length;
  const kpi = (v, l, tip = '') => `<div class="kpi"${tip ? ` title="${escA(tip)}"` : ''}><b>${v}</b><span>${l}</span></div>`;
  const legend = series => `<ul class="st-legend">${series.map(s => `<li><span class="sw ${s.cls}"></span>${s.label}</li>`).join('')}</ul>`;
  const card = (id, title, sub, body, extra = '') => `<section class="chart-card st-card${extra}" aria-labelledby="st-${id}">
      <div class="chart-h"><h2 id="st-${id}">${title}</h2>${sub ? `<span>${sub}</span>` : ''}</div>${body}</section>`;
  const per = D.B.unit === 'day' ? 'por día' : D.B.unit === 'week' ? 'por semana' : 'por mes';

  const periodBtns = PERIODS.map(p => `<button type="button" class="seg-b" data-stp="${p.d}" aria-pressed="${p.d === f.period}">${p.label}</button>`).join('');
  const filters = `<div class="st-filters">
      <div class="seg" role="group" aria-label="Periodo">${periodBtns}</div>
      <div class="st-selects">
        <label class="sel"><span>Mazos</span><select id="st-scope">${ctx.scopeOptions(f.scope)}</select></label>
        <label class="sel"><span>Tipo de tarjeta</span><select id="st-mode"><option value="">Todos</option>${ctx.modes.map(m => `<option value="${m.id}" ${m.id === f.mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
      </div></div>`;

  const kpis = `<div class="kpis">
      ${kpi(nf.format(n), n === 1 ? 'respuesta' : 'respuestas')}
      ${kpi(fmtDuration(D.ms), 'de estudio', n ? `${Math.round(D.ms / n / 1000)} s por tarjeta de media` : '')}
      ${kpi(n ? pct(D.ok, n) + ' %' : '—', 'de aciertos', 'Respuestas que no fueron «Otra vez»')}
      ${kpi(`${D.activeDays}<small>/${D.periodDays}</small>`, 'días estudiando')}
    </div>`;

  const empty = !n ? `<p class="st-empty">Aún no hay respuestas con estos filtros. Las estadísticas detalladas (botones, tiempo, horas…) cuentan desde que actualizaste Flaski; el calendario incluye todo tu historial.</p>` : '';

  // Botones por tipo de tarjeta: barras 100 % apiladas
  const stRows = [['new', 'Nuevas'], ['learning', 'Aprendiendo'], ['review', 'Repaso']].map(([k, label]) => {
    const g = D.byState[k], tot = g.reduce((a, b) => a + b, 0);
    const segs = tot ? g.map((v, i) => v ? `<span class="bs-seg s-g${i + 1}" style="flex-grow:${v}" tabindex="0" data-tip-v="${plural(v, 'respuesta', 'respuestas')} · ${pct(v, tot)} %" data-tip-l="${label} · ${GRADES[i].label}"></span>` : '').join('') : '<span class="bs-seg bs-empty" style="flex-grow:1"></span>';
    return `<li><span class="bs-lab">${label}</span><span class="bs-bar">${segs}</span><span class="bs-num">${tot ? pct(tot - g[0], tot) + ' %' : '—'}</span></li>`;
  }).join('');

  // Por mazo (solo si se miran varios)
  const deckRows = [...D.byDeck.entries()].filter(([id]) => ctx.decks.has(id)).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const maxDeck = Math.max(1, ...deckRows.map(([, x]) => x.n));
  const deckHTML = deckRows.map(([id, x]) => `<li><span class="hb-lab">${ctx.deckLabel(id)}</span>
      <span class="hb-track"><span class="hb-bar" style="width:${Math.max(2, (x.n / maxDeck) * 100)}%" tabindex="0" data-tip-v="${plural(x.n, 'respuesta', 'respuestas')} · ${pct(x.ok, x.n)} % aciertos" data-tip-l="${escA(ctx.deckName(id))} · ${fmtDuration(x.ms)}"></span></span>
      <span class="hb-num">${nf.format(x.n)}</span></li>`).join('');

  const hm = heatmap(D.log);
  const mt = maturity(D.cards, D.prog);
  const hardHTML = D.hard.length ? `<ul class="list hard-list">${D.hard.map(({ c, p, lapses, miss }) => `<li><button class="row" data-card="${c.id}">
      <span class="f">${ctx.cardFront(c)}</span><span class="hard-meta">${lapses ? `<span class="chip">${plural(lapses, 'olvido', 'olvidos')}</span>` : ''}${miss ? `<span class="chip">${plural(miss, 'fallo', 'fallos')} en el periodo</span>` : ''}${p ? `<span class="chip">facilidad ${nf.format(Math.round(p.ease * 100))} %</span>` : ''}</span>
      <span class="b">${ctx.deckLabel(c.deck_id)} ${escA(ctx.deckName(c.deck_id))}</span></button></li>`).join('')}</ul>`
    : '<p class="muted small">Ninguna tarjeta se te resiste. 🎉</p>';

  const fcOpts = [7, 30, 90].map(d => `<button type="button" class="seg-b" data-stfc="${d}" aria-pressed="${d === f.fcDays}">${d} d</button>`).join('');

  const html = `<div class="st-head"><h1>Estadísticas</h1><p class="muted">${escA(ctx.scopeName(f.scope))}${f.mode ? ' · ' + escA(ctx.modes.find(m => m.id === f.mode)?.label || '') : ''}</p></div>
    ${filters}${kpis}${empty}
    ${card('rev', 'Respuestas ' + per, plural(n, 'respuesta', 'respuestas'), `${legend(GRADE_SERIES)}<div class="st-chart" data-chart="reviews"></div>`)}
    ${card('time', 'Tiempo de estudio ' + per, fmtDuration(D.ms), '<div class="st-chart" data-chart="time"></div>')}
    ${card('acc', 'Aciertos ' + per, n ? pct(D.ok, n) + ' % de media' : '', '<div class="st-chart" data-chart="acc"></div>')}
    ${card('btn', 'Botones según la tarjeta', '% a la derecha: aciertos', `${legend(GRADE_SERIES)}<ul class="bstack">${stRows}</ul>`)}
    ${card('hour', 'Hora del día', 'cuándo estudias', '<div class="st-chart" data-chart="hours"></div>')}
    ${deckRows.length > 1 ? card('deck', 'Por mazo', 'respuestas en el periodo', `<ul class="hbars">${deckHTML}</ul>`) : ''}
    ${card('cal', 'Calendario', `${nf.format(hm.total)} repasos en el último año`, hm.html)}
    ${card('fc', 'Previsión', plural(D.fc.reduce((a, b) => a + b, 0), 'repaso', 'repasos'), `<div class="seg seg-sm" role="group" aria-label="Días de previsión">${fcOpts}</div><div class="st-chart" data-chart="forecast"></div>`)}
    ${card('ivl', 'Intervalos actuales', 'cada cuánto vuelven tus tarjetas', '<div class="st-chart" data-chart="intervals"></div>')}
    ${card('ease', 'Facilidad', 'más baja = más difícil para ti', '<div class="st-chart" data-chart="ease"></div>')}
    ${card('mt', 'Estado de las tarjetas', `${mt.pct} % consolidadas`, mt.html)}
    ${card('hard', 'Las que más se te resisten', '', hardHTML)}`;
  return { html, data: D };
}

/* ---------------- gráfico de barras genérico (apiladas o simples) ---------------- */
function barChart(width, rows, { series, height = 150, tipV, yFmt = v => nf.format(v), highlightLast = false }) {
  const PADL = 30, PADR = 4, TOP = 10, BASE = height - 22, PLOT = BASE - TOP;
  const n = rows.length;
  const slot = (width - PADL - PADR) / Math.max(1, n);
  const bw = Math.max(2, Math.min(26, slot * (slot > 8 ? 0.68 : 0.82)));
  const totals = rows.map(r => r.v.reduce((a, b) => a + b, 0));
  const rawMax = Math.max(0, ...totals);
  const max = niceMax(rawMax);
  let grid = '', bars = '', labels = '';
  for (const frac of [0, 0.5, 1]) {
    const y = BASE - frac * PLOT;
    grid += `<line class="grid${frac === 0 ? ' baseline' : ''}" x1="${PADL}" x2="${width - PADR}" y1="${y + .5}" y2="${y + .5}"></line>`;
    if (rawMax || frac === 0) grid += `<text class="ax" x="${PADL - 6}" y="${y + 3.5}" text-anchor="end">${yFmt(max * frac)}</text>`;
  }
  const every = Math.max(1, Math.ceil(40 / slot));
  rows.forEach((r, i) => {
    const cx = PADL + slot * i + slot / 2;
    let y = BASE;
    r.v.forEach((v, k) => {
      if (!v) return;
      const h = Math.max(1.5, (v / max) * PLOT);
      bars += `<rect class="bar ${series[k].cls}${highlightLast && i === n - 1 ? ' bar-strong' : ''}" x="${cx - bw / 2}" y="${y - h}" width="${bw}" height="${h}" rx="${Math.min(2, bw / 4)}"></rect>`;
      y -= h + (series.length > 1 ? 1 : 0);   // separación de 1px entre segmentos apilados
    });
    bars += `<rect class="hit" x="${cx - slot / 2}" y="${TOP - 6}" width="${slot}" height="${PLOT + 6}" tabindex="0" data-tip-v="${escA(tipV(r, totals[i]))}" data-tip-l="${escA(r.tip)}"></rect>`;
    if ((n - 1 - i) % every === 0) labels += `<text class="ax" x="${cx}" y="${BASE + 15}" text-anchor="middle">${escA(r.label)}</text>`;
  });
  return `<svg class="st-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${grid}${bars}${labels}</svg>`;
}
function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/* ---------------- línea (porcentaje) ---------------- */
function lineChart(width, rows, { height = 150, tipV }) {
  const PADL = 30, PADR = 8, TOP = 10, BASE = height - 22, PLOT = BASE - TOP;
  const n = rows.length, slot = (width - PADL - PADR) / Math.max(1, n);
  const X = i => PADL + slot * i + slot / 2, Y = v => BASE - (v / 100) * PLOT;
  let grid = '';
  for (const v of [0, 50, 100]) grid += `<line class="grid${v === 0 ? ' baseline' : ''}" x1="${PADL}" x2="${width - PADR}" y1="${Y(v) + .5}" y2="${Y(v) + .5}"></line><text class="ax" x="${PADL - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v} %</text>`;
  // Tramos continuos (los días sin respuestas cortan la línea)
  let path = '', dots = '', hits = '', labels = '', pen = false;
  const every = Math.max(1, Math.ceil(40 / slot));
  rows.forEach((r, i) => {
    if (r.y === null) pen = false;
    else { path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r.y).toFixed(1)}`; pen = true; if (slot >= 6) dots += `<circle class="ln-dot" cx="${X(i)}" cy="${Y(r.y)}" r="2.5"></circle>`; }
    hits += `<rect class="hit" x="${X(i) - slot / 2}" y="${TOP - 6}" width="${slot}" height="${PLOT + 6}" tabindex="0" data-tip-v="${escA(tipV(r))}" data-tip-l="${escA(r.tip)}"></rect>`;
    if ((n - 1 - i) % every === 0) labels += `<text class="ax" x="${X(i)}" y="${BASE + 15}" text-anchor="middle">${escA(r.label)}</text>`;
  });
  return `<svg class="st-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${grid}<path class="ln" d="${path}"></path>${dots}${hits}${labels}</svg>`;
}

/* ---------------- pinta los gráficos según el ancho disponible ---------------- */
export function drawStats(root, D) {
  const today = startOfDay();
  const charts = {
    reviews: w => barChart(w, D.B.list.map(b => ({ v: b.g, label: b.label, tip: b.tip })), {
      series: GRADE_SERIES.map(s => ({ cls: s.cls })),
      tipV: (r, tot) => tot ? `${plural(tot, 'respuesta', 'respuestas')} · ${r.v.map((v, i) => v ? `${GRADES[i].label} ${v}` : '').filter(Boolean).join(', ')}` : 'Sin respuestas',
    }),
    time: w => barChart(w, D.B.list.map(b => ({ v: [Math.round(b.ms / 60e3 * 10) / 10], label: b.label, tip: b.tip, ms: b.ms })), {
      series: [{ cls: 's-acc' }], yFmt: v => `${Math.round(v)}′`,
      tipV: r => r.ms ? fmtDuration(r.ms) : 'Sin estudio',
    }),
    acc: w => lineChart(w, D.B.list.map(b => ({ y: b.n ? pct(b.ok, b.n) : null, n: b.n, ok: b.ok, label: b.label, tip: b.tip })), {
      tipV: r => r.n ? `${pct(r.ok, r.n)} % · ${r.ok} de ${r.n}` : 'Sin respuestas',
    }),
    hours: w => barChart(w, D.hours.map((h, i) => ({ v: [h.n], label: i % 3 === 0 ? `${i}h` : '', tip: `De ${i}:00 a ${i}:59`, ...h })), {
      series: [{ cls: 's-acc' }], height: 130,
      tipV: r => r.n ? `${plural(r.n, 'respuesta', 'respuestas')} · ${pct(r.ok, r.n)} % aciertos` : 'Nada a esta hora',
    }),
    forecast: w => {
      const rows = D.fc.map((n, i) => { const t = startOfDay(today + i * DAY + DAY / 2); return { v: [n], label: i === 0 ? 'hoy' : dayLabel(t), tip: i === 0 ? 'Hoy (incluye atrasadas)' : dayLabel(t) }; });
      return barChart(w, rows, { series: [{ cls: 's-acc' }], tipV: (r, t) => plural(t, 'tarjeta', 'tarjetas') });
    },
    intervals: w => {
      const B = [['Aprendiendo', 0, 1], ['1 d', 1, 2], ['2 d', 2, 3], ['3–6 d', 3, 7], ['1–2 sem', 7, 14], ['2–3 sem', 14, 21], ['3 sem–1 mes', 21, 31], ['1–3 meses', 31, 91], ['3–6 meses', 91, 182], ['+6 meses', 182, Infinity]];
      const rows = B.map(([label, a, b]) => ({ v: [0], label, tip: label === 'Aprendiendo' ? 'Aprendiendo (menos de 1 día)' : `Intervalo: ${label}` }));
      for (const p of D.prog.values()) { const i = B.findIndex(([, a, b]) => p.interval >= a && p.interval < b); if (i >= 0) rows[i].v[0]++; }
      const short = w < 520;
      rows.forEach(r => { if (short) r.label = r.label.replace(' sem–1 mes', 's–1m').replace(' meses', 'm').replace(' sem', 's').replace('Aprendiendo', 'apr.'); });
      return barChart(w, rows, { series: [{ cls: 's-acc' }], tipV: (r, t) => plural(t, 'tarjeta', 'tarjetas') });
    },
    ease: w => {
      const edges = [1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 2.9, Infinity];
      const rows = edges.slice(0, -1).map((a, i) => ({ v: [0], label: i === edges.length - 2 ? `≥${nf.format(a * 100)}` : nf.format(a * 100), tip: i === edges.length - 2 ? `Facilidad ${nf.format(a * 100)} % o más` : `Facilidad ${nf.format(a * 100)}–${nf.format(edges[i + 1] * 100 - 1)} %` }));
      for (const p of D.prog.values()) { if (!p.reps && p.interval < 1) continue; const i = edges.findIndex((e, k) => p.ease >= e && p.ease < edges[k + 1]); rows[Math.max(0, i)].v[0]++; }
      return barChart(w, rows, { series: [{ cls: 's-acc' }], tipV: (r, t) => plural(t, 'tarjeta', 'tarjetas') });
    },
  };
  for (const el of root.querySelectorAll('[data-chart]')) {
    const fn = charts[el.dataset.chart];
    if (fn) el.innerHTML = fn(Math.max(260, Math.floor(el.clientWidth)));
  }
}
