// Gráficos del panel: actividad tipo GitHub, previsión de repasos y estado de las tarjetas.
// Cada función devuelve HTML/SVG como texto. El tooltip se gestiona con un único
// manejador (initChartTips) que lee los atributos data-tip-* de cada marca.
import { DAY, startOfDay, dateKey } from './srs.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmtDate = t => { const d = new Date(t); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const nf = new Intl.NumberFormat('es-ES');
const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;

/* ---------------- Rachas ---------------- */
export function streaks(log) {
  let current = 0, t = startOfDay();
  if (!(log[dateKey(t)] > 0)) t -= DAY;            // si hoy aún no has estudiado, cuenta desde ayer
  while (log[dateKey(t)] > 0) { current++; t -= DAY; }
  const days = Object.keys(log).filter(k => log[k] > 0).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const ms = new Date(k + 'T12:00:00').getTime();
    run = prev !== null && Math.round((ms - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = ms;
  }
  return { current, best: Math.max(best, current) };
}

/* ---------------- Actividad (calendario tipo GitHub) ----------------
   Una columna por semana (de lunes a domingo), un cuadrado por día.
   El color indica cuántos repasos hiciste ese día, en 5 niveles. */
export function heatmap(log, weeks = 53) {
  const CELL = 11, GAP = 3, STEP = CELL + GAP, LEFT = 0, TOP = 18;
  const today = startOfDay();
  const dow = (new Date(today).getDay() + 6) % 7;     // 0 = lunes
  const start = today - (dow + (weeks - 1) * 7) * DAY;

  const vals = [];
  for (let t = start; t <= today; t += DAY) vals.push(log[dateKey(t)] || 0);
  const max = Math.max(0, ...vals);
  const level = n => (n <= 0 ? 0 : max <= 4 ? Math.min(4, n) : Math.min(4, Math.ceil((n / max) * 4)));

  let cells = '', months = '', lastMonth = -1, total = 0, active = 0;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      // DST-safe: recalcular el inicio del día
      const t = startOfDay(start + (w * 7 + d) * DAY + DAY / 2);
      if (t > today) continue;
      const n = log[dateKey(t)] || 0;
      total += n; if (n) active++;
      const x = LEFT + w * STEP, y = TOP + d * STEP;
      cells += `<rect class="hm l${level(n)}${t === today ? ' hm-today' : ''}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5"
        data-tip-v="${plural(n, 'repaso', 'repasos')}" data-tip-l="${fmtDate(t)}"></rect>`;
      if (d === 0) {
        const m = new Date(t).getMonth();
        if (m !== lastMonth && w < weeks - 1) {
          if (lastMonth !== -1 || new Date(t).getDate() <= 7) months += `<text class="ax" x="${x}" y="10">${MONTHS[m]}</text>`;
          lastMonth = m;
        }
      }
    }
  }
  const days = ['lun', '', 'mié', '', 'vie', '', ''].map((s, i) => s ? `<text class="ax" x="0" y="${TOP + i * STEP + 9}">${s}</text>` : '').join('');
  const W = LEFT + weeks * STEP - GAP, H = TOP + 7 * STEP;
  const legend = [0, 1, 2, 3, 4].map(l => `<span class="hm-key l${l}"></span>`).join('');
  return {
    total, active,
    html: `<div class="hm-wrap" style="--hm-w:${W};--hm-t:${W + 26}"><svg class="hm-days" width="26" height="${H}" viewBox="0 0 26 ${H}" aria-hidden="true">${days}</svg>
      <div class="hm-scroll" data-scroll-end><svg class="hm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Calendario de actividad: ${plural(total, 'repaso', 'repasos')} en ${plural(active, 'día', 'días')} del último año">${months}${cells}</svg></div></div>
      <div class="hm-legend"><span>Menos</span>${legend}<span>Más</span></div>`,
  };
}

/* ---------------- Actividad con periodos (1 mes · 3 meses · 6 meses · año) ----------------
   Siempre están los cuadrados del último año; al cambiar de periodo se recolocan y cambian de tamaño
   (con transición): los que quedan fuera se apartan hacia la izquierda y desaparecen. */
