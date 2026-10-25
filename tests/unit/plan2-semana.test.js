// El domingo (plan2.js · la semana): lo previsto (weekSnap), cómo va la semana (weekReview) y recuperarla (weekRecover)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast, weekStart, weekSnap, weekReview, weekRecover } from '../../js/plan2.js';
import { addDays } from '../../js/plan.js';
import { invent } from './plan2-datos.js';

const MON = '2026-10-19', SUN = '2026-10-25', DAY = 864e5;
const at = (k, h = 10) => new Date(`${k}T${String(h).padStart(2, '0')}:00:00`).getTime();

// Un examen a 60 días; el lunes se guarda lo previsto y de lunes a sábado se estudia lo previsto, menos los días skip
function week(skip = []) {
  const S = invent({ seed: 7, n: 500, nExams: 1, nTopics: 5, seen: 0.1, today: MON, days: [60] });
  const fc0 = forecast(S), snap = weekSnap(fc0);
  const progress = new Map(S.progress), events = [], used = new Set();
  for (let i = 0; i < 6; i++) {
    const d = fc0.days[i];
    if (skip.includes(d.day)) continue;
    events.push({ t: at(d.day), ms: 20000 });
    for (const [deck, n] of Object.entries(d.newBy)) {
      const ids = S.cards.filter(c => c.deck_id === deck && !progress.has(c.id) && !used.has(c.id)).slice(0, n);
      for (const c of ids) {
        used.add(c.id);
        progress.set(c.id, { reps: 1, interval: 4, ease: 2.5, lapses: 0, due: at(d.day) + 4 * DAY, last: at(d.day), firstSeen: at(d.day), stability: 4, difficulty: 5 });
        events.push({ t: at(d.day, 11), ms: 30000 });
      }
    }
  }
  const sun = { ...S, today: SUN, progress };
  return { S, fc0, snap, fc: forecast(sun), progress, events };
}

test('lo previsto: minutos y nuevas de cada día hasta el domingo y cuándo acabas el temario; al rehacerlo, se quedan los días pasados', () => {
  const { fc0, snap } = week();
  assert.equal(weekStart(SUN), MON);
  assert.equal(weekStart(MON), MON);
  assert.equal(snap.week, MON);
  assert.deepEqual(Object.keys(snap.days), Array.from({ length: 7 }, (_, i) => addDays(MON, i)));
  assert.equal(snap.days[MON].new, fc0.days[0].new);
  assert.equal(snap.days[SUN].min, 0);
  assert.ok(snap.finish.ex0 > MON);
  // El miércoles se rehace (cambia el plan): lunes y martes, como estaban
  const later = weekSnap({ ...fc0, today: addDays(MON, 2), days: fc0.days.slice(2) }, {}, { ...snap, days: { ...snap.days, [MON]: { min: 45, new: 99 } } });
  assert.equal(later.days[MON].new, 99);
  assert.equal(later.days[addDays(MON, 2)].new, fc0.days[2].new);
});

test('has hecho lo previsto: 6 de 6 días, todas las nuevas, vas bien', () => {
  const { S, snap, fc, progress, events } = week();
  const r = weekReview({ fc, plan: S.plan, snap, progress, events });
  assert.equal(r.planned, 6);
  assert.equal(r.studied, 6);
  assert.equal(r.missing, 0);
  assert.equal(r.newDone, r.newPlanned);
  assert.ok(r.newDone > 0);
  assert.equal(r.behind, 0);
  assert.equal(r.exam.id, 'ex0');
  assert.deepEqual(r.days.map(d => d.studied), [true, true, true, true, true, true, false]);
  assert.deepEqual(r.days.map(d => d.planned), [true, true, true, true, true, true, false]);
});

test('sin estudiar jueves y viernes: 4 de 6 días, faltan sus nuevas y el temario acaba más tarde (vas días por detrás)', () => {
  const thu = addDays(MON, 3), fri = addDays(MON, 4);
  const { S, snap, fc, progress, events } = week([thu, fri]);
  const r = weekReview({ fc, plan: S.plan, snap, progress, events });
  assert.equal(r.studied, 4);
  assert.equal(r.planned, 6);
  assert.equal(r.missing, snap.days[thu].new + snap.days[fri].new);
  assert.ok(r.behind >= 2, `por detrás: ${r.behind}`);
  assert.equal(r.exam.was, snap.finish.ex0);
  assert.ok(r.exam.finish > r.exam.was);
  // Sin lo previsto guardado (o el de otra semana) no se sabe: puede que aún no tuvieras plan
  const r2 = weekReview({ fc, plan: S.plan, snap: null, progress, events });
  assert.equal(r2.behind, 0);
  assert.equal(r2.missing, 0);
  assert.equal(r2.studied, 4);
  assert.equal(weekReview({ fc, plan: S.plan, snap: { ...snap, week: addDays(MON, -7) }, progress, events }).behind, 0);
});

test('recuperar la semana: lo que falta, repartido en los días que estudias de la semana que viene, con unos minutos más', () => {
  const thu = addDays(MON, 3), fri = addDays(MON, 4);
  const { S, snap, fc, progress, events } = week([thu, fri]);
  const r = weekReview({ fc, plan: S.plan, snap, progress, events });
  const rec = weekRecover(S.plan, r, { secNew: 40, secReview: 12 }, SUN);
  assert.deepEqual(rec.days, Array.from({ length: 6 }, (_, i) => addDays(SUN, i + 1)));
  assert.equal(rec.perDay, Math.ceil(r.missing / 6));
  assert.equal(rec.more, Math.ceil((rec.perDay * 40) / 60));
  assert.equal(rec.special[0].minutes, 45 + rec.more);
  assert.equal(rec.special[5].minutes, 90 + rec.more);
  // Con más minutos esos días, el temario acaba antes que dejándolo así
  const plan = { ...S.plan, time: { ...S.plan.time, special: rec.special } };
  const after = forecast({ ...S, today: SUN, progress, plan });
  assert.ok(after.exams[0].finish < fc.exams[0].finish);
  // Un día que ya es especial no se toca
  const busy = { ...S.plan, time: { ...S.plan.time, special: [{ id: 'x', from: addDays(SUN, 3), to: addDays(SUN, 3), minutes: 20 }] } };
  assert.equal(weekRecover(busy, r, undefined, SUN).days.length, 5);
  // Sin nada que recuperar, nada
  assert.equal(weekRecover(S.plan, { ...r, missing: 0 }, undefined, SUN), null);
});
