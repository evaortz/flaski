// Estadísticas con un cambio de hora dentro del periodo (Europe/Madrid): «90 días» son 90 días de calendario
process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../../js/stats.js';
import { dateKey } from '../../js/srs.js';

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ctx = events => ({ deckSet: new Set(['d']), cards: new Map([['c', { id: 'c', deck_id: 'd' }]]), progress: new Map(), log: {}, events, decks: new Map(), deckName: () => '', modeOf: () => 'flip' });

for (const [label, now, before, first] of [
  ['en verano, mirando al invierno', at(2027, 5, 10, 12), at(2027, 2, 9, 23, 30), at(2027, 2, 10, 0, 30)],
  ['en invierno, mirando al verano', at(2026, 12, 10, 12), at(2026, 9, 11, 23, 30), at(2026, 9, 12, 0, 30)],
]) {
  test(`90 días ${label}: ni un día de más ni sin la primera hora`, t => {
    t.mock.method(Date, 'now', () => now);
    const ev = tt => ({ card_id: 'c', deck_id: 'd', grade: 3, t: tt, ms: 1000, state: 'review' });
    const s = computeStats(ctx([ev(before), ev(first)]), { scope: 'all', period: 90, fcDays: 7 });
    assert.equal(dateKey(s.start), dateKey(first));
    assert.equal(new Date(s.start).getHours(), 0);
    assert.equal(s.periodDays, 90);
    assert.deepEqual(s.evs.map(e => e.t), [first]);
  });
}