export const HM_PERIODS = [
  { id: 'm1', label: '1 mes', weeks: 5, text: 'el último mes' },
  { id: 'm3', label: '3 meses', weeks: 13, text: 'los últimos 3 meses' },
  { id: 'm6', label: '6 meses', weeks: 26, text: 'los últimos 6 meses' },
  { id: 'y1', label: 'Año', weeks: 53, text: 'el último año' },
];
const HM_WEEKS = 53, HM_TOP = 18, HM_LEFT = 28;
// Las celdas llenan el ancho; si quedan muy anchas (periodos cortos), son rectángulos de altura limitada
function hmGeom(weeks, width) {
  const avail = Math.max(180, width - HM_LEFT);
  // Siempre cuadrados: llenan el ancho, pero en los periodos cortos con un tamaño máximo (y centrados)
  const sx = Math.max(10, Math.min(weeks <= 5 ? 46 : weeks <= 13 ? 34 : 60, Math.floor((avail + 3) / weeks)));
  const gap = sx >= 36 ? 6 : sx >= 22 ? 4 : 3;
  const cw = sx - gap, ch = cw, sy = sx;
  return { sx, sy, gap, cw, ch, W: weeks * sx - gap, H: HM_TOP + 7 * sy - gap };
}
// Pinta (la primera vez) o recoloca (las siguientes) el calendario en el contenedor; devuelve { total, active }
export function heatmapView(host, log, periodId, width) {
  const p = HM_PERIODS.find(x => x.id === periodId) || HM_PERIODS[3];
  const today = startOfDay();
  const dow = (new Date(today).getDay() + 6) % 7;
  const start = today - (dow + (HM_WEEKS - 1) * 7) * DAY;
  const firstShown = HM_WEEKS - p.weeks;
  const g = hmGeom(p.weeks, width);
  // Los niveles de color, según lo que se ve
  const days = [];
  for (let w = 0; w < HM_WEEKS; w++) for (let d = 0; d < 7; d++) {
    const t = startOfDay(start + (w * 7 + d) * DAY + DAY / 2);
    if (t <= today) days.push({ w, d, t, n: log[dateKey(t)] || 0 });
  }
  const shown = days.filter(x => x.w >= firstShown);
  const max = Math.max(0, ...shown.map(x => x.n));
  const level = n => (n <= 0 ? 0 : max <= 4 ? Math.min(4, n) : Math.min(4, Math.ceil((n / max) * 4)));
  const pos = x => {
    const k = x.w - firstShown, on = k >= 0;
    return { x: k * g.sx, y: HM_TOP + x.d * g.sy, on };
  };
  const rx = Math.max(2.5, Math.min(g.cw, g.ch) / 4.5);
  let svg = host.querySelector('.hm-svg');
  if (!svg) {
    host.innerHTML = `<div class="hm-wrap"><svg class="hm-days" aria-hidden="true"></svg>
      <div class="hm-scroll" data-scroll-end><svg class="hm-svg" role="img">${days.map(x => `<rect class="hm${x.t === today ? ' hm-today' : ''}" data-k="${x.w * 7 + x.d}"
        data-tip-v="${plural(x.n, 'repaso', 'repasos')}" data-tip-l="${fmtDate(x.t)}"></rect>`).join('')}<g class="hm-months"></g></svg></div></div>
      <div class="hm-legend"><span>Menos</span>${[0, 1, 2, 3, 4].map(l => `<span class="hm-key l${l}"></span>`).join('')}<span>Más</span></div>`;
    svg = host.querySelector('.hm-svg');
  }
  const rects = svg.querySelectorAll('rect.hm');
  days.forEach((x, i) => {
    const r = rects[i], q = pos(x);
    r.setAttribute('class', `hm l${level(x.n)}${x.t === today ? ' hm-today' : ''}${q.on ? '' : ' is-out'}`);
    // Como atributo (para cualquier navegador) y como estilo (para que se anime)
    for (const [k, v] of [['x', q.on ? q.x : q.x - 40], ['y', q.y], ['width', g.cw], ['height', g.ch], ['rx', rx]]) { r.setAttribute(k, v); r.style.setProperty(k, `${v}px`); }
    r.setAttribute('tabindex', q.on ? '0' : '-1');
  });
  // Meses y días de la semana
  let months = '', last = -1;
  for (let w = firstShown; w < HM_WEEKS; w++) {
    const t = startOfDay(start + w * 7 * DAY + DAY / 2), m = new Date(t).getMonth();
    if (m !== last) {
      const x = (w - firstShown) * g.sx;
      if ((last !== -1 || new Date(t).getDate() <= 7 || p.weeks <= 5) && x < g.W - 18) months += `<text class="ax" x="${x}" y="10">${MONTHS[m]}</text>`;
      last = m;
    }
  }
  svg.querySelector('.hm-months').innerHTML = months;
  for (const [k, v] of [['width', g.W], ['height', g.H]]) { svg.setAttribute(k, v); svg.style.setProperty(k, `${v}px`); }
  svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
  const dsvg = host.querySelector('.hm-days');
  dsvg.setAttribute('width', HM_LEFT); dsvg.setAttribute('height', g.H); dsvg.style.height = `${g.H}px`;
  dsvg.innerHTML = ['lun', '', 'mié', '', 'vie', '', ''].map((s, i) => (s ? `<text class="ax" x="0" y="${HM_TOP + i * g.sy + g.ch / 2 + 3.5}">${s}</text>` : '')).join('');
  const total = shown.reduce((a, x) => a + x.n, 0), active = shown.filter(x => x.n).length;
  svg.setAttribute('aria-label', `Calendario de actividad: ${plural(total, 'repaso', 'repasos')} en ${plural(active, 'día', 'días')} en ${p.text}`);
  return { total, active, text: p.text };
}

