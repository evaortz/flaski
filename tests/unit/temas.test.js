import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILTIN_TYPES, activeTemplates, summarize } from '../../js/cardtypes.js';
import { TEMAS, temaCards } from '../../js/primera-vez.js';

const read = f => JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));

test('temas de ejemplo: cada pregunta esperada da una pregunta de Flaski completa', () => {
  for (const t of TEMAS) {
    const list = read(t.cards), cards = temaCards(list);
    assert.equal(cards.length, list.length, t.cards);
    for (const c of cards) {
      const type = BUILTIN_TYPES.find(x => x.id === c.typeId);
      assert.ok(type, `${t.cards}: tipo ${c.typeId}`);
      const tpls = activeTemplates(type, c.fields);
      assert.ok(tpls.length, `${t.cards}: sin plantillas ${JSON.stringify(c.fields)}`);
      for (const tpl of tpls) {
        assert.ok(summarize(type, tpl, c.fields).front.trim());
      }
      assert.ok(c.answer);
    }
  }
});

test('temas de ejemplo: verdadero o falso, emparejar y una lista sin grupos', () => {
  const [tf, match, list] = temaCards([
    { tipo: 'truefalse', pregunta: 'La franja amarilla es el triple.', respuesta: 'Falso (es de doble anchura)' },
    { tipo: 'match', pregunta: 'Une', respuesta: 'art. 13.2 = 1992 · art. 135 = 2011' },
    { tipo: 'sort', pregunta: 'Algunas', respuesta: 'Espaciar · Intercalar' },
  ]);
  assert.deepEqual(tf.fields, { s: 'La franja amarilla es el triple.', v: 'F', n: 'es de doble anchura' });
  assert.equal(match.fields.p, 'art. 13.2 = 1992\nart. 135 = 2011');
  assert.deepEqual(list, { typeId: 'basic', fields: { q: 'Algunas', a: '- Espaciar\n- Intercalar' }, answer: 'Espaciar' });
});
