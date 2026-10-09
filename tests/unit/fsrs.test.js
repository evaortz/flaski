import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, startOfDay, DAY, ALGO_PRESETS } from '../../js/srs.js';
import { retrievability, intervalFor, initStability, initDifficulty, memoryOf, easeFromDifficulty, difficultyFromEase } from '../../js/fsrs.js';
import { algoFor, loadPrefs } from '../../js/prefs.js';
import { toRow, fromRow, progressCols } from '../../js/rows.js';

const NOW = new Date('2026-03-10T10:00:00').getTime();
const A = ALGO_PRESETS.fsrs.algo;
const days = s => Math.round((startOfDay(s.due) - startOfDay(NOW)) / DAY);

test('fórmulas básicas: con la estabilidad en días, recuerdas al 90 %', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.ok(Math.abs(intervalFor(10, 0.9) - 10) < 1e-9);
  assert.ok(intervalFor(10, 0.8) > intervalFor(10, 0.9));   // menos retención, intervalos más largos
  assert.equal(initStability(3), 3.173);
  assert.ok(initDifficulty(1) > initDifficulty(3) && initDifficulty(3) > initDifficulty(4));
  assert.ok(Math.abs(difficultyFromEase(easeFromDifficulty(6.2)) - 6.2) < 0.01);
});

test('una nueva: «Bien» a los 3 días, «Fácil» a las 2 semanas, «Otra vez» en un minuto', () => {
  assert.equal(days(schedule(null, 3, NOW, A)), 3);
  assert.ok(days(schedule(null, 4, NOW, A)) >= 14);
  const again = schedule(null, 1, NOW, A);
  assert.equal(again.interval, 0);
  assert.equal(again.due, NOW + 60e3);
  assert.ok(again.stability > 0 && again.difficulty > 0);
});

test('acertar con «Bien» a tiempo hace crecer los intervalos; fallar los reinicia y cuenta el fallo', () => {
  let s = null, t = NOW;
  const ivs = [];
  for (let i = 0; i < 6; i++) { s = schedule(s, 3, t, A); ivs.push(s.interval); t = s.due; }
  for (let i = 1; i < ivs.length; i++) assert.ok(ivs[i] > ivs[i - 1], `crece: ${ivs}`);
  const before = s.stability;
  const lapse = schedule(s, 1, t, A);
  assert.equal(lapse.interval, 0);
  assert.equal(lapse.lapses, 1);
  assert.ok(lapse.stability < before);
  const back = schedule(lapse, 3, t + 10 * 60e3, A);   // reaprendida el mismo día
  assert.ok(back.interval >= 1 && back.interval < ivs.at(-1));
});

test('«Difícil» da menos días que «Bien», y «Bien» menos que «Fácil»', () => {
  const card = schedule(schedule(null, 3, NOW, A), 3, NOW + 3 * DAY, A);
  const at = card.due;
  const [h, g, e] = [2, 3, 4].map(x => schedule(card, x, at, A).interval);
  assert.ok(h < g && g < e, `${h} < ${g} < ${e}`);
});

test('una tarjeta del algoritmo clásico se pasa a FSRS con su intervalo y su facilidad', () => {
  const old = { reps: 4, interval: 20, ease: 2.5, lapses: 0, due: NOW, firstSeen: NOW - 60 * DAY, last: NOW - 20 * DAY };
  const m = memoryOf(old);
  assert.ok(Math.abs(m.S - 20) < 1e-9);
  const next = schedule(old, 3, NOW, A);
  assert.ok(next.interval > 20);
});

test('retención deseada: desde Ajustes, y solo con FSRS', () => {
  const p = loadPrefs({ algo: { preset: 'fsrs', retention: 0.85 } });
  assert.equal(algoFor(p, null).retention, 0.85);
  assert.equal(algoFor(p, null).fsrs, true);
  assert.equal(algoFor(loadPrefs({ algo: { preset: 'custom', custom: { fsrs: true } } }), null).fsrs, false);
  const lo = schedule(schedule(null, 3, NOW, algoFor(p, null)), 3, NOW + 3 * DAY, algoFor(p, null));
  const hi = schedule(schedule(null, 3, NOW, A), 3, NOW + 3 * DAY, A);
  assert.ok(lo.interval > hi.interval);
});

test('estabilidad y dificultad se guardan si la base de datos tiene las columnas', () => {
  const s = schedule(null, 3, NOW, A);
  const row = toRow('u', 'c', s);
  assert.equal(row.stability, s.stability);
  assert.equal(fromRow(row).difficulty, s.difficulty);
  progressCols.extra = false;
  assert.equal('stability' in toRow('u', 'c', s), false);
  progressCols.extra = true;
});