/* ---------------- Tu ritmo ---------------- */
// Una curva suave que pasa por todos los puntos sin pasarse (monótona: nunca baja de 0 entre dos días)
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    path += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return path;
}
const niceMax = v => { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
// Tu ritmo: a la izquierda de «hoy», lo que has estudiado cada día (y tu % de aciertos); a la derecha,
// lo que te toca repasar y las nuevas que irán entrando. Líneas suaves, sin puntos.
export const RV_PERIODS = [{ d: 14, label: '2 semanas' }, { d: 30, label: '1 mes' }, { d: 90, label: '3 meses' }];
export const RV_SERIES = [
  { key: 'done', label: 'Estudiadas' },
  { key: 'acc', label: 'Aciertos' },
  { key: 'due', label: 'Por repasar' },
  { key: 'new', label: 'Nuevas' },
];
// events: respuestas ({ t, grade, ms }); log: repasos por día (por si faltan respuestas de días antiguos)
export function rhythmChart({ events = [], log = {}, cards = [], progress = new Map(), days = 14, width = 600, newToday = 0, newPerDay = 0, hidden = new Set() }) {
  days = RV_PERIODS.some(p => p.d === days) ? days : 14;
  const now = Date.now(), today = startOfDay(now);
  const past = Math.floor(days / 2), future = days - past;          // días antes de hoy · hoy y los siguientes
  const N = past + future, at = i => startOfDay(today + (i - past) * DAY + DAY / 2);
  const done = new Array(N).fill(null), acc = new Array(N).fill(null), ms = new Array(N).fill(0), due = new Array(N).fill(null), nw = new Array(N).fill(null);
  // Lo estudiado: por respuestas (con aciertos y tiempo); si no las hay, por el registro diario
  const byDay = new Map();
  for (const e of events) {
    if (!(e.grade >= 1) || !Number.isFinite(e.t) || e.t < at(0) || e.t > now) continue;
    const k = dateKey(e.t), x = byDay.get(k) || { n: 0, ok: 0, ms: 0 };
    x.n++; if (e.grade > 1) x.ok++; x.ms += e.ms || 0;
    byDay.set(k, x);
  }
  for (let i = 0; i <= past; i++) {
    const k = dateKey(at(i)), x = byDay.get(k);
    done[i] = Math.max(x?.n || 0, log[k] || 0);
    acc[i] = x?.n ? Math.round((x.ok / x.n) * 100) : null;
    ms[i] = x?.ms || 0;
  }
  // Lo que toca: hoy (con las atrasadas) y los días siguientes
  for (let i = past; i < N; i++) { due[i] = 0; nw[i] = 0; }
  for (const c of cards) {
    const p = progress.get(c.id);
    if (!p) continue;
    const j = p.due <= now ? 0 : Math.round((startOfDay(p.due) - today) / DAY);
    if (j >= 0 && j < future) due[past + j]++;
  }
  let pool = cards.filter(c => !progress.has(c.id)).length;
  for (let j = 0; j < future && pool > 0; j++) { const k = Math.min(pool, j === 0 ? newToday : newPerDay); nw[past + j] = k; pool -= k; }

  const H = 220, PADT = 22, PADB = 26, PADL = 34, PADR = 40, plotH = H - PADT - PADB, plotW = Math.max(140, width - PADL - PADR);
  const counts = [['done', done], ['due', due], ['new', nw]].filter(([k]) => !hidden.has(k)).flatMap(([, a]) => a.filter(v => v != null));
  const top = niceMax(Math.max(1, ...counts));
  const X = i => PADL + (i / (N - 1)) * plotW, Y = v => PADT + plotH - (v / top) * plotH, YP = v => PADT + plotH - (v / 100) * plotH;
  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const y = Y((top / 4) * k);
    grid += `<line class="rv-grid${k === 0 ? ' rv-base' : ''}" x1="${PADL}" x2="${PADL + plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="ax" x="${PADL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${nf.format(Math.round((top / 4) * k * 10) / 10)}</text>`;
    if (!hidden.has('acc')) grid += `<text class="ax rv-ax-acc" x="${PADL + plotW + 8}" y="${(YP(25 * k) + 3.5).toFixed(1)}">${25 * k} %</text>`;
  }
  // Fechas: hoy siempre, y algunas más a los lados
  const every = N <= 14 ? 2 : N <= 30 ? 5 : 15;
  let labels = '';
  for (let i = 0; i < N; i++) {
    if (i !== past && ((i - past) % every || Math.abs(i - past) < every * 0.6)) continue;
    const d = new Date(at(i));
    const lab = i === past ? 'hoy' : N > 30 ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : String(d.getDate());
    labels += `<text class="ax${i === past ? ' ax-strong' : ''}" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${lab}</text>`;
  }
  // Las líneas, cada una en su tramo: lo estudiado hasta hoy y lo que toca desde hoy
  const line = (arr, y = Y) => { const pts = []; arr.forEach((v, i) => { if (v != null) pts.push([X(i), y(v)]); }); return pts; };
  const area = (pts, cls) => (pts.length > 1 ? `<path class="rv-area ${cls}" d="${smooth(pts)} L${pts[pts.length - 1][0].toFixed(1)},${Y(0)} L${pts[0][0].toFixed(1)},${Y(0)} Z"></path>` : '');
  const xt = X(past);
  let series = `<rect class="rv-future" x="${xt.toFixed(1)}" y="${PADT}" width="${(PADL + plotW - xt).toFixed(1)}" height="${plotH}"></rect>`;
  series += `<line class="rv-today" x1="${xt.toFixed(1)}" x2="${xt.toFixed(1)}" y1="${PADT - 8}" y2="${PADT + plotH}"></line>`;
  if (!hidden.has('done')) { const p = line(done); series += area(p, 'rv-area-done') + (p.length > 1 ? `<path class="rv-line rv-done" d="${smooth(p)}" pathLength="1"></path>` : ''); }
  if (!hidden.has('due')) { const p = line(due); series += area(p, 'rv-area-due') + (p.length > 1 ? `<path class="rv-line rv-due rv-dash" d="${smooth(p)}"></path>` : ''); }
  if (!hidden.has('new') && nw.some(v => v)) { const p = line(nw); if (p.length > 1) series += `<path class="rv-line rv-new rv-dash" d="${smooth(p)}"></path>`; }
  if (!hidden.has('acc')) {
    // Los aciertos, solo donde hubo respuestas (los días sin estudiar parten la línea)
    let run = [];
    const flush = () => { if (run.length > 1) series += `<path class="rv-line rv-acc" d="${smooth(run)}" pathLength="1"></path>`; else if (run.length === 1) series += `<circle class="rv-acc-pt" cx="${run[0][0].toFixed(1)}" cy="${run[0][1].toFixed(1)}" r="2.5"></circle>`; run = []; };
    acc.forEach((v, i) => { if (v == null) flush(); else run.push([X(i), YP(v)]); });
    flush();
  }
  // Cada día, con su detalle
  const slot = plotW / (N - 1);
  let hits = '';
  for (let i = 0; i < N; i++) {
    let v, x;
    if (i < past) { v = plural(done[i], 'repaso', 'repasos'); x = [acc[i] != null ? `${acc[i]} % de aciertos` : '', ms[i] ? `${Math.max(1, Math.round(ms[i] / 60000))} min` : ''].filter(Boolean).join(' · '); }
    else if (i === past) { v = plural(done[i], 'repaso hecho', 'repasos hechos'); x = [`Quedan ${nf.format(due[i])} por repasar${nw[i] ? ` y ${nf.format(nw[i])} nuevas` : ''}`, acc[i] != null ? `${acc[i]} % de aciertos` : ''].filter(Boolean).join(' · '); }
    else { v = `${nf.format(due[i])} por repasar`; x = nw[i] ? `y ${plural(nw[i], 'nueva', 'nuevas')}` : ''; }
    hits += `<rect class="hit rv-hit" x="${(X(i) - slot / 2).toFixed(1)}" y="${PADT}" width="${slot.toFixed(1)}" height="${plotH}" tabindex="0" data-tip-v="${v}" data-tip-l="${i === past ? 'Hoy' : fmtDate(at(i))}"${x ? ` data-tip-x="${x}"` : ''}></rect>`;
  }
  // Cifras para la leyenda y el resumen
  const studied = done.slice(0, past + 1);   // con hoy
  const okN = [...byDay.values()].reduce((a, x) => a + x.ok, 0), allN = [...byDay.values()].reduce((a, x) => a + x.n, 0);
  const dueNext = due.slice(past).reduce((a, b) => a + (b || 0), 0), newNext = nw.slice(past).reduce((a, b) => a + (b || 0), 0);
  let busiest = past;
  for (let i = past; i < N; i++) if (due[i] > due[busiest]) busiest = i;
  return {
    past, future,
    stats: {
      avg: Math.round(studied.reduce((a, b) => a + b, 0) / studied.length), today: done[past],
      daysWith: studied.filter(v => v > 0).length, acc: allN ? Math.round((okN / allN) * 100) : null, dueNext, newNext,
      busiest: due[busiest] ? { n: due[busiest], label: busiest === past ? 'hoy' : fmtDate(at(busiest)) } : null,
    },
    svg: `<svg class="rv-svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Lo que has estudiado los últimos ${past} días y lo que te toca los próximos ${future}">
      <defs><linearGradient id="rvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="rv-stop1"></stop><stop offset="100%" class="rv-stop2"></stop></linearGradient>
      <linearGradient id="rvFillDue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="rv-stop1 rv-stop-due"></stop><stop offset="100%" class="rv-stop2 rv-stop-due"></stop></linearGradient></defs>
      ${grid}${series}${hits}${labels}</svg>`,
  };
}

