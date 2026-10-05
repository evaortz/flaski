import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TYPES, checkTyped, activeTemplates, orderTokens, orderJoin, stripRuby, readRuby, splitQuick, summarize, choiceOptions } from '../../js/cardtypes.js';

test('checkTyped: ignora mayúsculas, espacios y puntuación final; acepta varias respuestas', () => {
  assert.equal(checkTyped('  Yaptım. ', 'yaptım').ok, true);
  assert.equal(checkTyped('gittim', 'gidiyorum / gittim').ok, true);
  assert.equal(checkTyped('yaptim', 'yaptım').ok, false);
});

test('checkTyped marca la letra que sobra y la que falta', () => {
  const { diff } = checkTyped('yaptim', 'yaptım');
  assert.deepEqual(diff.filter(d => d.t !== 'ok').map(d => `${d.t}:${d.c}`).sort(), ['extra:i', 'miss:ı']);
});

test('furigana: separa el kanji de la lectura', () => {
  assert.equal(stripRuby('水[みず]を飲[の]む'), '水を飲む');
  assert.equal(readRuby('水[みず]を飲[の]む'), 'みずをのむ');
});

test('ordenar: por espacios o por barras, y une sin espacios en japonés', () => {
  assert.deepEqual(orderTokens('Ben eve gidiyorum'), ['Ben', 'eve', 'gidiyorum']);
  const ja = '私は / 学生 / です';
  assert.deepEqual(orderTokens(ja), ['私は', '学生', 'です']);
  assert.equal(orderJoin(orderTokens(ja), ja), '私は学生です');
});

test('creación rápida: detecta el separador', () => {
  assert.deepEqual(splitQuick('ev - casa', 'auto'), ['ev', 'casa']);
  assert.deepEqual(splitQuick('ev\tcasa', 'auto'), ['ev', 'casa']);
  assert.deepEqual(splitQuick('solo', 'auto'), ['solo']);
});

test('los tipos incluidos son coherentes: las plantillas usan campos que existen', () => {
  for (const t of BUILTIN_TYPES) {
    const ids = new Set(t.fields.map(f => f.id));
    for (const tpl of t.templates) {
      for (const id of [...tpl.front, ...tpl.back, ...(tpl.answer ? [tpl.answer] : [])]) {
        assert.ok(ids.has(id), `${t.id}/${tpl.id} usa el campo inexistente ${id}`);
      }
    }
  }
});

test('activeTemplates: una nota solo crea las tarjetas que tienen contenido', () => {
  for (const t of BUILTIN_TYPES) assert.deepEqual(activeTemplates(t, {}), [], `${t.id} vacío no crea tarjetas`);
  const cloze = BUILTIN_TYPES.find(t => t.templates.some(x => x.mode === 'cloze'));
  const tpl = cloze.templates.find(x => x.mode === 'cloze');
  assert.equal(activeTemplates(cloze, { [tpl.front[0]]: 'sin huecos' }).length, 0);
  assert.equal(activeTemplates(cloze, { [tpl.front[0]]: 'Ev{{de}}yim' }).length, 1);
  const s = summarize(cloze, tpl, { [tpl.front[0]]: 'Ev{{de::lugar}}yim' });
  assert.equal(s.front, 'Ev[lugar]yim');
  assert.equal(s.back, 'Evdeyim');
});

test('opción múltiple: la correcta siempre está y no hay repetidas', () => {
  const t = BUILTIN_TYPES.find(x => x.templates.some(tp => tp.mode === 'choice'));
  const tpl = t.templates.find(tp => tp.mode === 'choice');
  for (let i = 0; i < 20; i++) {
    const { correct, opts } = choiceOptions(tpl, { [tpl.answer]: 'casa' }, ['casa', 'puerta', 'libro', 'árbol', 'agua']);
    assert.equal(correct, 'casa');
    assert.ok(opts.includes('casa'));
    assert.equal(new Set(opts).size, opts.length);
    assert.equal(opts.length, 4);
  }
});
