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
    html: `<div class="hm-wrap"><svg class="hm-days" width="26" height="${H}" viewBox="0 0 26 ${H}" aria-hidden="true">${days}</svg>
      <div class="hm-scroll" data-scroll-end><svg class="hm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Calendario de actividad: ${plural(total, 'repaso', 'repasos')} en ${plural(active, 'día', 'días')} del último año">${months}${cells}</svg></div></div>
      <div class="hm-legend"><span>Menos</span>${legend}<span>Más</span></div>`,
  };
}

/* ---------------- Previsión: tarjetas que tocan cada día ----------------
   Columnas para los próximos N días; "Hoy" incluye las atrasadas. */
export function forecast(progress, width, days = 14) {
  const now = Date.now(), today = startOfDay(now);
  const counts = new Array(days).fill(0);
  for (const p of progress.values()) {
    const i = p.due <= now ? 0 : Math.round((startOfDay(p.due) - today) / DAY);
    if (i >= 0 && i < days) counts[i]++;
  }
  const max = Math.max(1, ...counts);
  const H = 132, BASE = 104, PLOT = 84, PADL = 4, PADR = 4;
  const slot = (width - PADL - PADR) / days;
  const bw = Math.min(22, Math.max(6, slot * 0.62));
  const peak = counts.indexOf(Math.max(...counts));
  let bars = '', labels = '';
  counts.forEach((n, i) => {
    const t = startOfDay(today + i * DAY + DAY / 2);
    const cx = PADL + slot * i + slot / 2;
    const h = n ? Math.max(4, (n / max) * PLOT) : 0;
    const x = cx - bw / 2, y = BASE - h;
    const r = Math.min(4, h / 2, bw / 2);
    const tip = `data-tip-v="${plural(n, 'tarjeta', 'tarjetas')}" data-tip-l="${i === 0 ? 'Hoy (incluye atrasadas)' : fmtDate(t)}"`;
    // barra con la parte de arriba redondeada y la base recta
    if (h) bars += `<path class="fc-bar${i === 0 ? ' fc-today' : ''}" d="M${x},${BASE} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${BASE} Z"></path>`;
    // zona sensible más grande que la barra
    bars += `<rect class="hit" x="${cx - slot / 2}" y="${BASE - PLOT - 14}" width="${slot}" height="${PLOT + 14}" tabindex="0" ${tip}></rect>`;
    if (n && i === peak) bars += `<text class="fc-val" x="${cx}" y="${y - 5}" text-anchor="middle">${nf.format(n)}</text>`;
    const lab = i === 0 ? 'hoy' : String(new Date(t).getDate());
    const show = i === 0 || slot >= 18 || i % 2 === 0;
    if (show) labels += `<text class="ax${i === 0 ? ' ax-strong' : ''}" x="${cx}" y="${BASE + 17}" text-anchor="middle">${lab}</text>`;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  return `<svg class="fc-svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Previsión de repasos: ${plural(total, 'tarjeta', 'tarjetas')} en los próximos ${days} días">
    <line class="baseline" x1="0" x2="${width}" y1="${BASE + .5}" y2="${BASE + .5}"></line>${bars}${labels}</svg>`;
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
  tip.append(v, l);
  document.body.appendChild(tip);
  let hideTimer, shownAt = 0;

  function show(el) {
    v.textContent = el.dataset.tipV;      // textContent: nunca HTML
    l.textContent = el.dataset.tipL;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
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
  document.addEventListener('pointerover', e => { const el = target(e); if (el && e.pointerType === 'mouse') show(el); });
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