/* ---------------- Estado de tus tarjetas ----------------
   Barra apilada por madurez: nuevas → aprendiendo → jóvenes → consolidadas. */
export function maturity(cards, progress) {
  const groups = [
    { key: 'm0', label: 'Nuevas', hint: 'aún sin estudiar', n: 0 },
    { key: 'm1', label: 'Aprendiendo', hint: 'vistas hoy o falladas', n: 0 },
    { key: 'm2', label: 'Jóvenes', hint: 'intervalo de menos de 3 semanas', n: 0 },
    { key: 'm3', label: 'Consolidadas', hint: 'intervalo de 3 semanas o más', n: 0 },
  ];
  for (const c of cards) {
    const p = progress.get(c.id);
    if (!p) groups[0].n++;
    else if (!p.reps || p.interval < 1) groups[1].n++;
    else if (p.interval < 21) groups[2].n++;
    else groups[3].n++;
  }
  const total = cards.length || 1;
  const segs = groups.filter(g => g.n).map(g =>
    `<span class="mt-seg ${g.key}" style="flex-grow:${g.n}" tabindex="0" data-tip-v="${plural(g.n, 'tarjeta', 'tarjetas')} · ${Math.round((g.n / total) * 100)} %" data-tip-l="${g.label}: ${g.hint}"></span>`).join('');
  const legend = groups.map(g =>
    `<li><span class="mt-key ${g.key}"></span><span class="mt-lab">${g.label}</span><span class="mt-num">${nf.format(g.n)}</span></li>`).join('');
  const mature = groups[3].n;
  return {
    pct: Math.round((mature / total) * 100),
    html: `<div class="mt-bar" role="img" aria-label="${groups.map(g => `${g.label}: ${g.n}`).join(', ')}">${segs || '<span class="mt-seg m0" style="flex-grow:1"></span>'}</div><ul class="mt-legend">${legend}</ul>`,
  };
}

