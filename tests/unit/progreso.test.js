// Tu progreso: la serie de cada día se reconstruye con el historial de respuestas
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressSeries, nextLine } from '../../js/charts.js';

const DAY = 864e5;
const now = new Date(2026, 9, 22, 18).getTime();
const day = k => new Date(2026, 9, 22 - k, 10).getTime();     // hace k días, por la mañana
const card = (id, created, deck = 'd1') => ({ id, deck_id: deck, created_at: new Date(created).toISOString() });
const ev = (card_id, t, ivl, last_ivl = 0, state = last_ivl ? 'review' : 'new') => ({ card_id, t, ivl, last_ivl, state, grade: 3 });

test('cuenta cada tarjeta según el intervalo con el que la dejó su última respuesta de ese día', () => {
  const cards = [card('a', day(20)), card('b', day(20)), card('c', day(5))];
  const events = [ev('a', day(10), 1), ev('a', day(8), 3, 1), ev('a', day(2), 25, 3), ev('b', day(4), 0), ev('b', day(1), 1, 0, 'learning')];
  const s = progressSeries({ events, cards, progress: new Map(), period: 'm1', now });
  assert.equal(s.length, 30);
  const at = k => s[s.length - 1 - k];
  assert.deepEqual([at(11).m1, at(11).m2, at(11).m3, at(11).total], [0, 0, 0, 2]);
  assert.deepEqual([at(9).m2, at(9).total], [1, 2]);
  assert.deepEqual([at(4).m1, at(4).m2, at(4).total], [1, 1, 3]);   // b aprendiendo; c ya existe
  assert.deepEqual([at(0).m1, at(0).m2, at(0).m3], [0, 1, 1]);
  assert.equal(at(5).adds.get('d1'), 1);                            // c llegó ese día
});

test('si el historial empieza a medias, la tarjeta ya estaba así desde que la viste', () => {
  const cards = [card('a', day(40))];
  const progress = new Map([['a', { firstSeen: day(25), interval: 40, due: now + 10 * DAY }]]);
  const s = progressSeries({ events: [ev('a', day(3), 60, 30)], cards, progress, period: 'm1', now });
  assert.equal(s[3].m3, 0);                                          // hace 26 días aún no la habías visto
  assert.equal(s[5].m3, 1);                                          // hace 24, ya consolidada (intervalo de 30)
  // Sin respuestas guardadas: según el progreso actual, desde que la viste
  const s2 = progressSeries({ events: [], cards, progress, period: 'm1', now });
  assert.equal(s2[0].m3, 0);
  assert.equal(s2[s2.length - 1].m3, 1);
});

test('una tarjeta importada con respuestas anteriores cuenta desde su primera respuesta', () => {
  const s = progressSeries({ events: [ev('a', day(20), 2)], cards: [card('a', day(1))], progress: new Map(), period: 'm1', now });
  assert.equal(s[s.length - 21].total, 1);
  assert.equal(s[s.length - 21].m2, 1);
});

test('«Todo» empieza el primer día con tarjetas', () => {
  const s = progressSeries({ events: [], cards: [card('a', day(100))], progress: new Map(), period: 'all', now });
  assert.equal(s.length, 101);
  assert.equal(s[0].total, 1);
});

test('la línea de lo que toca: mañana y el día más cargado de la semana', () => {
  const cards = ['a', 'b', 'c', 'd'].map(id => card(id, day(9)));
  const p = (k) => ({ due: new Date(2026, 9, 22 + k, 9).getTime() });
  const progress = new Map([['a', p(1)], ['b', p(3)], ['c', p(3)], ['d', p(3)]]);
  const txt = nextLine(cards, progress, now);
  assert.match(txt, /Mañana te toca <b>1<\/b>/);
  assert.match(txt, /el dom \(3\)/);
});
