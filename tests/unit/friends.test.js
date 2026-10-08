import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCode, cleanCode, inviteLink, parseInvite, weekDays, weekTotal, ranking, initial } from '../../js/friends.js';

test('códigos e invitaciones', () => {
  assert.equal(formatCode('EVA7K2QX'), 'EVA7-K2QX');
  assert.equal(cleanCode(' eva7-k2qx '), 'EVA7K2QX');
  assert.equal(cleanCode('corto'), '');
  assert.equal(inviteLink('EVA7K2QX', 'https://flaski.app/'), 'https://flaski.app/#amigo-EVA7K2QX');
  assert.equal(parseInvite('#amigo-EVA7K2QX'), 'EVA7K2QX');
  assert.equal(parseInvite('#amigo-eva7-k2qx'), 'EVA7K2QX');
  assert.equal(parseInvite('#d-123'), '');
});

test('semana de lunes a domingo', () => {
  assert.deepEqual(weekDays(new Date(2026, 9, 8)), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(weekDays(new Date(2026, 9, 11))[0], '2026-10-05');   // domingo: sigue siendo la misma semana
  assert.equal(weekDays(new Date(2026, 9, 12))[0], '2026-10-12');
  assert.equal(weekTotal([1, 2, null, 3]), 6);
});

test('clasificación: por repasos, empates con la misma posición, sin quien no comparte', () => {
  const me = { id: 'yo', name: 'Eva', week: [10, 0, 0, 0, 0, 0, 0], streak: 3, me: true };
  const r = ranking(me, [
    { id: 'a', name: 'Ana', shared: true, week: [5, 5, 5, 0, 0, 0, 0], streak: 1 },
    { id: 'b', name: 'Bea', shared: true, week: [10, 0, 0, 0, 0, 0, 0], streak: 1 },
    { id: 'c', name: 'Carlos', shared: false, week: [], streak: 0 },
  ]);
  assert.deepEqual(r.map(p => [p.name, p.total, p.pos]), [['Ana', 15, 1], ['Eva', 10, 2], ['Bea', 10, 2]]);
  assert.equal(initial(' eva'), 'E');
});