/* ---------------- Tooltip compartido ---------------- */
export function initChartTips() {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  const v = document.createElement('strong');
  const l = document.createElement('span');
  const xt = document.createElement('small');   // detalle (opcional), debajo del valor
  tip.append(l, v, xt);   // nombre arriba, valor debajo
  document.body.appendChild(tip);
  let hideTimer, shownAt = 0;

  // Con ratón el tooltip sigue al cursor; con teclado o al tocar se coloca sobre la marca
  function show(el, at = null) {
    v.textContent = el.dataset.tipV;      // textContent: nunca HTML
    l.textContent = el.dataset.tipL;
    xt.textContent = el.dataset.tipX || '';
    xt.hidden = !el.dataset.tipX;
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x, y;
    if (at) {
      x = at.x + 14; y = at.y - th - 14;
      if (x + tw > window.innerWidth - 8) x = at.x - tw - 14;
      if (y < 8) y = at.y + 18;
    } else {
      const r = el.getBoundingClientRect();
      x = r.left + r.width / 2 - tw / 2; y = r.top - th - 8;
      if (y < 8) y = r.bottom + 8;
    }
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - th - 8, y));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    document.querySelectorAll('.is-hot').forEach(n => n.classList.remove('is-hot'));
    el.classList.add('is-hot');
    shownAt = window.scrollY;
  }
  function hide() {
    tip.hidden = true;
    document.querySelectorAll('.is-hot').forEach(n => n.classList.remove('is-hot'));
  }
  const target = e => e.target.closest?.('[data-tip-v]');
  const cursor = e => ({ x: e.clientX, y: e.clientY });
  document.addEventListener('pointerover', e => { const el = target(e); if (el && e.pointerType === 'mouse') show(el, cursor(e)); });
  document.addEventListener('pointermove', e => { const el = e.pointerType === 'mouse' && !tip.hidden && target(e); if (el) show(el, cursor(e)); }, { passive: true });
  document.addEventListener('pointerout', e => { if (target(e) && e.pointerType === 'mouse') hide(); });
  document.addEventListener('pointerdown', e => {
    const el = target(e);
    if (el && e.pointerType !== 'mouse') { show(el); clearTimeout(hideTimer); hideTimer = setTimeout(hide, 2200); }
    else if (!el) hide();
  });
  document.addEventListener('focusin', e => { const el = target(e); if (el) show(el); });
  document.addEventListener('focusout', e => { if (target(e)) hide(); });
  // al desplazar la página el tooltip quedaría descolocado: se oculta
  window.addEventListener('scroll', () => { if (!tip.hidden && Math.abs(window.scrollY - shownAt) > 6) hide(); }, { passive: true });
}

// Lleva el calendario al final (lo más reciente) después de pintarlo
export function scrollChartsToEnd(root = document) {
  root.querySelectorAll('[data-scroll-end]').forEach(el => { el.scrollLeft = el.scrollWidth; });
}
