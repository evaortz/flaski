import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, crc32, pageToDocx, pageToHTML, markdownWithImages, pageImageIds, csvToBlocks, markdownToPage, titleFromFile, markdownImageRefs, safeName } from '../../js/notesio.js';
import { readZip } from '../../js/zip.js';

const page = {
  title: 'La célula',
  blocks: [
    { id: 'a', type: 'h2', text: 'Partes' },
    { id: 'b', type: 'p', text: 'La **célula** tiene <span style="color:red">núcleo</span> y ==membrana==. Ver [[Mitosis]].' },
    { id: 'c', type: 'li', text: 'Núcleo' },
    { id: 'd', type: 'li', text: 'ADN', indent: 1 },
    { id: 'e', type: 'ol', text: 'Uno' },
    { id: 'f', type: 'todo', text: 'Repasar', checked: true },
    { id: 'g', type: 'table', text: '| Parte | Función |\n| --- | :---: |\n| Núcleo | Control |' },
    { id: 'h', type: 'img', text: 'Esquema', src: 'img12345' },
    { id: 'i', type: 'code', text: 'x = 1 < 2' },
  ],
};

test('zip: lo que se escribe se vuelve a leer igual', async () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610A686);
  const z = writeZip([{ name: 'a/ñ.md', data: 'Hola **mundo**' }, { name: 'b.bin', data: new Uint8Array([1, 2, 3]) }]);
  const files = readZip(z);
  assert.deepEqual([...files.keys()], ['a/ñ.md', 'b.bin']);
  assert.equal(new TextDecoder().decode(await files.get('a/ñ.md').read()), 'Hola **mundo**');
  assert.deepEqual([...await files.get('b.bin').read()], [1, 2, 3]);
});

test('Word: un .docx con títulos, listas, tablas, formato e imágenes', async () => {
  const img = { bytes: new Uint8Array([137, 80, 78, 71]), ext: 'png', w: 800, h: 400 };
  const files = readZip(pageToDocx(page, new Map([['img12345', img]])));
  for (const n of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', 'word/media/img1.png']) assert.ok(files.has(n), n);
  const doc = new TextDecoder().decode(await files.get('word/document.xml').read());
  assert.match(doc, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">La célula/);
  assert.match(doc, /Heading2/);
  assert.match(doc, /<w:b\/><\/w:rPr><w:t xml:space="preserve">célula/);
  assert.match(doc, /<w:color w:val="D44C47"\/>/);          // rojo
  assert.match(doc, /w:fill="FBF3DB"/);                      // resaltado amarillo
  assert.match(doc, /Mitosis/);
  assert.match(doc, /<w:ilvl w:val="1"\/>/);                 // sangría de la lista
  assert.match(doc, /☑ /);
  assert.match(doc, /<w:tbl>/);
  assert.match(doc, /x = 1 &lt; 2/);
  assert.match(doc, /r:embed="rId\d+"/);
  assert.match(doc, /cx="5715000"/);                        // 600 px de ancho como mucho
});

test('HTML: una página completa, con las imágenes dentro', () => {
  const html = pageToHTML(page, new Map([['img12345', 'data:image/png;base64,AAAA']]));
  assert.match(html, /<title>La célula<\/title>/);
  assert.match(html, /<h2>Partes<\/h2>/);
  assert.match(html, /<b>célula<\/b>/);
  assert.match(html, /<ul><li>Núcleo<\/li><ul><li>ADN<\/li><\/ul><\/ul>/);
  assert.match(html, /<th>Parte<\/th><th style="text-align:center">Función<\/th>/);
  assert.match(html, /<img src="data:image\/png;base64,AAAA" alt="Esquema">/);
  assert.doesNotMatch(html, /data-wiki/);
});

test('Markdown con sus imágenes en una carpeta', () => {
  assert.deepEqual(pageImageIds(page), ['img12345']);
  const md = markdownWithImages(page, new Map([['img12345', 'img12345.webp']]));
  assert.match(md, /!\[Esquema\]\(imagenes\/img12345\.webp\)/);
  assert.match(md, /^# La célula/);
  assert.match(md, /\n  - ADN/);
});

test('importar: Markdown, CSV y nombres de archivo', () => {
  const p = markdownToPage('---\ntags: [a]\n---\n# Mitosis\n\nDivisión **celular**.\n\n- Profase\n  - Inicio', 'x.md');
  assert.equal(p.title, 'Mitosis');
  assert.deepEqual(p.blocks.map(b => [b.type, b.indent || 0]), [['p', 0], ['li', 0], ['li', 1]]);
  assert.equal(markdownToPage('Hola', 'Mi tema 0123456789abcdef0123456789abcdef.md').title, 'Mi tema');
  assert.equal(titleFromFile('carpeta/apuntes-de_biologia.txt'), 'apuntes de biologia');
  const [t] = csvToBlocks('Caso;Sufijo\nLocativo;-de\nAblativo;"-den, -dan"');
  assert.equal(t.type, 'table');
  assert.match(t.text, /\| Ablativo \| -den, -dan \|/);
  assert.deepEqual(markdownImageRefs('a ![x](img/f%20o.png) b ![[foto.jpg|200]] ![web](https://x.org/a.png)').map(r => r.path), ['img/f%20o.png', 'foto.jpg']);
  assert.equal(safeName('¿Qué? / ¡Sí!: <tema>'), '¿Qué ¡Sí! tema');
});
