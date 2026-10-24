// Atrasos: lo atrasado se reparte en una semana y el tope de cada día se calcula una vez
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backlogPlan, backlogActive, daysLeft, BACKLOG_MIN, BACKLOG_DAYS } from '../../js/atrasos.js';

const DAY = 864e5, NOW = new Date(2026, 9, 24, 10).getTime();

test('con pocas atrasadas no se reparte nada', () => {
  const b = backlogPlan(null, { uid: 'u', late: BACKLOG_MIN - 1, onTime: 5, now: NOW });
  assert.equal(backlogActive(b), false);
  assert.equal(b.day, '2026-10-24');
});

test('al volver, las atrasadas se reparten en 7 días: hoy las que tocan hoy y una séptima parte', () => {
  const b = backlogPlan(null, { uid: 'u', late: 140, onTime: 10, done: 0, now: NOW });
  assert.ok(backlogActive(b));
  assert.equal(b.from, '2026-10-24');
  assert.equal(b.until, '2026-10-30');
  assert.equal(daysLeft(b.until, NOW), BACKLOG_DAYS);
  assert.equal(b.cap, 10 + 20);
});

test('el mismo día no cambia aunque repases; al día siguiente se recalcula con lo que queda', () => {
  const b = backlogPlan(null, { uid: 'u', late: 140, onTime: 10, now: NOW });
  assert.equal(backlogPlan(b, { uid: 'u', late: 100, onTime: 0, done: 40, now: NOW + 3600e3 }), b);
  const next = backlogPlan(b, { uid: 'u', late: 120, onTime: 6, now: NOW + DAY });
  assert.equal(next.until, b.until);
  assert.equal(next.cap, 6 + 20);   // 120 entre 6 días
  // El último día, todo lo que quede
  const last = backlogPlan(next, { uid: 'u', late: 25, onTime: 0, now: NOW + 6 * DAY });
  assert.equal(last.cap, 25);
  // Pasado el reparto, si vuelve a haber muchas empieza otro
  const again = backlogPlan(last, { uid: 'u', late: 40, onTime: 0, now: NOW + 7 * DAY });
  assert.equal(again.from, '2026-10-31');
});

test('al ponerte al día se acaba; «hacerlas todas» lo apaga hasta el final del reparto', () => {
  const b = backlogPlan(null, { uid: 'u', late: 70, onTime: 0, now: NOW });
  assert.equal(backlogActive(backlogPlan(b, { uid: 'u', late: 0, onTime: 3, now: NOW + DAY })), false);
  const off = { ...b, off: true };
  const tomorrow = backlogPlan(off, { uid: 'u', late: 60, onTime: 0, now: NOW + DAY });
  assert.equal(backlogActive(tomorrow), false);
  assert.equal(tomorrow.until, b.until);
});

test('otra cuenta no hereda el reparto', () => {
  const b = backlogPlan(null, { uid: 'u', late: 70, onTime: 0, now: NOW });
  const o = backlogPlan(b, { uid: 'v', late: 5, onTime: 0, now: NOW });
  assert.equal(backlogActive(o), false);
});

test('solo se empieza a repartir al volver: si ayer estudiaste, no', () => {
  assert.equal(backlogActive(backlogPlan(null, { uid: 'u', late: 80, onTime: 0, away: 1, now: NOW })), false);
  assert.equal(backlogActive(backlogPlan(null, { uid: 'u', late: 80, onTime: 0, away: 2, now: NOW })), true);
});

test('un examen antes de que acabe el reparto: lo atrasado de sus listas se hace antes del examen', () => {
  // 140 atrasadas, 30 de ellas de un examen dentro de 3 días: 10 al día para el examen y 110 entre 7
  const b = backlogPlan(null, { uid: 'u', late: 140, onTime: 0, exams: [{ days: 3, late: 30 }], now: NOW });
  assert.equal(b.cap, 10 + Math.ceil(110 / 7));
  // Examen hoy: todo lo suyo hoy; examen después del reparto: como las demás
  assert.equal(backlogPlan(null, { uid: 'u', late: 140, onTime: 0, exams: [{ days: 0, late: 30 }], now: NOW }).cap, 30 + Math.ceil(110 / 7));
  assert.equal(backlogPlan(null, { uid: 'u', late: 140, onTime: 0, exams: [{ days: 9, late: 30 }], now: NOW }).cap, 20);
});
