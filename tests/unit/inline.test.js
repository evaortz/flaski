import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, nodesOf, toHTML, toLiveHTML, toPlain, toRuns, fromRuns, sliceMarkdown, toggleMark, marksAt, paletteFor } from '../../js/inline.js';

const kinds = s => nodesOf(parse(s)).map(n => n.t + (n.v ? ':' + n.v : ''));

test('formato: negrita, cursiva, subrayado, tachado, código, resaltado y colores', () => {
  assert.equal(toHTML('**a** *b* <u>c</u> ~~d~~ `e` ==f=='), '<b>a</b> <i>b</i> <u>c</u> <s>d</s> <code>e</code> <mark class="hl hl-yellow">f</mark>');
  assert.equal(toHTML('<span style="color:red">rojo</span>'), '<span class="tc tc-red">rojo</span>');
  assert.equal(toHTML('<mark style="background:blue">fondo</mark>'), '<mark class="hl hl-blue">fondo</mark>');
  assert.equal(toHTML('[web](https://x.org/a_b)'), '<a href="https://x.org/a_b" target="_blank" rel="noopener noreferrer">web</a>');
  assert.equal(toHTML('***ambas***'), '<i><b>ambas</b></i>');
  assert.equal(toHTML('**negrita con *cursiva* dentro**'), '<b>negrita con <i>cursiva</i> dentro</b>');
});

test('formato: lo que no es una marca se queda como texto', () => {
  assert.equal(toHTML('5 * 3 * 2'), '5 * 3 * 2');
  assert.equal(toHTML('a == b'), 'a == b');
  assert.equal(toHTML('snake_case_name'), 'snake_case_name');
  assert.equal(toHTML('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.equal(toHTML('<span style="color:#f00">x</span>'), '&lt;span style=&quot;color:#f00&quot;&gt;x&lt;/span&gt;');
  assert.equal(toHTML('\\*no\\*'), '*no*');
  assert.equal(toHTML('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
  assert.equal(toHTML('línea 1\nlínea 2'), 'línea 1<br>línea 2');
  assert.equal(toHTML('`**no**`'), '<code>**no**</code>');
});

test('formato: imágenes y furigana siguen funcionando', () => {
  assert.match(toHTML('![pie](img:abcd1234)'), /data-img="abcd1234"/);
  assert.equal(toHTML('漢字[かんじ]'), '<ruby>漢字<rt>かんじ</rt></ruby>');
});

test('formato: las tablas de marcas mal anidadas no rompen nada', () => {
  assert.deepEqual(kinds('<u>a **b</u> c**'), ['u']);
  assert.equal(toPlain('<u>a **b</u> c**'), 'a **b c**');
});

test('editor: el texto del HTML es exactamente el Markdown', () => {
  const src = '**Hola** <span style="color:red">mundo</span> `x` y\n';
  const live = toLiveHTML(src, 0, 0);
  const text = live.replace(/<br>$/, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  assert.equal(text, src);
  // Solo se ven las marcas de lo que toca el cursor
  assert.match(live, /fm fm-b on/);
  assert.doesNotMatch(live, /fm fm-color on/);
  assert.match(toLiveHTML(src, 12, 12), /fm fm-color on/);
});

test('sin marcas: para buscar y para títulos', () => {
  assert.equal(toPlain('**El** <u>locativo</u> ==indica== `-de`'), 'El locativo indica -de');
});

test('tramos con estilo → Markdown, con los espacios fuera de las marcas', () => {
  assert.equal(fromRuns([{ text: 'Hola ', st: { b: true } }, { text: 'mundo', st: { b: true, i: true } }, { text: ' y más', st: {} }]), '**Hola *mundo*** y más');
  assert.equal(fromRuns([{ text: 'rojo ', st: { color: 'red' } }, { text: 'normal', st: {} }]), '<span style="color:red">rojo</span> normal');
  assert.equal(fromRuns([{ text: '5 * 3', st: {} }]), '5 \\* 3');
  assert.equal(fromRuns([{ text: 'enlace', st: { href: 'https://a.es' } }]), '[enlace](https://a.es)');
  // Ida y vuelta
  for (const s of ['**a** *b* <u>c</u>', '==res== <mark style="background:green">verde</mark>', '**negrita *y cursiva***']) {
    assert.equal(toHTML(fromRuns(toRuns(s))), toHTML(s));
  }
});

test('copiar un trozo conserva su formato', () => {
  assert.equal(sliceMarkdown('Esto es **muy importante** hoy', 12, 16), '**y im**');
  assert.equal(sliceMarkdown('a <u>bcd</u> e', 0, 14), 'a <u>bcd</u> e');
});

test('dar formato: pone y quita marcas', () => {
  assert.deepEqual(toggleMark('hola mundo', 5, 10, 'b'), { text: 'hola **mundo**', a: 7, b: 12 });
  assert.deepEqual(toggleMark('hola **mundo**', 7, 12, 'b'), { text: 'hola mundo', a: 5, b: 10 });
  // Seleccionado con las marcas incluidas
  assert.equal(toggleMark('hola **mundo**', 5, 14, 'b').text, 'hola mundo');
  // Los espacios de los bordes de la selección se quedan fuera
  assert.equal(toggleMark('hola mundo', 4, 10, 'i').text, 'hola *mundo*');
  // Quitar solo una parte
  assert.equal(toggleMark('**uno dos tres**', 6, 9, 'b').text, '**uno** dos **tres**');
  // Selección que corta otro formato: se amplía
  assert.equal(toggleMark('a *bc* d', 3, 8, 'b').text, 'a ***bc* d**');
  // Una parte ya en negrita y otra no: todo en negrita
  assert.equal(toggleMark('uno **dos** tres', 0, 16, 'b').text, '**uno dos tres**');
  // Sin selección, la palabra donde está el cursor
  assert.equal(toggleMark('hola mundo', 7, 7, 'u').text, 'hola <u>mundo</u>');
  // Sin selección y sin palabra: marcas vacías, el cursor en medio
  assert.deepEqual(toggleMark('hola ', 5, 5, 'b'), { text: 'hola ****', a: 7, b: 7 });
});

test('dar formato: colores y fondos', () => {
  assert.equal(toggleMark('hola mundo', 5, 10, 'color', 'red').text, 'hola <span style="color:red">mundo</span>');
  assert.equal(toggleMark('hola <span style="color:red">mundo</span>', 28, 33, 'color', 'blue').text, 'hola <span style="color:blue">mundo</span>');
  assert.equal(toggleMark('hola <span style="color:red">mundo</span>', 28, 33, 'color', 'default').text, 'hola mundo');
  assert.equal(toggleMark('hola mundo', 5, 10, 'bg', 'yellow').text, 'hola ==mundo==');
  assert.equal(toggleMark('hola mundo', 5, 10, 'bg', 'green').text, 'hola <mark style="background:green">mundo</mark>');
  assert.deepEqual(marksAt('a **b** c', 4), { b: true });
});

test('colores al pegar: el de Notion más parecido; negro, gris y blanco no cuentan', () => {
  assert.equal(paletteFor(255, 0, 0), 'red');
  assert.equal(paletteFor(0, 0, 255), 'blue');
  assert.equal(paletteFor(17, 85, 204), 'blue');
  assert.equal(paletteFor(255, 255, 0, true), 'yellow');
  assert.equal(paletteFor(56, 118, 29), 'green');
  assert.equal(paletteFor(32, 33, 34), '');
  assert.equal(paletteFor(255, 255, 255, true), '');
  assert.equal(paletteFor(120, 60, 20), 'brown');
});
