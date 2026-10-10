// Sensación táctil y sonora: vibración, tonos suaves de respuesta y deslizar para valorar.
// Sin dependencias de la interfaz: app.js decide cuándo usarlo (según Ajustes).

/* ---------------- Vibración ---------------- */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const PATTERNS = {
  tick: 6,                   // al cruzar el umbral de un gesto
  ok: 12,                    // «Difícil», «Bien», «Fácil»
  again: [18, 60, 18],       // «Otra vez»
  stroke: 8,                 // trazo correcto (kanji/hanzi)
  miss: 28,                  // trazo fallado
  done: [12, 50, 12, 50, 24] // sesión terminada
};
export function buzz(kind) {
  if (!canVibrate()) return;
  try { navigator.vibrate(PATTERNS[kind] ?? kind); } catch {}
}

/* ---------------- Sonido (Web Audio API) ---------------- */
let audioCtx = null;
export const canAudio = () => typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);

function getAudioContext() {
  if (!canAudio()) return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    try { audioCtx = new Ctx(); } catch { return null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch {}
  }
  return audioCtx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume(); } catch {}
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}

function playTone(ctx, freq, start, dur, peak = 0.07, type = 'sine') {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  } catch {}
}

export function chime(kind) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  switch (kind) {
    case 'again':
      // Tono descendente menor suave (220 Hz -> 175 Hz)
      playTone(ctx, 220, t, 0.12, 0.06);
      playTone(ctx, 175, t + 0.06, 0.16, 0.05);
      break;
    case 'hard':
      // Tono neutro breve (330 Hz)
      playTone(ctx, 330, t, 0.12, 0.06);
      break;
    case 'good':
    case 'ok':
      // Acorde mayor alegre (440 Hz -> 554 Hz)
      playTone(ctx, 440, t, 0.09, 0.07);
      playTone(ctx, 554, t + 0.05, 0.16, 0.08);
      break;
    case 'easy':
      // Triada ascendente brillante (523 Hz -> 659 Hz -> 784 Hz)
      playTone(ctx, 523, t, 0.08, 0.06);
      playTone(ctx, 659, t + 0.04, 0.10, 0.07);
      playTone(ctx, 784, t + 0.08, 0.18, 0.08);
      break;
    case 'done':
      // Arpegio de felicitación al terminar la sesión
      playTone(ctx, 523, t, 0.12, 0.06);
      playTone(ctx, 659, t + 0.07, 0.12, 0.07);
      playTone(ctx, 784, t + 0.14, 0.14, 0.08);
      playTone(ctx, 1046, t + 0.21, 0.28, 0.08);
      break;
    case 'stroke':
      // Trazo de dibujo correcto: micro-ping
      playTone(ctx, 880, t, 0.03, 0.04);
      break;
    case 'miss':
      // Trazo de dibujo fallado: golpe sordo
      playTone(ctx, 160, t, 0.06, 0.05);
      break;
    default:
      playTone(ctx, 440, t, 0.08, 0.05);
  }
}

/* ---------------- Deslizar ---------------- */
// Hace «deslizable» una tarjeta. dirs: { left, right, up } → etiqueta de cada dirección (o nada si no se usa).
// onSwipe(dir) se llama cuando la tarjeta sale de la pantalla. onCross() al cruzar el umbral (para vibrar).
// Solo con el dedo o el lápiz: con el ratón ya están el teclado y los botones.
const SKIP = 'button, a, input, textarea, select, canvas, label, [contenteditable], .say, .hw-box';
export function swipeable(el, { dirs, onSwipe, onCross }) {
  if (!el) return;
  // Si la página no necesita scroll, también se puede deslizar hacia arriba; si no, el gesto vertical es para hacer scroll
  const fits = document.documentElement.scrollHeight <= innerHeight + 4;
  const allowUp = !!dirs.up && fits;
  el.style.touchAction = allowUp ? 'none' : 'pan-y';
  el.classList.add('swipeable');

  let start = null, axis = null, dir = null, armed = false;
  const limit = () => Math.min(120, el.offsetWidth * 0.28);
  const reset = (animate = true) => {
    el.style.transition = animate ? 'transform .2s ease' : '';
    el.style.transform = '';
    el.style.removeProperty('--swipe');
    delete el.dataset.swipe; delete el.dataset.swipeLabel;
    start = axis = dir = null; armed = false;
  };

  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !e.isPrimary || e.target.closest(SKIP)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    axis = dir = null; armed = false;
    el.style.transition = '';
  });

  el.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!axis) {
      if (Math.hypot(dx, dy) < 10) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'y' && !(allowUp && dy < 0)) { start = null; return; }   // es un scroll, no un gesto
      try { el.setPointerCapture(e.pointerId); } catch {}
    }
    const d = axis === 'x' ? dx : Math.min(0, dy);
    dir = axis === 'x' ? (dx < 0 ? 'left' : 'right') : 'up';
    if (!dirs[dir]) { el.style.transform = `translate(${axis === 'x' ? d * 0.15 : 0}px, ${axis === 'y' ? d * 0.15 : 0}px)`; return; }
    const p = Math.min(1, Math.abs(d) / limit());
    el.style.transform = axis === 'x' ? `translateX(${dx}px) rotate(${dx / 22}deg)` : `translateY(${dy}px)`;
    el.style.setProperty('--swipe', p.toFixed(2));
    el.dataset.swipe = dir; el.dataset.swipeLabel = dirs[dir];
    if (p >= 1 && !armed) { armed = true; onCross?.(); }
    else if (p < 1) armed = false;
  });

  const end = e => {
    if (!start || e.pointerId !== start.id) return;
    if (armed && dir && dirs[dir]) {
      const out = dir === 'left' ? 'translateX(-130vw) rotate(-18deg)' : dir === 'right' ? 'translateX(130vw) rotate(18deg)' : 'translateY(-130vh)';
      const d = dir;
      el.style.transition = 'transform .2s ease-in';
      el.style.transform = out;
      start = null;
      setTimeout(() => onSwipe(d), 170);
    } else reset();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { if (start) reset(); });
}
