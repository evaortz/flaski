// Atrasos: al volver tras unos días sin estudiar, lo atrasado no sale de golpe en Hoy, sino repartido en
// los días siguientes. Mientras dura no entran nuevas (salvo el ritmo de un examen). El repaso no cambia:
// solo hay un tope de repasos para cada día, como el límite de Ajustes. Sin dependencias: se puede probar aparte.
import { DAY, startOfDay, dateKey } from './srs.js';

export const BACKLOG_MIN = 30;   // atrasadas (de antes de hoy) a partir de las que se reparten
export const BACKLOG_DAYS = 7;   // en cuántos días, hoy incluido
export const BACKLOG_AWAY = 2;   // días sin estudiar para empezar a repartir (ayer no estudiaste)

// Días que quedan del reparto, hoy incluido
export const daysLeft = (until, now = Date.now()) => Math.round((startOfDay(new Date(until + 'T12:00:00').getTime()) - startOfDay(now)) / DAY) + 1;

// El reparto de hoy. prev: lo guardado del día anterior ({ uid, day, from, until, cap, late, off }) o null.
// late: las que tocaban antes de hoy; onTime: las que tocan hoy; done: repasos ya hechos hoy;
// away: días desde la última vez que estudiaste (solo se empieza a repartir al volver);
// exams: [{ days, late }] atrasadas de las listas de cada examen (incluidas en late) y días hasta él. Si el examen
// llega antes de que acabe el reparto, lo suyo se reparte solo hasta el día antes (si es hoy, todo hoy).
// Se calcula una vez al día: cap (repasos de hoy en total, los hechos incluidos) no cambia al repasar.
export function backlogPlan(prev, { uid, late, onTime, done = 0, away = Infinity, exams = [], now = Date.now() }) {
  const today = dateKey(now);
  if (prev && prev.uid === uid && prev.day === today) return prev;
  let b = prev && prev.uid === uid && prev.until && prev.until >= today ? prev : null;
  if (!b) {
    if (late < BACKLOG_MIN || away < BACKLOG_AWAY) return { uid, day: today };
    b = { uid, from: today, until: dateKey(startOfDay(now) + (BACKLOG_DAYS - 1) * DAY + DAY / 2) };
  }
  if (b.off) return { ...b, day: today, cap: undefined };
  if (!late) return { uid, day: today };   // ya al día: se acaba
  const left = daysLeft(b.until, now);
  let rest = late, cap = done + onTime;
  for (const e of exams) if (e.late > 0 && e.days < left) { cap += Math.ceil(e.late / Math.max(1, e.days)); rest -= e.late; }
  return { ...b, day: today, late, cap: cap + Math.ceil(Math.max(0, rest) / left) };
}

export const backlogActive = b => !!(b && b.until && !b.off && b.cap != null);
