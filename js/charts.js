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
  const sx = Math.max(10, Math.floor((avail + 3) / weeks));
  const gap = sx >= 40 ? 6 : sx >= 22 ? 4 : 3;
  const cw = sx - gap, ch = Math.min(cw, weeks <= 5 ? 30 : weeks <= 13 ? 24 : 20);
  const sy = ch + gap;
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

/* ---------------- Tus repasos: los próximos días, por estado de las tarjetas ----------------
   Líneas suaves (una por estado: nuevas, aprendiendo, jóvenes, consolidadas) y el total con su área. */
export const RV_PERIODS = [{ d: 7, label: '7 días' }, { d: 14, label: '14 días' }, { d: 30, label: '30 días' }, { d: 90, label: '3 meses' }];
export const RV_SERIES = [
  { key: 'tot', label: 'Total' },
  { key: 'm1', label: 'Aprendiendo' }, { key: 'm2', label: 'Jóvenes' }, { key: 'm3', label: 'Consolidadas' }, { key: 'm0', label: 'Nuevas' },
];
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
// cards, progress; days; width; newToday (nuevas que aún caben hoy); newPerDay; hidden (Set de series ocultas)
export function reviewsChart({ cards, progress, days = 14, width = 600, newToday = 0, newPerDay = 0, hidden = new Set() }) {
  const now = Date.now(), today = startOfDay(now);
  const S = Object.fromEntries(RV_SERIES.map(s => [s.key, new Array(days).fill(0)]));
  for (const c of cards) {
    const p = progress.get(c.id);
    if (!p) continue;
    const i = p.due <= now ? 0 : Math.round((startOfDay(p.due) - today) / DAY);
    if (i < 0 || i >= days) continue;
    S[!p.reps || p.interval < 1 ? 'm1' : p.interval < 21 ? 'm2' : 'm3'][i]++;
  }
  // Las nuevas que irán entrando: las que caben hoy y luego las del límite diario, mientras queden
  let pool = cards.filter(c => !progress.has(c.id)).length;
  for (let i = 0; i < days && pool > 0; i++) { const k = Math.min(pool, i === 0 ? newToday : newPerDay); S.m0[i] = k; pool -= k; }
  for (let i = 0; i < days; i++) S.tot[i] = S.m0[i] + S.m1[i] + S.m2[i] + S.m3[i];
  const H = 210, PADT = 14, PADB = 26, PADL = 34, PADR = 10, plotH = H - PADT - PADB, plotW = Math.max(120, width - PADL - PADR);
  const visible = RV_SERIES.filter(s => !hidden.has(s.key));
  const top = niceMax(Math.max(1, ...visible.flatMap(s => S[s.key])));
  const X = i => PADL + (days === 1 ? plotW / 2 : (i / (days - 1)) * plotW), Y = v => PADT + plotH - (v / top) * plotH;
  // Rejilla y ejes
  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = (top / 4) * k, y = Y(v);
    grid += `<line class="rv-grid${k === 0 ? ' rv-base' : ''}" x1="${PADL}" x2="${PADL + plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="ax" x="${PADL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${nf.format(Math.round(v * 10) / 10)}</text>`;
  }
  const every = days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 5 : 15;
  let labels = '';
  for (let i = 0; i < days; i++) {
    if (i % every) continue;
    const t = startOfDay(today + i * DAY + DAY / 2), dt = new Date(t);
    const lab = i === 0 ? 'hoy' : days > 30 ? `${dt.getDate()} ${MONTHS[dt.getMonth()]}` : String(dt.getDate());
    labels += `<text class="ax${i === 0 ? ' ax-strong' : ''}" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${lab}</text>`;
  }
  // Las series: el total con su área, y una línea por estado
  const dots = days <= 30;
  let series = '';
  for (const s of [...RV_SERIES].reverse()) {
    if (hidden.has(s.key)) continue;
    const pts = S[s.key].map((v, i) => [X(i), Y(v)]);
    const d = smooth(pts);
    if (s.key === 'tot') series += `<path class="rv-area" d="${d} L${X(days - 1).toFixed(1)},${Y(0)} L${X(0).toFixed(1)},${Y(0)} Z"></path>`;
    series += `<path class="rv-line rv-${s.key}" d="${d}" pathLength="1"></path>`;
    if (dots) series += pts.map(([x, y], i) => `<circle class="rv-dot rv-${s.key}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.key === 'tot' ? 4 : 2.6}" style="animation-delay:${(i / days) * 0.5}s"></circle>`).join('');
  }
  // Zonas sensibles: cada día, con todo lo que toca
  const slot = days === 1 ? plotW : plotW / (days - 1);
  let hits = '';
  for (let i = 0; i < days; i++) {
    const t = startOfDay(today + i * DAY + DAY / 2);
    const detail = RV_SERIES.slice(1).filter(s => S[s.key][i]).map(s => `${s.label}: ${nf.format(S[s.key][i])}`).join(' · ');
    hits += `<rect class="hit rv-hit" x="${(X(i) - slot / 2).toFixed(1)}" y="${PADT}" width="${slot.toFixed(1)}" height="${plotH}" tabindex="0"
      data-tip-v="${plural(S.tot[i], 'tarjeta', 'tarjetas')}" data-tip-l="${i === 0 ? 'Hoy (incluye atrasadas)' : fmtDate(t)}" ${detail ? `data-tip-x="${detail}"` : ''}></rect>`;
  }
  const total = S.tot.reduce((a, b) => a + b, 0), peak = S.tot.indexOf(Math.max(...S.tot));
  return {
    total, peak: { i: peak, n: S.tot[peak], label: peak === 0 ? 'hoy' : fmtDate(startOfDay(today + peak * DAY + DAY / 2)) },
    sums: Object.fromEntries(RV_SERIES.map(s => [s.key, S[s.key].reduce((a, b) => a + b, 0)])),
    svg: `<svg class="rv-svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Previsión: ${plural(total, 'tarjeta', 'tarjetas')} en los próximos ${days} días">
      <defs><linearGradient id="rvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="rv-stop1"></stop><stop offset="100%" class="rv-stop2"></stop></linearGradient></defs>
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
