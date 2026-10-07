import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageIds, imageIdsOf, stripImages, hasImages, imgToken, newImageId } from '../../js/media.js';
import { textToBlocks, pageToMarkdown, imageBlock, pageTitle } from '../../js/pages.js';

test('imágenes en el texto: se encuentran, se quitan y se crean', () => {
  const s = 'Ev ![casa](img:abc123)\n![](img:zz99zz-1)';
  assert.deepEqual([...imageIds(s)], ['abc123', 'zz99zz-1']);
  assert.equal(stripImages('hola ![](img:abcd12) adiós'), 'hola adiós');
  assert.ok(hasImages(s));
  assert.ok(!hasImages('[x](http://a)'));
  assert.equal(imgToken('abcd12', 'un ] pie'), '![un   pie](img:abcd12)');
  assert.match(newImageId(), /^[a-z0-9]{14}$/);
});

test('ids de imagen de tarjetas y apuntes', () => {
  const ids = imageIdsOf({
    cards: [{ front: '![](img:aaaa11)', back: 'x', fields: { q: '![](img:bbbb22)', a: 'y' } }],
    pages: [{ blocks: [imageBlock('cccc33', 'pie'), { id: 'b', type: 'p', text: '![](img:dddd44)' }] }],
  });
  assert.deepEqual([...ids].sort(), ['aaaa11', 'bbbb22', 'cccc33', 'dddd44']);
});

test('apuntes: un bloque de imagen va y vuelve en Markdown', () => {
  const page = { title: 'Mapa', blocks: [{ id: 'a', type: 'p', text: 'Antes' }, imageBlock('abcd1234', 'Turquía'), imageBlock('efgh5678')] };
  const md = pageToMarkdown(page);
  assert.equal(md, '# Mapa\n\nAntes\n\n![Turquía](img:abcd1234)\n\n![](img:efgh5678)\n');
  const back = textToBlocks(md).slice(1);
  assert.deepEqual(back.map(b => [b.type, b.text, b.src]), [['p', 'Antes', undefined], ['img', 'Turquía', 'abcd1234'], ['img', '', 'efgh5678']]);
  assert.equal(pageTitle({ blocks: [imageBlock('abcd1234', 'pie'), { id: 'x', type: 'p', text: 'Hola' }] }), 'Hola');
});
