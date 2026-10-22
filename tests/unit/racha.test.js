// Rachas con el comodín de la semana: un día suelto sin estudiar no corta la racha (uno por semana)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streaks, weekOf } from '../../js/charts.js';

// Jueves 22 de octubre de 2026, por la tarde
const NOW = new Date(2026, 9, 22, 18).getTime();
const key = k => { const d = new Date(2026, 9, 22 - k, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const log = (...ago) => Object.fromEntries(ago.map(k => [key(k), 5]));

test('sin huecos: cuenta los días seguidos; hoy, si aún no has estudiado, no corta', () => {
  assert.equal(streaks(log(0, 1, 2), NOW).current, 3);
  assert.equal(streaks(log(1, 2), NOW).current, 2);
  assert.equal(streaks(log(1, 2), NOW).freeze.available, true);
});

test('un día suelto sin estudiar gasta el comodín de esa semana y la racha sigue (sin sumarlo)', () => {
  const s = streaks(log(0, 2, 3), NOW);       // ayer (miércoles) sin estudiar
  assert.equal(s.current, 3);
  assert.ok(s.frozen.has(key(1)));
  assert.equal(s.freeze.available, false);
  assert.equal(s.freeze.usedOn, key(1));
});

test('también si el día sin estudiar fue ayer y hoy aún no has estudiado', () => {
  assert.equal(streaks(log(2, 3, 4), NOW).current, 3);
});

test('dos días seguidos sin estudiar sí cortan', () => {
  assert.equal(streaks(log(3, 4), NOW).current, 0);
});

test('un solo comodín por semana; la semana anterior tiene el suyo', () => {
  // Esta semana empieza el lunes 19
  assert.equal(weekOf(new Date(2026, 9, 22).getTime()), '2026-10-19');
  const s = streaks(log(0, 1, 3, 5, 6), NOW);   // huecos el martes 20 (esta semana) y el domingo 18 (la anterior)
  assert.equal(s.current, 5);
  const t = streaks(log(0, 2, 4, 5), NOW);      // huecos el miércoles 21 y el lunes 19: la misma semana
  assert.equal(t.current, 2);
});

test('la mejor racha usa la misma regla', () => {
  assert.equal(streaks(log(20, 21, 23, 24), NOW).best, 4);
  assert.equal(streaks(log(20, 21, 24, 25), NOW).best, 2);
});
