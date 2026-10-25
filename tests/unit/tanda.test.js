// Tandas cortas: ritmo (mediana de las últimas respuestas), tamaño y composición
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pace, tandaSize, composeShort, DEFAULT_PACE } from '../../js/tanda.js';

const evs = (...secs) => secs.map(s => ({ ms: s * 1000 }));

test('ritmo: sin datos o con pocas respuestas, 20 s', () => {
  assert.equal(pace([]), DEFAULT_PACE);
  assert.equal(pace(undefined), DEFAULT_PACE);
  assert.equal(pace(evs(...Array(19).fill(8))), DEFAULT_PACE);
});

test('ritmo: la mediana, que aguanta las respuestas en que dejas el móvil', () => {
  assert.equal(pace(evs(...Array(15).fill(10), ...Array(10).fill(120))), 10);
  assert.equal(pace(evs(...Array(10).fill(10), ...Array(10).fill(14))), 12);
});

test('ritmo: solo las últimas 100 respuestas, sin contar las que no tienen tiempo', () => {
  const old = evs(...Array(200).fill(60)), recent = evs(...Array(100).fill(12));
  assert.equal(pace([...old, ...recent]), 12);
  assert.equal(pace([...evs(...Array(30).fill(15)), ...Array(50).fill({ ms: 0 })]), 15);
  // Nunca menos de 10 s por pregunta, aunque respondas más rápido
  assert.equal(pace(evs(...Array(40).fill(2))), 10);
});

test('tamaño: minutos × 60 / ritmo, redondeado y como mínimo 5', () => {
  assert.equal(tandaSize(10), 30);
  assert.equal(tandaSize(10, 21), 29);
  assert.equal(tandaSize(5, 40), 8);
  assert.equal(tandaSize(5, 120), 5);
});

test('composición: tres repasos, una nueva; lo más atrasado primero', () => {
  const due = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], fresh = ['n1', 'n2', 'n3'];
  assert.deepEqual(composeShort(due, fresh, 8), ['r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'n2']);
  assert.deepEqual(composeShort(due, fresh, 3), ['r1', 'r2', 'r3']);
});

test('composición: si se acaba un tipo sigue con el otro, y nunca pasa de N', () => {
  assert.deepEqual(composeShort(['r1'], ['n1', 'n2', 'n3'], 3), ['r1', 'n1', 'n2']);
  assert.deepEqual(composeShort(['r1', 'r2'], [], 5), ['r1', 'r2']);
  assert.deepEqual(composeShort([], ['n1', 'n2'], 5), ['n1', 'n2']);
});
