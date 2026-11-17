// Japonés · las trampas del examen: lecturas parecidas y kanji que se parecen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readingTraps, kanjiTraps, lookalikes } from '../../js/ja/trampas.js';

const K = JSON.parse(readFileSync(new URL('../../data/ja/kanji.json', import.meta.url), 'utf8'));

test('lecturas trampa: la vocal larga, la っ, el ゛ y la ゃゅょ pequeña; nunca la buena', () => {
  const t = readingTraps('らいしゅう', 10);
  assert.ok(t.includes('らいしゅ'), t.join(' '));            // sin la vocal larga
  assert.ok(t.includes('らいしゆう'), t.join(' '));          // ゅ grande
  assert.ok(t.includes('らいじゅう'), t.join(' '));          // con ゛
  assert.ok(!t.includes('らいしゅう'));
  assert.ok(readingTraps('がっこう', 10).includes('がこう'));
  assert.ok(readingTraps('がっこう', 10).includes('がっこ'));
  assert.ok(readingTraps('きって', 10).includes('きて'));
  for (const r of ['あう', 'せんせい', 'いぬ', 'でんしゃ', 'ひゃく', 'みず']) {
    const x = readingTraps(r);
    assert.equal(x.length, 3, `${r}: ${x.join(' ')}`);
    assert.equal(new Set(x).size, 3);
    assert.ok(!x.includes(r));
  }
  assert.deepEqual(readingTraps('せんせい'), readingTraps('せんせい'), 'siempre las mismas');
});

test('kanji que se parecen: comparten piezas; la palabra con un kanji cambiado', () => {
  assert.ok(lookalikes('休', K).includes('体'), lookalikes('休', K).join(''));
  const t = kanjiTraps('学生', K);
  assert.equal(t.length, 3, t.join(' '));
  for (const w of t) { assert.notEqual(w, '学生'); assert.equal([...w].length, 2); }
  assert.ok(kanjiTraps('休み', K).every(w => w.endsWith('み')), 'la terminación no se toca');
});
