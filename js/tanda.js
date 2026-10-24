// Tandas cortas: cuántas preguntas caben en N minutos según tu ritmo, y cuáles. Sin dependencias: se puede probar aparte.
// El repaso no cambia: la tanda corta es el principio de la cola de siempre, con las nuevas intercaladas.

export const TANDA_MINUTES = [5, 10, 15, 20];
export const DEFAULT_PACE = 20;   // segundos por pregunta si aún no hay datos

// Segundos por pregunta: la mediana de las últimas 100 respuestas (cada una ya trae su tiempo, con tope de 2 min).
// La mediana aguanta los ratos en que dejas el móvil a mitad de pregunta. Con menos de 20 respuestas, 20 s.
export function pace(events, { last = 100, min = 20 } = {}) {
  const ms = [];
  for (let i = (events?.length || 0) - 1; i >= 0 && ms.length < last; i--) {
    const v = Number(events[i]?.ms);
    if (v > 0) ms.push(v);
  }
  if (ms.length < min) return DEFAULT_PACE;
  ms.sort((a, b) => a - b);
  const m = ms.length >> 1;
  const med = ms.length % 2 ? ms[m] : (ms[m - 1] + ms[m]) / 2;
  return Math.max(3, Math.round(med / 1000));
}

// Preguntas que caben: minutos × 60 / ritmo, redondeado, mínimo 5
export const tandaSize = (minutes, secs = DEFAULT_PACE) => Math.max(5, Math.round((minutes * 60) / Math.max(1, secs)));

// La tanda corta: lo más atrasado primero y una nueva de cada cuatro; si se acaba un tipo, sigue con el otro
export function composeShort(due, fresh, n) {
  const q = [];
  let i = 0, j = 0;
  while (q.length < n && (i < due.length || j < fresh.length)) {
    for (let k = 0; k < 3 && i < due.length && q.length < n; k++) q.push(due[i++]);
    if (j < fresh.length && q.length < n) q.push(fresh[j++]);
  }
  return q;
}
