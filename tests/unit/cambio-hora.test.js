// Cambio de hora (Europe/Madrid): el 25 oct 2026 el día dura 25 h y el 28 mar 2027, 23 h. Una pregunta que vuelve
// en N días tiene que tocar N días de calendario después, nunca la víspera a las 23:00
process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, startOfDay, dateKey, DEFAULT_ALGO } from '../../js/srs.js';
import { fsrsSchedule } from '../../js/fsrs.js';

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).getTime();
const FSRS = { retention: 0.9, againMin: 1, hardNewMin: 10, intervalMod: 1, maxDays: 36500 };

for (const [label, day] of [['25 oct (25 h)', at(2026, 10, 25)], ['24 oct, la víspera', at(2026, 10, 24)], ['28 mar (23 h)', at(2027, 3, 28)], ['27 mar', at(2027, 3, 27)]]) {
  test(`FSRS: una nueva con «Bien» el ${label} vuelve justo N días de calendario después, a medianoche`, () => {
    const s = fsrsSchedule(null, 3, day, FSRS, startOfDay);
    const d = new Date(day); d.setDate(d.getDate() + s.interval);
    assert.equal(dateKey(s.due), dateKey(d.getTime()));
    assert.equal(new Date(s.due).getHours(), 0);
    // Con 1 día, el día siguiente (no hoy a las 23:00)
    const one = fsrsSchedule({ reps: 1, interval: 1, ease: 2.5, lapses: 0, due: day, last: day - 864e5, stability: 0.5, difficulty: 5 }, 3, day, { ...FSRS, maxDays: 1 }, startOfDay);
    assert.equal(one.interval, 1);
    assert.notEqual(dateKey(one.due), dateKey(day));
  });
  test(`clásico: «Bien» el ${label} vuelve N días de calendario después`, () => {
    const s = schedule({ reps: 2, interval: 3, ease: 2.5, lapses: 0, due: day, last: day - 3 * 864e5 }, 3, day, { ...DEFAULT_ALGO, fsrs: false });
    const d = new Date(day); d.setDate(d.getDate() + s.interval);
    assert.equal(dateKey(s.due), dateKey(d.getTime()));
    assert.equal(new Date(s.due).getHours(), 0);
  });
}

// El ritmo del plan nuevo (plan2.js): las vueltas de una nueva se juntan por día de aquí, no por día UTC
import { medirRitmo } from '../../js/plan2.js';
test('medirRitmo: una nueva a las 00:30 y su vuelta a la 01:30 (hora de España) son del mismo día', () => {
  const ev = [];
  for (let i = 0; i < 30; i++) {
    // 00:30 de aquí = 23:30 UTC del día anterior; 01:30 de aquí = 00:30 UTC
    ev.push({ card_id: 'n' + i, ts: new Date(2026, 10, 1 + i, 0, 30).toISOString(), state: 'new', ms: 20000 });
    ev.push({ card_id: 'n' + i, ts: new Date(2026, 10, 1 + i, 1, 30).toISOString(), state: 'learning', ms: 10000 });
  }
  assert.notEqual(ev[0].ts.slice(0, 10), ev[1].ts.slice(0, 10));
  assert.equal(medirRitmo(ev).secNew, 30);
});
test('medirRitmo: primero las últimas 300 respuestas y después fuera las de más de 5 min', () => {
  const ev = [];
  for (let i = 0; i < 100; i++) ev.push({ card_id: 'o' + i, ts: new Date(2026, 8, 1, 10, i).toISOString(), state: 'review', ms: 30000 });
  for (let i = 0; i < 300; i++) ev.push({ card_id: 'r' + i, ts: new Date(2026, 9, 1, 10, 0, i).toISOString(), state: 'review', ms: i < 260 ? 6 * 60e3 : 5000 });
  // De las últimas 300 solo valen 40: menos de 50, lo de siempre (antes salían 140 y 30 s)
  assert.deepEqual(medirRitmo(ev), { secNew: 40, secReview: 12, measured: false, n: 40 });
});
