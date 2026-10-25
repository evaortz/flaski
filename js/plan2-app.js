// Flaski · el plan nuevo dentro de la app (paso B): arma el estado del motor (plan2.js) con los datos de S y
// responde a lo que preguntan Hoy, la tanda y el Plan. Solo con el interruptor de pruebas «plan2» (?plan2 o
// localStorage['flaski-plan2'] = '1'); sin él, la app sigue con el plan de ahora (plan.js).
// Mientras conviven los dos, el plan nuevo se guarda aparte, en S.prefs.plan2 (la primera vez, migrado del de
// ahora): así apagar el interruptor deja todo como estaba.
import { S, hooks, extraNew } from './comun.js';
import { plan2On, today, forecast, minutesOn } from './plan2.js';
import { migrate } from './plan2-migrar.js';
import { dayKey } from './plan.js';
import { startOfDay } from './srs.js';
import { whyCard } from './pantallas/plan-tiempo.js';

export const P2 = plan2On();

const ctx = () => ({ today: dayKey(), decks: S.decks, folders: S.folders });
let migrated = null;
// El plan nuevo para leer (sin guardar nada); editPlan2() para cambiarlo (la primera vez se queda guardado)
export function plan2() {
  if (S.prefs.plan2?.v === 2) return S.prefs.plan2;
  const key = JSON.stringify(S.prefs.plan) + dayKey();
  if (migrated?.key !== key) migrated = { key, plan: migrate(S.prefs.plan, { ...ctx(), at: 0 }) };
  return migrated.plan;
}
export function editPlan2() {
  if (S.prefs.plan2?.v !== 2) S.prefs.plan2 = JSON.parse(JSON.stringify(plan2()));
  return S.prefs.plan2;
}

// Lo hecho hoy: nuevas y repasos (por el progreso) y las respuestas con su tiempo
export function doneToday(now = Date.now()) {
  const t0 = startOfDay(now);
  let fresh = 0, reviews = 0, n = 0, ms = 0;
  for (const p of S.progress.values()) {
    if (!(p.last >= t0)) continue;
    if (p.firstSeen >= t0) fresh++; else reviews++;
  }
  for (const e of S.events) if (e.t >= t0) { n++; ms += Math.min(120e3, Number(e.ms) || 0); }
  return { new: fresh, reviews, n, ms };
}
// Cuándo ha cambiado el progreso (se cambia en el sitio): las cuentas del motor se rehacen solo entonces
const stockKey = () => `${S.progress.size}|${S.cards.size}|${S.events.length}|${S.events.at(-1)?.t || 0}`;
export function stateNow() {
  return {
    plan: plan2(), today: dayKey(), decks: S.decks, folders: S.folders, pages: S.pages, cards: S.cards, progress: S.progress,
    stockKey: stockKey(), events: S.events, newPerDay: S.newPerDay, fallbackMin: S.prefs.study.tandaMin,
    done: doneToday(), extraNew: extraNew(),
  };
}
// Lo de hoy (today() del motor), calculado una vez mientras no cambie nada
let memo = null;
export function todayPlan() {
  const st = stateNow(), key = JSON.stringify([st.plan, st.today, st.stockKey, st.newPerDay, st.done, st.extraNew, st.fallbackMin]);
  if (memo?.key !== key) memo = { key, value: today(st) };
  return memo.value;
}
let fcMemo = null;
export function forecastNow() {
  const st = stateNow(), key = JSON.stringify([st.plan, st.today, st.stockKey, st.newPerDay, st.fallbackMin]);
  if (fcMemo?.key !== key) fcMemo = { key, value: forecast(st) };
  return fcMemo.value;
}
// Minutos de hoy: «hoy solo tengo…», la pausa, el día especial o tu semana (null sin semana: los de la tanda)
export function minutesToday(k = dayKey()) {
  const p = plan2(), t = p.time || {};
  if (!t.week && t.today?.day !== k && !(t.pause?.from <= k && k <= t.pause?.to) && !(t.special || []).some(s => !s.deleted && s.from <= k && k <= s.to)) return null;
  return minutesOn(p, k, S.prefs.study.tandaMin);
}

// Lo que comun.js le pregunta al plan cuando el interruptor está puesto
if (P2) {
  hooks.plan2 = {
    minutes: () => minutesToday(),
    // Nuevas de cada lista: las de hoy según el motor; «steady», las de un día normal (el próximo con tiempo)
    quota(steady) {
      if (!steady) return new Map(Object.entries(todayPlan().newBy));
      const day = forecastNow().days.find((d, i) => i > 0 && d.minutes > 0);
      return new Map(Object.entries(day?.newBy || {}));
    },
    dayDone: () => todayPlan().dayDone,
    why: c => whyCard(c),
    // Cuántas preguntas caben en una tanda de N minutos con lo de hoy: los repasos primero y, si sobra, nuevas
    size(minutes) {
      const t = todayPlan(), { secNew, secReview } = t.pace, budget = minutes * 60;
      const r = Math.min(t.reviews, Math.floor(budget / secReview)), n = Math.min(t.new, Math.floor((budget - r * secReview) / secNew));
      return Math.max(1, r + Math.max(0, n));
    },
  };
}
