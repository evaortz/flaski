// Gráficos del panel: actividad tipo GitHub, tu progreso y estado de las tarjetas.
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
  { id: 'm1', label: '1 mes', short: '1 m', weeks: 5, text: 'el último mes' },
  { id: 'm3', label: '3 meses', short: '3 m', weeks: 13, text: 'los últimos 3 meses' },
  { id: 'm6', label: '6 meses', short: '6 m', weeks: 26, text: 'los últimos 6 meses' },
  { id: 'y1', label: 'Año', short: '1 a', weeks: 53, text: 'el último año' },
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

/* ---------------- Tu progreso ----------------
   Cuántas tarjetas te sabes cada día: franjas apiladas (consolidadas, jóvenes y aprendiendo) y, rayado,
   lo que te queda por aprender hasta el total. Se reconstruye con el historial de respuestas (cada una
   guarda el intervalo con el que dejó la tarjeta), sin guardar nada nuevo. */
// Una curva suave que pasa por todos los puntos sin pasarse (monótona)
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
export const PG_PERIODS = [
  { id: 'm1', label: '1 m', title: 'el último mes', days: 30 },
  { id: 'm3', label: '3 m', title: 'los últimos 3 meses', days: 90 },
  { id: 'y1', label: '1 a', title: 'el último año', days: 365 },
  { id: 'all', label: 'Todo', title: 'todo tu historial', days: 0 },
];
const stage = ivl => (ivl < 1 ? 1 : ivl < 21 ? 2 : 3);     // aprendiendo · jóvenes · consolidadas
const toMs = v => (v == null || v === '' ? NaN : typeof v === 'number' ? v : new Date(v).getTime());
const shortDate = (t, year = false) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`; };

// Cada día del periodo: { t, m1, m2, m3, total } y las tarjetas que entraron ese día por mazo
export function progressSeries({ events = [], cards = [], progress = new Map(), period = 'm3', now = Date.now() }) {
  const today = startOfDay(now);
  const ids = new Set(cards.map(c => c.id));
  const byCard = new Map();
  for (const e of events) {
    if (!ids.has(e.card_id) || !Number.isFinite(e.t) || e.t > now) continue;
    if (!byCard.has(e.card_id)) byCard.set(e.card_id, []);
    byCard.get(e.card_id).push(e);
  }
  const changes = [], born = [];   // [t, id, etapa] · [t, mazo]
  for (const c of cards) {
    const p = progress.get(c.id), evs = byCard.get(c.id), seen = toMs(p?.firstSeen ?? p?.first_seen);
    let first = Infinity;
    if (evs) {
      evs.sort((a, b) => a.t - b.t);
      // Si el historial empieza a medias (respuestas de antes de guardarlas), la tarjeta ya estaba así desde que la viste
      if (evs[0].state !== 'new' && seen < evs[0].t) { changes.push([seen, c.id, stage(evs[0].last_ivl || 0)]); first = seen; }
      for (const e of evs) changes.push([e.t, c.id, stage(e.ivl || 0)]);
      first = Math.min(first, evs[0].t);
    } else if (p && Number.isFinite(seen)) { changes.push([seen, c.id, stage(p.interval || 0)]); first = seen; }
    const created = toMs(c.created_at);
    born.push([Math.min(Number.isFinite(created) ? created : -Infinity, first), c.deck_id]);
  }
  changes.sort((a, b) => a[0] - b[0]);
  born.sort((a, b) => a[0] - b[0]);
  const p = PG_PERIODS.find(x => x.id === period) || PG_PERIODS[1];
  let days = p.days;
  if (!days) {
    const t0 = Math.min(born.find(b => Number.isFinite(b[0]))?.[0] ?? today, changes[0]?.[0] ?? today);
    days = Math.min(3650, Math.max(14, Math.round((today - startOfDay(t0)) / DAY) + 1));
  }
  const at = i => startOfDay(today - (days - 1 - i) * DAY + DAY / 2);
  const state = new Map(), cnt = [0, 0, 0, 0];
  const out = [];
  let ci = 0, bi = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const t = at(i), end = startOfDay(t + DAY * 1.5);
    const adds = new Map();
    while (bi < born.length && born[bi][0] < end) {
      if (i > 0 && born[bi][0] >= t) adds.set(born[bi][1], (adds.get(born[bi][1]) || 0) + 1);
      total++; bi++;
    }
    while (ci < changes.length && changes[ci][0] < end) {
      const [, id, s] = changes[ci++], old = state.get(id);
      if (old) cnt[old]--;
      cnt[s]++; state.set(id, s);
    }
    out.push({ t, m1: cnt[1], m2: cnt[2], m3: cnt[3], total, adds });
  }
  return out;
}

// Lo que toca los próximos días (repasos, sin las nuevas), para la línea de debajo del gráfico
export function nextLine(cards, progress, now = Date.now()) {
  const today = startOfDay(now), due = new Array(8).fill(0);
  for (const c of cards) {
    const p = progress.get(c.id);
    if (!p) continue;
    const j = p.due <= now ? 0 : Math.round((startOfDay(p.due) - today) / DAY);
    if (j >= 0 && j < 8) due[j]++;
  }
  let big = 2;
  for (let j = 2; j < 8; j++) if (due[j] > due[big]) big = j;
  const parts = [due[1] ? `Mañana te ${due[1] === 1 ? 'toca' : 'tocan'} <b>${nf.format(due[1])}</b>` : 'Mañana no te toca nada'];
  if (due[big] > due[1]) parts.push(`lo más cargado de la semana, el ${WEEKDAYS[new Date(startOfDay(today + big * DAY + DAY / 2)).getDay()]} (${nf.format(due[big])})`);
  return parts.join(' · ');
}

const known = d => d.m2 + d.m3;
const delta = n => `<span class="${n < 0 ? 'lv-dn' : 'lv-up'}">${n < 0 ? '↓' : '↑'} ${nf.format(Math.abs(n))}</span>`;
// La frase de debajo de la cifra: lo de todo el periodo, o lo del día por el que se pasa
function pgSub(s, i) {
  if (i == null) {
    const last = s[s.length - 1], first = s[0], d = known(last) - known(first), yr = new Date(first.t).getFullYear() !== new Date(last.t).getFullYear();
    if (!last.total) return '';
    if (!d) return `Igual que el ${shortDate(first.t, yr)}`;
    const perWeek = Math.round(d / (s.length / 7));
    return `${delta(d)} desde el ${shortDate(first.t, yr)}${s.length >= 21 && perWeek >= 1 ? ` · unas ${nf.format(perWeek)} más por semana` : ''}`;
  }
  const x = s[i], w = known(x) - known(s[Math.max(0, i - 7)]);
  const parts = [x.m3 && `${nf.format(x.m3)} consolidadas`, x.m2 && `${nf.format(x.m2)} jóvenes`, x.m1 && `${nf.format(x.m1)} aprendiendo`].filter(Boolean);
  return [i >= 7 && (w ? `${delta(w)} esa semana` : 'igual que la semana anterior'), parts.join(' · ')].filter(Boolean).join(' · ');
}
const pgOf = (x, past) => `de ${plural(x.total, 'tarjeta', 'tarjetas')} ${known(x) === 1 ? (past ? 'te la sabías' : 'te la sabes') : (past ? 'te las sabías' : 'te las sabes')}`;

// Pinta el gráfico (con su cabecera) en el contenedor. opts: { series, width, title, tabs, next, deckName, animate }
export function progressView(host, { series: s, width = 600, title = 'Tu progreso', tabs = '', next = '', deckName = () => '', animate = true }) {
  const N = s.length, last = s[N - 1];
  const narrow = width < 420, LW = narrow ? 96 : 116;
  const H = 206, T = 14, B = 180, L = 1, R = Math.max(120, width - LW), W = R - L;
  const mx = Math.max(1, ...s.map(x => x.total)) * 1.14;
  const X = i => L + (N > 1 ? (i / (N - 1)) * W : W), Y = v => B - (v / mx) * (B - T);
  // Con muchos días, un punto cada varios (siempre con el último)
  const step = Math.max(1, Math.ceil(N / 160)), idx = [];
  for (let i = N - 1; i >= 0; i -= step) idx.unshift(i);
  if (idx[0] !== 0 && N > 1) idx.unshift(0);
  const lv = [x => x.m3, x => x.m3 + x.m2, x => x.m3 + x.m2 + x.m1, x => x.total];
  const P = f => idx.map(i => [X(i), Y(f(s[i]))]);
  const back = p => smooth([...p].reverse()).replace(/^M/, 'L');
  const zero = idx.map(i => [X(i), B]);
  const lines = lv.map(P);
  const band = (lo, hi, cls) => `<path class="${cls}" d="${smooth(hi)} ${back(lo)} Z"></path>`;
  const pid = `pgHx${Math.random().toString(36).slice(2, 7)}`;
  let g = `<defs><pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="pg-hx" x1="0" y1="0" x2="0" y2="5"></line></pattern></defs>`;
  g += `<g class="pg-plot${animate ? ' pg-anim' : ''}">`;
  g += band(lines[2], lines[3], 'pg-rest').replace('class="pg-rest"', `class="pg-rest" fill="url(#${pid})"`);
  g += band(lines[1], lines[2], 'pg-b1') + band(lines[0], lines[1], 'pg-b2') + band(zero, lines[0], 'pg-b3');
  g += lines.slice(0, 3).map(p => `<path class="pg-sep" d="${smooth(p)}"></path>`).join('') + `<path class="pg-tot" d="${smooth(lines[3])}"></path></g>`;
  g += `<line class="pg-base" x1="${L}" x2="${R}" y1="${B}" y2="${B}"></line>`;
  // Fechas: semanas en un mes; principios de mes en adelante (con el año en enero si hay más de un año)
  let ticks = [];
  if (N <= 31) for (let i = N - 1; i >= 0; i -= 7) ticks.unshift([i, shortDate(s[i].t)]);
  else for (let i = 1; i < N; i++) {
    const d = new Date(s[i].t);
    if (d.getDate() === 1 || (i === 1 && N <= 120 && d.getDate() <= 3)) ticks.push([i, d.getMonth() === 0 && N > 365 ? String(d.getFullYear()) : MONTHS[d.getMonth()]]);
  }
  let lastX = -99, axis = '';
  for (const [i, lab] of ticks) {
    const x = X(i);
    if (x - lastX < (N > 400 ? 34 : 40) || x > R - 14) continue;
    axis += `<text class="ax" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${x < 14 ? 'start' : 'middle'}">${lab}</text>`;
    lastX = x;
  }
  // Notas: el día que entraron muchas tarjetas de un mazo y el último hito de lo que te sabes
  let notes = '';
  const adds = [];
  for (let i = 1; i < N; i++) for (const [deck, n] of s[i].adds) if (n >= Math.max(5, s[i - 1].total * 0.1)) adds.push({ i, deck, n });
  const noted = adds.sort((a, b) => b.n - a.n).slice(0, 2).filter(a => deckName(a.deck));
  for (const a of noted) {
    const x = X(a.i), y = Y(s[a.i].total), name = deckName(a.deck);
    const end = x > R - 130;
    notes += `<circle class="pg-pin" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2"></circle><text class="pg-note" x="${(x + (end ? -6 : 6)).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="${end ? 'end' : 'start'}">+${nf.format(a.n)} de ${name.length > 20 ? name.slice(0, 19) + '…' : name}</text>`;
  }
  const marks = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  let hit = null;
  for (let i = 1; i < N; i++) for (const m of marks) if (known(s[i - 1]) < m && known(s[i]) >= m) hit = { i, m };
  if (hit && hit.i < N - 2 && !noted.some(a => Math.abs(X(a.i) - X(hit.i)) < 90)) {
    const x = X(hit.i), y = Y(known(s[hit.i]));
    notes += `<circle class="pg-pin pg-pin-k" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"></circle><text class="pg-note" x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="${x < 50 ? 'start' : x > R - 50 ? 'end' : 'middle'}">llegas a ${nf.format(hit.m)}</text>`;
  }
  // Los nombres de cada franja, a la derecha (sin pisarse)
  const vals = x => [x.total - x.m1 - x.m2 - x.m3, x.m1, x.m2, x.m3];
  const keys = [['rest', 'Por aprender'], ['m1', 'Aprendiendo'], ['m2', 'Jóvenes'], ['m3', 'Consolidadas']];
  const yl = [(Y(lv[2](last)) + Y(last.total)) / 2, (Y(lv[1](last)) + Y(lv[2](last))) / 2, (Y(lv[0](last)) + Y(lv[1](last))) / 2, (B + Y(lv[0](last))) / 2];
  const on = vals(last).map(v => v > 0);
  const ys = yl.map((y, k) => (on[k] ? y : null));
  let prev = -Infinity;
  for (let k = 0; k < 4; k++) if (ys[k] != null) { ys[k] = Math.max(ys[k], prev + 15); prev = ys[k]; }
  let over = Infinity;
  for (let k = 3; k >= 0; k--) if (ys[k] != null) { ys[k] = Math.min(ys[k], over - 15, B - 2); over = ys[k]; }
  const labels = keys.map(([k, lab], j) => (ys[j] == null ? '' : `<text class="pg-lab pg-lab-${k}" x="${R + 10}" y="${(ys[j] + 4).toFixed(1)}">${lab} <tspan class="pg-lab-n" data-k="${j}">${nf.format(vals(last)[j])}</tspan></text>`)).join('');
  const dot = `<circle class="pg-dot pg-now" cx="${X(N - 1).toFixed(1)}" cy="${Y(known(last)).toFixed(1)}" r="3.5"></circle>`;
  const hover = { x: idx.map(i => +X(i).toFixed(1)), y: idx.map(i => +Y(known(s[i])).toFixed(1)), i: idx };
  const svg = `<svg class="pg-svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="${title}: te sabes ${nf.format(known(last))} de ${plural(last.total, 'tarjeta', 'tarjetas')}">
    ${g}${notes}${axis}${labels}${dot}
    <line class="pg-cur" x1="0" x2="0" y1="${T}" y2="${B}"></line><circle class="pg-dot pg-cd" r="3.5"></circle>
    <rect class="pg-hit" x="${L}" y="0" width="${W}" height="${B + 4}" tabindex="0" aria-label="Recorre los días con las flechas"></rect></svg>`;
  host.innerHTML = `<div class="lv-h"><h2 class="lv-k">${title}<span class="lv-day"> · hoy</span></h2>${tabs}</div>
    <div class="lv-big"><b class="lv-n">${nf.format(known(last))}</b><span class="lv-of">${pgOf(last)}</span></div>
    <p class="lv-sub">${pgSub(s)}</p>${svg}${next ? `<p class="pg-next">${next}</p>` : ''}`;
  const el = host.querySelector('.pg-svg');
  el._pg = { s, hover, vals };
}

