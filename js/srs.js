// Repaso espaciado (SM-2 simplificado). Sin dependencias: se puede probar aparte.
//
// Estado de una tarjeta (null = nueva):
//   { reps, interval (días), ease, lapses, due (ms), firstSeen (ms), last (ms) }
// Notas: 1 Otra vez · 2 Difícil · 3 Bien · 4 Fácil

export const DAY = 864e5;
export const GRADES = [
  { g: 1, label: 'Otra vez' },
  { g: 2, label: 'Difícil' },
  { g: 3, label: 'Bien' },
  { g: 4, label: 'Fácil' },
];

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dateKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function schedule(prev, g, now = Date.now()) {
  const s = prev ? { ...prev } : { reps: 0, interval: 0, ease: 2.5, lapses: 0 };
  if (!s.firstSeen) s.firstSeen = now;
  s.last = now;

  if (g === 1) {
    if (s.reps > 0) s.lapses = (s.lapses || 0) + 1;
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now + 60e3; // vuelve en 1 minuto
    return s;
  }

  let iv;
  if (s.reps === 0) {
    if (g === 2) {
      s.ease = Math.max(1.3, s.ease - 0.15);
      s.due = now + 10 * 60e3; // vuelve en 10 minutos
      return s;
    }
    iv = g === 3 ? 1 : 4;
    if (g === 4) s.ease += 0.15;
  } else if (g === 2) {
    iv = Math.max(1, Math.round(s.interval * 1.2));
    s.ease = Math.max(1.3, s.ease - 0.15);
  } else if (g === 3) {
    iv = s.reps === 1 ? Math.max(3, s.interval + 1) : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
  } else {
    iv = Math.max(s.interval + 2, Math.round(Math.max(1, s.interval) * s.ease * 1.3));
    s.ease += 0.15;
  }
  iv = Math.min(iv, 365);
  s.reps += 1;
  s.interval = iv;
  s.due = startOfDay(now) + iv * DAY;
  return s;
}

// "1 min", "3 d", "2 sem", "4 mes"
export function fmtWhen(due, now = Date.now()) {
  const ms = due - now;
  if (ms <= 0) return 'hoy';
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days < 1) return `${Math.max(1, Math.round(ms / 60e3))} min`;
  if (days < 14) return `${days} d`;
  if (days < 60) return `${Math.round(days / 7)} sem`;
  return `${Math.round(days / 30)} mes`;
}

// Cola de estudio: primero lo que toca repasar, mezclando una nueva cada 3 repasos.
// deckIds: un Set con los mazos a incluir (o null para todos)
export function buildQueue(cards, progress, { deckIds = null, newLimit = 15, now = Date.now() } = {}) {
  const pool = cards.filter(c => !deckIds || deckIds.has(c.deck_id));
  const due = pool
    .filter(c => progress.get(c.id) && progress.get(c.id).due <= now)
    .sort((a, b) => progress.get(a.id).due - progress.get(b.id).due)
    .map(c => c.id);
  const fresh = pool
    .filter(c => !progress.get(c.id))
    .sort((a, b) => a.position - b.position)
    .slice(0, Math.max(0, newLimit))
    .map(c => c.id);
  const q = [];
  let i = 0, j = 0;
  while (i < due.length || j < fresh.length) {
    for (let k = 0; k < 3 && i < due.length; k++) q.push(due[i++]);
    if (j < fresh.length) q.push(fresh[j++]);
  }
  return q;
}
