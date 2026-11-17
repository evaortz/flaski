// Japonés · niveles del JLPT: los datos del N5 y del N4 y qué cuenta como «lo sabes»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify, mineFrom, levelKanji, jlptData, jlptSittings, KNOW_DAYS } from '../../js/ja/niveles.js';

test('las convocatorias: el primer domingo de diciembre y de julio que vienen', () => {
  assert.deepEqual(jlptSittings('2026-11-17'), ['2026-12-06', '2027-07-04']);
  assert.deepEqual(jlptSittings('2026-12-06'), ['2027-07-04', '2027-12-05'], 'el mismo día ya no vale');
  assert.deepEqual(jlptSittings('2027-01-10'), ['2027-07-04', '2027-12-05']);
});

const ROOT = new URL('../../', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
globalThis.fetch = async url => { try { const b = await readFile(new URL(String(url), ROOT), 'utf8'); return { ok: true, json: async () => JSON.parse(b) }; } catch { return { ok: false, json: async () => ({}) }; } };

test('los datos: 684 palabras del N5 y 640 del N4, todas con significado en español; 103 y 181 kanji', async () => {
  const d = await jlptData(), K = await read('data/ja/kanji.json');
  assert.equal(d.n5.length, 684);
  assert.equal(d.n4.length, 640);
  for (const [k, kana, es] of [...d.n5, ...d.n4]) {
    assert.ok(kana, `sin lectura: ${k}`);
    assert.ok(es && !/^(to |the )/.test(es), `sin español: ${k || kana} (${es})`);
  }
  assert.ok(d.n5.some(([k]) => k === '明るい'), 'la forma del diccionario, no la de la lista original (明い)');
  assert.ok(/Waller/.test(d.fuente));
  assert.equal(levelKanji(K, 'n5').length, 103);
  assert.equal(levelKanji(K, 'n4').length, 181);
  assert.ok(levelKanji(K, 'n5').includes('日'));
});

test('«lo sabes» es estricto: hace falta recordarlo dentro de 3 semanas; lo demás de tus listas, aprendiéndolo', () => {
  const words = new Map([['会う', { stab: 40 }], ['青い', { stab: 9 }], ['あの', { stab: 0 }]]);
  const mine = mineFrom({ words, kanjiSteps: new Map(), kanjiInWords: new Map([['会', ['会う']], ['青', ['青い']]]), sabidas: ['赤い'] });
  const r = classify([['会う', 'あう', 'x'], ['青い', 'あおい', 'x'], ['赤い', 'あかい', 'x'], ['', 'あの', 'x'], ['秋', 'あき', 'x']], ['会', '青', '秋'], mine);
  assert.deepEqual(r.words.map(w => w.state), ['known', 'learning', 'known', 'learning', 'missing']);
  assert.deepEqual(r.w, { total: 5, known: 2, learning: 2, missing: 1 });
  assert.deepEqual(r.kanji.map(k => k.state), ['known', 'learning', 'missing']);
  assert.equal(r.pct, Math.round(100 * 3 / 8));
  assert.equal(KNOW_DAYS, 21);
});

test('una palabra que tienes solo en kana cuenta para la de la lista; con pregunta de kanji, manda su pregunta', () => {
  const mine = mineFrom({
    words: new Map([['ありがとう', { stab: 30 }], ['日本', { stab: 30 }]]),
    kanjiSteps: new Map([['日', { s1: 30, s2: 5 }], ['本', { s1: 30, s2: 30 }]]),
    kanjiInWords: new Map([['日', ['日本']], ['本', ['日本']]])
  });
  const r = classify([['', 'ありがとう', 'gracias'], ['日本', 'にほん', 'Japón']], ['日', '本'], mine);
  assert.deepEqual(r.words.map(w => w.state), ['known', 'known']);
  assert.deepEqual(r.kanji.map(k => k.state), ['learning', 'known'], 'el 日 aún no se lee bien: su lectura no llega');
});

test('con otro plazo (por ejemplo, los días hasta el examen) cambia lo que cuenta', () => {
  const words = new Map([['青い', { stab: 9 }]]);
  const r = days => classify([['青い', 'あおい', 'azul']], [], mineFrom({ words, kanjiSteps: new Map(), kanjiInWords: new Map() }, days)).w.known;
  assert.equal(r(21), 0);
  assert.equal(r(7), 1);
});