// Al pasar el ratón (o arrastrar el dedo) por el gráfico, la cabecera cuenta ese día
export function initProgressHover() {
  const box = svg => svg.closest('.lv');
  function show(svg, k) {
    const d = svg._pg;
    if (!d) return;
    k = Math.max(0, Math.min(d.hover.x.length - 1, k));
    svg._k = k;
    const i = d.hover.i[k], x = d.s[i], isLast = i === d.s.length - 1, b = box(svg);
    const cur = svg.querySelector('.pg-cur'), cd = svg.querySelector('.pg-cd');
    cur.setAttribute('x1', d.hover.x[k]); cur.setAttribute('x2', d.hover.x[k]);
    cd.setAttribute('cx', d.hover.x[k]); cd.setAttribute('cy', d.hover.y[k]);
    svg.classList.add('is-hover');
    b.querySelector('.lv-day').textContent = ` · ${isLast ? 'hoy' : fmtDate(x.t)}`;
    b.querySelector('.lv-n').textContent = nf.format(known(x));
    b.querySelector('.lv-of').textContent = pgOf(x, !isLast);
    b.querySelector('.lv-sub').innerHTML = isLast ? pgSub(d.s) : pgSub(d.s, i);
    d.vals(x).forEach((v, j) => { const t = svg.querySelector(`.pg-lab-n[data-k="${j}"]`); if (t) t.textContent = nf.format(v); });
  }
  function reset(svg) {
    const d = svg?._pg;
    if (!d) return;
    show(svg, d.hover.x.length - 1);
    svg.classList.remove('is-hover');
    svg._k = null;
  }
  const at = (svg, e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width, xs = svg._pg.hover.x;
    let k = 0;
    for (let j = 1; j < xs.length; j++) if (Math.abs(xs[j] - x) < Math.abs(xs[k] - x)) k = j;
    return k;
  };
  let timer;
  document.addEventListener('pointermove', e => {
    const h = e.target.closest?.('.pg-hit');
    if (h) { clearTimeout(timer); show(h.ownerSVGElement, at(h.ownerSVGElement, e)); }
  }, { passive: true });
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest?.('.pg-hit');
    if (h) { clearTimeout(timer); show(h.ownerSVGElement, at(h.ownerSVGElement, e)); }
  });
  document.addEventListener('pointerout', e => {
    const h = e.target.closest?.('.pg-hit');
    if (h) { clearTimeout(timer); timer = setTimeout(() => reset(h.ownerSVGElement), e.pointerType === 'mouse' ? 0 : 1500); }
  });
  document.addEventListener('keydown', e => {
    const h = e.target.closest?.('.pg-hit');
    if (!h) return;
    const svg = h.ownerSVGElement, n = svg._pg?.hover.x.length || 0, k = svg._k ?? n - 1;
    const to = { ArrowLeft: k - 1, ArrowRight: k + 1, Home: 0, End: n - 1, PageUp: k - 7, PageDown: k + 7 }[e.key];
    if (to == null) return;
    e.preventDefault();
    show(svg, to);
  });
  document.addEventListener('focusout', e => { const h = e.target.closest?.('.pg-hit'); if (h) reset(h.ownerSVGElement); });
}

