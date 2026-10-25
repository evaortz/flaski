// Datos para las pruebas del motor del plan (plan2.js): el estado de 945 preguntas con dos exámenes
// (tests/fixtures/oposicion-945.json, los datos del modo pruebas) y estados inventados de cualquier tamaño.
import { readFileSync } from 'node:fs';
import { fromRow } from '../../js/rows.js';
import { migrate } from '../../js/plan2-migrar.js';

export const TODAY = '2026-10-25';     // domingo, día libre
const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// El estado tal como lo tendría la app: listas, carpetas, preguntas, progreso (en ms) y el plan
export function load(name = 'oposicion-945.json') {
  const d = fixture(name);
  const progress = new Map(d.progress.map(r => [r.card_id, fromRow(r)]));
  const old = d.settings.prefs.plan;
  return {
    raw: d, old, newPerDay: d.settings.new_per_day, tandaMin: d.settings.prefs.study.tandaMin,
    decks: new Map(d.decks.map(x => [x.id, x])), folders: new Map(d.folders.map(x => [x.id, x])),
    cards: d.cards, progress, events: d.events || [], pages: d.pages || [],
  };
}
export function state945(change) {
  const D = load();
  const plan = migrate(D.old, { today: TODAY, decks: D.decks, folders: D.folders, at: 1 });
  if (change) change(plan);
  return { ...D, plan, today: TODAY, fallbackMin: D.tandaMin };
}
export const deckByName = (S, start) => [...S.decks.values()].find(d => d.name.startsWith(start)).id;
export const examByName = (S, start) => S.plan.exams.find(e => e.name.startsWith(start));

// Números al azar siempre iguales
export function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}
const DAY = 864e5;
// Un estado inventado: nExams exámenes (una carpeta con nTopics temas cada uno), n preguntas, parte vistas
export function invent({ seed = 1, n = 600, nExams = 2, nTopics = 6, seen = 0.3, today = TODAY, week, days = [30, 90, 200] } = {}) {
  const r = rng(seed), folders = [], decks = [], cards = [], progress = new Map(), exams = [];
  const t0 = new Date(today + 'T12:00:00').getTime();
  for (let e = 0; e < nExams; e++) {
    const fid = `f${e}`;
    folders.push({ id: fid, parent_id: null, name: `Examen ${e + 1}`, position: e });
    for (let k = 0; k < nTopics; k++) decks.push({ id: `d${e}-${k}`, folder_id: fid, name: `T${k + 1} · tema ${k + 1}` });
    const date = new Date(t0 + days[e % days.length] * DAY);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    exams.push({ id: `ex${e}`, name: `Examen ${e + 1}`, scope: { folders: [fid], decks: [], pages: [] }, exclude: [], date: key, order: [], mode: 'seq', shares: {}, fixed: {}, known: [], lastWeek: true, retention: 0.9, after: null });
  }
  for (let i = 0; i < n; i++) {
    const d = decks[Math.floor(r() * decks.length)], id = `c${i}`;
    cards.push({ id, deck_id: d.id });
    if (r() < seen) {
      const interval = 1 + Math.floor(r() * 40);
      progress.set(id, { reps: 3, interval, ease: 2.5, lapses: 0, due: t0 + Math.floor(r() * interval - 2) * DAY, last: t0 - DAY, firstSeen: t0 - 30 * DAY });
    }
  }
  const plan = {
    v: 2, time: { week: week || { mon: 45, tue: 45, wed: 45, thu: 45, fri: 30, sat: 90, sun: 0 }, special: [], today: null, pause: null },
    exams, split: { mode: 'auto', shares: {} }, free: {}, caps: { newPerDay: null, reviewsPerDay: null }, stages: [],
  };
  return { plan, today, decks, folders, cards, progress, pace: { secNew: 40, secReview: 12 } };
}
