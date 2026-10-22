// Plan de estudio: estados, reparto del foco por carpetas y mazos, y ritmo para llegar a un examen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckState, folderState, shares, allocate, examFloors, examStatus, daysTo, urgencyWeight } from '../../js/plan.js';

const folders = new Map([
  ['uni', { id: 'uni', parent_id: null }],
  ['q1', { id: 'q1', parent_id: 'uni' }],
]);
const decks = new Map([
  ['bio', { id: 'bio', folder_id: 'q1' }],
  ['his', { id: 'his', folder_id: 'q1' }],
  ['mat', { id: 'mat', folder_id: 'uni' }],
  ['ing', { id: 'ing', folder_id: null }],
  ['lost', { id: 'lost', folder_id: 'no-existe' }],
  ['old', { id: 'old', folder_id: null, archived: true }],
]);
const NOW = new Date(2026, 9, 22, 10).getTime();

test('el estado más restrictivo de sus carpetas manda', () => {
  const nodes = { 'f:uni': { state: 'reviews' }, his: { state: 'paused' } };
  assert.equal(deckState(decks.get('bio'), folders, nodes), 'reviews');
  assert.equal(deckState(decks.get('his'), folders, nodes), 'paused');
  assert.equal(deckState(decks.get('ing'), folders, nodes), 'active');
  assert.equal(folderState('q1', folders, { 'f:uni': { state: 'paused' } }), 'paused');
});

test('el foco se reparte por el árbol según los pesos, y los mazos sin carpeta conocida van a la raíz', () => {
  const s = shares(decks, folders, {});
  // raíz: uni, ing, lost → 1/3 cada uno; uni: q1 y mat → 1/6; q1: bio y his → 1/12
  assert.ok(Math.abs(s.get('ing') - 1 / 3) < 1e-9);
  assert.ok(Math.abs(s.get('lost') - 1 / 3) < 1e-9);
  assert.ok(Math.abs(s.get('mat') - 1 / 6) < 1e-9);
  assert.ok(Math.abs(s.get('bio') - 1 / 12) < 1e-9);
  assert.equal(s.has('old'), false);
  const w = shares(decks, folders, { 'f:uni': { weight: 80 }, ing: { weight: 20 }, lost: { weight: 0 } });
  assert.ok(Math.abs(w.get('ing') - 0.2) < 1e-9);
  assert.equal(w.get('lost'), 0);
  // Solo cuentan los que pueden: si en q1 no queda ninguno, su parte va a mat
  const e = shares(decks, folders, {}, d => !['bio', 'his'].includes(d.id));
  assert.ok(Math.abs(e.get('mat') - 1 / 3) < 1e-9);
});

test('allocate: reparte, respeta lo disponible y pasa lo que sobra a los demás', () => {
  const sh = new Map([['a', 0.5], ['b', 0.25], ['c', 0.25]]);
  assert.deepEqual(Object.fromEntries(allocate(20, sh, new Map([['a', 99], ['b', 99], ['c', 99]]))), { a: 10, b: 5, c: 5 });
  assert.deepEqual(Object.fromEntries(allocate(20, sh, new Map([['a', 2], ['b', 99], ['c', 99]]))), { a: 2, b: 9, c: 9 });
  const r = allocate(7, new Map([['a', 1], ['b', 1], ['c', 1]]), new Map([['a', 9], ['b', 9], ['c', 9]]));
  assert.equal([...r.values()].reduce((x, y) => x + y, 0), 7);
  assert.deepEqual(Object.fromEntries(allocate(10, sh, new Map([['a', 1], ['b', 1], ['c', 1]]))), { a: 1, b: 1, c: 1 });
  // Los mínimos van primero
  assert.deepEqual(Object.fromEntries(allocate(10, sh, new Map([['a', 99], ['b', 99], ['c', 99]]), new Map([['c', 6]]))), { a: 2, b: 1, c: 7 });
  assert.equal(allocate(0, sh, new Map([['a', 9]])).size, 0);
});

test('examen: ritmo necesario y aviso si no llega', () => {
  const nodes = { bio: { exam: '2026-11-01' }, 'f:uni': { exam: '2026-10-21' } };
  assert.equal(daysTo('2026-11-01', NOW), 10);
  assert.equal(daysTo('', NOW), null);
  const remaining = new Map([['bio', 50], ['his', 0], ['mat', 30]]);
  const fl = examFloors(decks, folders, nodes, remaining, NOW);
  assert.equal(fl.get('bio'), 5);
  assert.equal(fl.has('mat'), false);                 // el de la carpeta ya pasó
  const st = examStatus('bio', { decks, folders, nodes, remaining, perDay: new Map([['bio', 3]]), now: NOW });
  assert.deepEqual(st, { days: 10, left: 50, per: 3, need: 5, late: true });
  assert.equal(examStatus('bio', { decks, folders, nodes, remaining, perDay: new Map([['bio', 5]]), now: NOW }).late, false);
  assert.equal(examStatus('f:uni', { decks, folders, nodes, remaining, perDay: new Map(), now: NOW }).days, -1);
  assert.ok(urgencyWeight('2026-10-29', NOW) > urgencyWeight('2027-03-01', NOW));
  assert.equal(urgencyWeight('', NOW), 1);
});
