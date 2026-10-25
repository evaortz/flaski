// FORMATO-IA.md: ningún ejemplo lleva etiquetas (las IAs las copian y llenan Biblioteca de filtros) y todos se leen
// bien con notes.js, con las tarjetas que dicen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePasted, notesToDeck, dropTags } from '../../js/notes.js';

const md = readFileSync(new URL('../../FORMATO-IA.md', import.meta.url), 'utf8');
const examples = [...md.matchAll(/```json\r?\n([\s\S]*?)```\s*\r?\n\s*Este ejemplo crea (\d+) tarjetas\./g)].map(m => ({ json: m[1], cards: Number(m[2]) }));

test('FORMATO-IA.md: ningún ejemplo lleva tags', () => {
  assert.ok(examples.length >= 3);
  for (const ex of examples) for (const n of JSON.parse(ex.json).notes) assert.equal(n.tags, undefined, JSON.stringify(n));
});

test('FORMATO-IA.md: todos los ejemplos se leen bien con notes.js y crean las tarjetas que dicen', () => {
  for (const ex of examples) {
    const p = parsePasted('Aquí tienes:\n```json\n' + ex.json + '```');
    assert.equal(p.kind, 'json');
    const d = notesToDeck(p.data);
    assert.equal(d.cards.length, ex.cards, d.name);
    assert.deepEqual(d.issues.filter(i => i.skipped), []);
    assert.deepEqual(d.tagNames, []);
  }
});

test('dropTags: la lista se queda sin etiquetas', () => {
  const d = notesToDeck({ name: 'X', notes: [{ fields: { q: 'a', a: 'b' }, tags: ['uno'] }, { fields: { q: 'c', a: 'd' }, tags: ['dos'] }] });
  assert.deepEqual(d.tagNames, ['uno', 'dos']);
  const e = dropTags(d);
  assert.deepEqual(e.tagNames, []);
  assert.ok(e.cards.every(c => c.tagNames.length === 0));
  assert.equal(e.cards.length, 2);
});
