import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, buildQueue, startOfDay, fmtWhen, DAY, DEFAULT_ALGO } from '../../js/srs.js';

const NOW = new Date('2026-03-10T10:00:00').getTime();
const days = s => Math.round((startOfDay(s.due) - startOfDay(NOW)) / DAY);

test('una nueva con «Bien» sale mañana y con «Fácil» en 4 días', () => {
  assert.equal(days(schedule(null, 3, NOW)), DEFAULT_ALGO.gradDays);
  assert.equal(days(schedule(null, 4, NOW)), DEFAULT_ALGO.easyDays);
});

test('«Otra vez» vuelve en un minuto, reinicia y cuenta un fallo', () => {
  const learned = { reps: 3, interval: 10, ease: 2.5, lapses: 0, due: NOW, firstSeen: NOW - 30 * DAY };
  const s = schedule(learned, 1, NOW);
  assert.equal(s.due, NOW + 60e3);
  assert.equal(s.reps, 0);
  assert.equal(s.interval, 0);
  assert.equal(s.lapses, 1);
  assert.equal(s.ease, 2.3);
});

test('«Difícil» con una nueva la deja en aprendizaje 10 minutos', () => {
  const s = schedule(null, 2, NOW);
  assert.equal(s.interval, 0);
  assert.equal(s.due, NOW + 10 * 60e3);
});

test('los intervalos crecen y nunca pasan del máximo', () => {
  let s = null;
  let t = NOW;
  let last = 0;
  for (let i = 0; i < 30; i++) {
    s = schedule(s, 3, t);
    assert.ok(s.interval >= last, `el intervalo no baja (${last} → ${s.interval})`);
    assert.ok(s.interval <= DEFAULT_ALGO.maxDays);
    last = s.interval;
    t = s.due;
  }
  assert.equal(last, DEFAULT_ALGO.maxDays);
});

test('la facilidad nunca baja de 1,3', () => {
  let s = { reps: 2, interval: 5, ease: 1.4, lapses: 0 };
  for (let i = 0; i < 5; i++) s = schedule(s, 1, NOW);
  assert.equal(s.ease, 1.3);
});

test('no modifica el estado anterior', () => {
  const prev = Object.freeze({ reps: 1, interval: 1, ease: 2.5, lapses: 0, due: NOW });
  assert.doesNotThrow(() => schedule(prev, 3, NOW));
});

test('buildQueue: pendientes por orden de vencimiento, una nueva cada 3 y límite de nuevas', () => {
  const cards = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: 'c' + i, deck_id: 'd', position: i }));
  const progress = new Map([
    ['c1', { due: NOW - 1000 }],
    ['c2', { due: NOW - 3000 }],
    ['c3', { due: NOW - 2000 }],
    ['c4', { due: NOW + DAY }],     // aún no toca
  ]);
  const q = buildQueue(cards, progress, { newLimit: 2, now: NOW });
  assert.deepEqual(q, ['c2', 'c3', 'c1', 'c5', 'c6']);
});

test('buildQueue filtra por mazos', () => {
  const cards = [{ id: 'a', deck_id: 'x', position: 1 }, { id: 'b', deck_id: 'y', position: 2 }];
  assert.deepEqual(buildQueue(cards, new Map(), { deckIds: new Set(['y']), now: NOW }), ['b']);
});

test('fmtWhen', () => {
  assert.equal(fmtWhen(NOW - 1, NOW), 'hoy');
  assert.equal(fmtWhen(NOW + 10 * 60e3, NOW), '10 min');
  assert.equal(fmtWhen(startOfDay(NOW) + 3 * DAY, NOW), '3 d');
});