/* ---------------- Cabeceras que cuentan lo que señalas ----------------
   En las tarjetas con data-live, al pasar por una marca (con data-tip-*) la cabecera muestra ese dato
   en vez de sacar un tooltip: «.lv-day» (de qué es), «.lv-n» (la cifra), «.lv-of» y «.lv-sub». */
export function liveShow(el) {
  const b = el.closest('[data-live]');
  if (!b) return false;
  const parts = ['.lv-day', '.lv-n', '.lv-of', '.lv-sub'].map(q => b.querySelector(q));
  if (!b._def) b._def = parts.map(p => p?.innerHTML ?? '');
  const m = /^([\d.,]+(?:\s?%)?)\s*(.*)$/.exec(el.dataset.tipV || '');
  const vals = [` · ${el.dataset.tipL || ''}`, m ? m[1] : el.dataset.tipV, m ? m[2] : '', el.dataset.tipX || ''];
  parts.forEach((p, k) => { if (p) p.textContent = vals[k]; });
  b.classList.add('is-live');
  return true;
}
export function liveReset(b) {
  if (!b?._def) return;
  ['.lv-day', '.lv-n', '.lv-of', '.lv-sub'].forEach((q, k) => { const p = b.querySelector(q); if (p) p.innerHTML = b._def[k]; });
  b._def = null;
  b.classList.remove('is-live');
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
    document.querySelectorAll('.is-hot').forEach(n => n.classList.remove('is-hot'));
    // En las tarjetas con cabecera viva, lo cuenta la cabecera
    if (liveShow(el)) { tip.hidden = true; el.classList.add('is-hot'); return; }
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
    document.querySelectorAll('.is-live').forEach(liveReset);
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
