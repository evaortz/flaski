// FSRS-5 (Free Spaced Repetition Scheduler), el algoritmo que usa Anki desde la versión 23.10.
// Modela cada tarjeta con dos números:
//   estabilidad S: días hasta que la probabilidad de recordarla baja al 90 %
//   dificultad D: de 1 (fácil) a 10 (difícil)
// y programa el siguiente repaso para el día en que la probabilidad de recordarla baje a la retención
// deseada (90 % por defecto). Parámetros: los de FSRS-5 por defecto. https://github.com/open-spaced-repetition
// Sin dependencias de la interfaz, así que se puede probar aparte.

export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81;   // con estos valores, R(S días, S) = 90 %
const DAY = 864e5;
const clampD = d => Math.min(10, Math.max(1, d));

// Probabilidad de recordar tras t días con estabilidad S
export const retrievability = (t, S) => Math.pow(1 + (FACTOR * t) / S, DECAY);
// Días hasta que la probabilidad de recordar baja a r
export const intervalFor = (S, r = 0.9) => (S / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
export const initStability = g => Math.max(0.1, W[g - 1]);
export const initDifficulty = g => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
export function nextDifficulty(D, g) {
  const d = D - W[6] * (g - 3);
  const damped = D + (d - D) * ((10 - D) / 9);
  return clampD(W[7] * initDifficulty(4) + (1 - W[7]) * damped);
}
export function recallStability(D, S, R, g) {
  return S * (Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
}
export function forgetStability(D, S, R) {
  const s = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
  return Math.min(s, S / Math.exp(W[17] * W[18]));
}
// Repaso el mismo día (aprendiendo o justo después de fallar)
export const shortTermStability = (S, g) => S * Math.exp(W[17] * (g - 3 + W[18]));

// La facilidad (la del algoritmo clásico) y la dificultad de FSRS se convierten la una en la otra:
// así, al cambiar de algoritmo, las tarjetas difíciles siguen siéndolo.
export const easeFromDifficulty = D => Math.round((3.1 - (clampD(D) - 1) * 0.2) * 1000) / 1000;
export const difficultyFromEase = ease => clampD(1 + (3.1 - (ease || 2.5)) / 0.2);

// Estado de memoria de una tarjeta: el guardado o, si no lo hay (venía del algoritmo clásico o la base de
// datos aún no tiene las columnas), uno deducido de su intervalo y su facilidad.
export function memoryOf(prev, r = 0.9) {
  if (prev?.stability > 0 && prev?.difficulty > 0) return { S: prev.stability, D: prev.difficulty };
  const D = difficultyFromEase(prev?.ease);
  const S = prev?.interval > 0 ? prev.interval / (intervalFor(1, r) || 1) : initStability(3);
  return { S: Math.max(0.1, S), D };
}

// prev: estado anterior (null = nueva) · g: 1 Otra vez · 2 Difícil · 3 Bien · 4 Fácil
// A: { retention, againMin, hardNewMin, intervalMod, maxDays }
export function fsrsSchedule(prev, g, now, A, startOfDay) {
  const r = Math.min(0.99, Math.max(0.7, A.retention || 0.9));
  const s = prev ? { ...prev } : { reps: 0, interval: 0, lapses: 0 };
  if (!s.firstSeen) s.firstSeen = now;
  const last = prev?.last || now;
  let S, D;
  if (!prev) { S = initStability(g); D = initDifficulty(g); }
  else {
    const m = memoryOf(prev, r);
    const t = Math.max(0, (now - last) / DAY);
    if (prev.interval === 0 || t < 0.75) {
      // Mismo día: aprendiendo, reaprendiendo o repasada otra vez hoy
      S = shortTermStability(m.S, g); D = nextDifficulty(m.D, g);
    } else {
      const R = retrievability(t, m.S);
      D = nextDifficulty(m.D, g);
      S = g === 1 ? forgetStability(m.D, m.S, R) : recallStability(m.D, m.S, R, g);
    }
  }
  S = Math.max(0.1, Math.min(S, 36500));
  s.stability = Math.round(S * 1000) / 1000;
  s.difficulty = Math.round(D * 1000) / 1000;
  s.ease = easeFromDifficulty(D);
  s.last = now;
  // Fallo, o «Difícil» con una nueva: vuelve en unos minutos (aprendiendo)
  if (g === 1 || (g === 2 && (!prev || prev.reps === 0))) {
    if (g === 1 && prev && prev.reps > 0) s.lapses = (s.lapses || 0) + 1;
    if (g === 1) s.reps = 0;
    s.interval = 0;
    s.due = now + (g === 1 ? A.againMin || 1 : A.hardNewMin || 10) * 60e3;
    return s;
  }
  let iv = Math.round(intervalFor(S, r) * (A.intervalMod || 1));
  // Que «Bien» y «Fácil» no se queden por debajo de lo que ya llevaba la tarjeta
  if (prev?.interval > 0 && g >= 3) iv = Math.max(iv, prev.interval + (g === 4 ? 2 : 1));
  iv = Math.min(Math.max(1, iv), A.maxDays || 36500);
  s.reps = (s.reps || 0) + 1;
  s.interval = iv;
  s.due = startOfDay(now) + iv * DAY;
  return s;
}
