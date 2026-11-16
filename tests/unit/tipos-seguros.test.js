// Los tipos que llegan de otra persona (lista pública) o de un archivo acaban en atributos HTML (ids, modo, idioma):
// safeType solo deja pasar ids sencillos, modos e idiomas conocidos y plantillas que apuntan a sus campos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TYPES, safeType, langOk } from '../../js/cardtypes.js';

test('los tipos de la app pasan tal cual (salvo rellenar nombre y ayuda)', () => {
  for (const t of BUILTIN_TYPES) assert.ok(safeType(t), t.id);
  const t = safeType(BUILTIN_TYPES[1]);
  assert.deepEqual(t.fields.map(f => f.lang), BUILTIN_TYPES[1].fields.map(f => f.lang));
});

test('un modo, un id o una plantilla con HTML no se aceptan', () => {
  const base = { name: 'X', fields: [{ id: 'q', name: 'P' }, { id: 'a', name: 'R' }], templates: [{ id: 't1', mode: 'flip', front: ['q'], back: ['a'] }] };
  assert.ok(safeType(base));
  assert.equal(safeType({ ...base, templates: [{ ...base.templates[0], mode: 'x"><img src=x onerror=alert(1)>' }] }), null);
  assert.equal(safeType({ ...base, fields: [{ id: 'q" onfocus="x', name: 'P' }, base.fields[1]] }), null);
  assert.equal(safeType({ ...base, templates: [{ ...base.templates[0], id: '<b>' }] }), null);
  assert.equal(safeType({ ...base, templates: [{ ...base.templates[0], front: ['nope'] }] }), null);
  assert.equal(safeType({ ...base, templates: [{ ...base.templates[0], answer: 'zz' }] }), null);
  assert.equal(safeType({ ...base, fields: [] }), null);
  assert.equal(safeType(null), null);
});

test('un idioma que no es de la lista se queda en «sin audio»', () => {
  const t = safeType({ name: 'X', fields: [{ id: 'q', lang: 'de" autofocus onfocus="x' }, { id: 'a', lang: 'ja-JP' }], templates: [{ id: 't1', mode: 'flip', front: ['q'], back: ['a'] }] });
  assert.deepEqual(t.fields.map(f => f.lang), ['', 'ja-JP']);
  assert.ok(langOk('') && langOk('de-DE') && langOk('@study'));
  assert.ok(!langOk('de" x') && !langOk(undefined));
});
