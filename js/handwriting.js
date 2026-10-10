// Escritura a mano: corrección trazo a trazo con Hanzi Writer (kanji y hanzi)
// y lienzo libre para cualquier otro alfabeto.
//
// Créditos:
//  - Hanzi Writer, de David Chanin (MIT) — https://hanziwriter.org — copia local en js/vendor/
//  - Trazos japoneses: hanzi-writer-data-jp (datos de animCJK y Make Me A Hanzi; licencias Arphic y LGPL)
//  - Trazos chinos: hanzi-writer-data (Make Me A Hanzi; licencia Arphic)
// Los trazos se descargan de jsDelivr la primera vez y el service worker los guarda para usarlos sin conexión.

import { isCJK } from './cardtypes.js';

const HW_SRC = 'js/vendor/hanzi-writer.min.js';
const DATA = {
  ja: ch => `https://cdn.jsdelivr.net/npm/@jamsch/hanzi-writer-data-jp@0.0.3/${encodeURIComponent(ch)}.json`,
  zh: ch => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(ch)}.json`,
};

let hwLoading = null;
export function loadHanziWriter() {
  if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
  if (!hwLoading) hwLoading = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = HW_SRC;
    s.onload = () => ok(window.HanziWriter);
    s.onerror = () => { hwLoading = null; ko(new Error('No se pudo cargar Hanzi Writer')); };
    document.head.appendChild(s);
  });
  return hwLoading;
}

const cache = new Map();
// Datos de trazos de un carácter. Para japonés se prueban primero los japoneses y luego los chinos; para chino, al revés.
export async function strokeData(ch, lang = '') {
  const order = lang.startsWith('zh') ? ['zh', 'ja'] : ['ja', 'zh'];
  const key = order[0] + ch;
  if (cache.has(key)) return cache.get(key);
  let data = null;
  for (const src of order) {
    try {
      const r = await fetch(DATA[src](ch));
      if (r.ok) { data = await r.json(); break; }
    } catch { /* sin conexión o no existe */ }
  }
  cache.set(key, data);
  return data;
}

// Caracteres a escribir y si se pueden corregir trazo a trazo
export function charsOf(text) { return [...String(text || '')].filter(ch => /\S/.test(ch)); }
export async function canQuiz(chars, lang) {
  if (!chars.length || chars.length > 8 || !chars.every(isCJK)) return false;
  try {
    await loadHanziWriter();
    const all = await Promise.all(chars.map(c => strokeData(c, lang)));
    return all.every(Boolean);
  } catch { return false; }
}

function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return { fg: v('--fg') || '#37352F', line: v('--line-strong') || '#D9D8D4', accent: v('--accent') || '#2383E2', muted: v('--faint') || '#A5A29B' };
}

function writerFor(el, ch, lang, size, extra = {}) {
  const c = theme();
  return window.HanziWriter.create(el, ch, {
    width: size, height: size, padding: Math.round(size * 0.06),
    strokeColor: c.fg, outlineColor: c.line, drawingColor: c.accent, highlightColor: c.accent, radicalColor: null,
    drawingWidth: Math.max(14, Math.round(size / 14)), showHintAfterMisses: 3, highlightOnComplete: true,
    strokeAnimationSpeed: 1.2, delayBetweenStrokes: 220,
    charDataLoader: (char, onLoad, onError) => strokeData(char, lang).then(d => (d ? onLoad(d) : onError(new Error('sin datos')))),
    ...extra,
  });
}

// Práctica trazo a trazo, carácter a carácter. Devuelve controles { peek(), stop() }.
export function startQuiz(box, chars, lang, { size = 280, guide = false, onProgress, onDone, onStroke }) {
  let i = 0, mistakes = 0, writer = null, stopped = false;
  const next = () => {
    if (stopped) return;
    if (i >= chars.length) { onDone({ mistakes, n: chars.length }); return; }
    box.innerHTML = '';
    onProgress?.(i, chars.length);
    writer = writerFor(box, chars[i], lang, size, { showCharacter: false, showOutline: guide });
    quiz();
  };
  const quiz = () => writer.quiz({
    onCorrectStroke: () => onStroke?.(true),
    onMistake: () => onStroke?.(false),
    onComplete: summary => { mistakes += summary.totalMistakes; i++; setTimeout(next, 450); },
  });
  next();
  return {
    peek() {
      if (!writer) return;
      writer.cancelQuiz();
      writer.animateCharacter({ onComplete: () => { setTimeout(() => { if (stopped) return; writer.hideCharacter(); quiz(); }, 500); } });
    },
    stop() { stopped = true; try { writer?.cancelQuiz(); } catch {} },
  };
}

// Animación del orden de trazos (en bucle) para uno o varios caracteres
export function animateChars(container, chars, lang, size = 140) {
  container.innerHTML = '';
  const writers = [];
  chars.forEach(ch => {
    const cell = document.createElement('div');
    cell.className = 'hw-box hw-anim';
    cell.style.width = cell.style.height = size + 'px';
    container.appendChild(cell);
    const w = writerFor(cell, ch, lang, size, { showCharacter: false, showOutline: true });
    w.loopCharacterAnimation();
    writers.push(w);
  });
  return () => writers.forEach(w => { try { w.pauseAnimation(); } catch {} });
}

// Lienzo libre: dibujar con dedo, lápiz o ratón
export function startCanvas(canvas, { size = 280 }) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 34);
  ctx.strokeStyle = theme().fg;
  let drawing = false, last = null, dirty = false;
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    drawing = true; last = pos(e);
    ctx.beginPath(); ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    dirty = true;
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return {
    clear() { ctx.clearRect(0, 0, size, size); dirty = false; },
    isEmpty: () => !dirty,
    // La imagen se guarda con fondo, para verla bien en modo claro y oscuro
    image() {
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      const o = out.getContext('2d');
      o.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
      o.fillRect(0, 0, out.width, out.height);
      o.drawImage(canvas, 0, 0);
      return out.toDataURL('image/png');
    },
  };
}
