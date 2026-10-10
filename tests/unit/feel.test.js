import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buzz, canVibrate, swipeable, canAudio, chime } from '../../js/feel.js';

test('feel: canVibrate devuelve boolean y no lanza error en entorno sin navigator', () => {
  assert.equal(typeof canVibrate(), 'boolean');
  assert.doesNotThrow(() => buzz('ok'));
  assert.doesNotThrow(() => buzz('again'));
  assert.doesNotThrow(() => buzz('tick'));
  assert.doesNotThrow(() => buzz('stroke'));
});

test('feel: canAudio devuelve boolean y chime no lanza error en entorno sin AudioContext', () => {
  assert.equal(typeof canAudio(), 'boolean');
  assert.doesNotThrow(() => chime('again'));
  assert.doesNotThrow(() => chime('hard'));
  assert.doesNotThrow(() => chime('good'));
  assert.doesNotThrow(() => chime('easy'));
  assert.doesNotThrow(() => chime('done'));
  assert.doesNotThrow(() => chime('stroke'));
  assert.doesNotThrow(() => chime('miss'));
  assert.doesNotThrow(() => chime('desconocido'));
});

test('feel: swipeable se protege ante elementos nulos o vacíos', () => {
  assert.doesNotThrow(() => swipeable(null, { dirs: { left: 'Otra vez', right: 'Bien' } }));
});
