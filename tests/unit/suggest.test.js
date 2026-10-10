import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCards, sentences, looksSpanish, plainText } from '../../js/suggest.js';
import { textToBlocks } from '../../js/pages.js';

const run = (md, opts) => suggestCards({ title: '', blocks: textToBlocks(md) }, opts);
const brief = list => list.map(s => [s.kind, s.front, s.back]);

test('frases: no corta en abreviaturas', () => {
  assert.deepEqual(sentences('Llegó en el s. XV, p. ej. en 1492. Después volvió. ¿Y luego? Nada.'), ['Llegó en el s. XV, p. ej. en 1492.', 'Después volvió.', '¿Y luego?', 'Nada.']);
  assert.ok(looksSpanish('en la escuela') > looksSpanish('okulda'));
  assert.equal(plainText('La **célula** es *la* base {{de}} todo'), 'La célula es la base de todo');
});

test('definiciones: el término tal cual; también dentro de un párrafo; las etiquetas no', () => {
  const r = run('Mitosis: división de una célula en dos células hijas.\n\nNota: repasar el tema 3.\n\nEjemplo: una célula de la piel.\n\nTodo bien. Meiosis: división que da cuatro células con la mitad de cromosomas.');
  assert.deepEqual(brief(r), [
    ['def', 'Mitosis', 'División de una célula en dos células hijas.'],
    ['def', 'Meiosis', 'División que da cuatro células con la mitad de cromosomas'],
  ]);
  assert.ok(r.every(s => s.selected));
});

test('conceptos con verbo: la pregunta con el artículo y el tiempo del texto; los sujetos vagos no', () => {
  const r = run([
    'La Revolución francesa fue un conflicto social y político que transformó Francia.',
    'Luis XVI fue el último rey de Francia antes de la revolución.',
    'Los jacobinos eran el grupo más radical de la Asamblea.',
    'El sistema de pesos y medidas que se creó entonces se denomina sistema métrico decimal.',
    'Esto es algo que conviene recordar.', 'Lo importante es que la célula tiene membrana.', 'Hoy es un tema clave del examen.',
    'Me gusta mucho este tema, es interesante y bastante largo, pero hay que estudiarlo.',
  ].join('\n\n'));
  assert.deepEqual(r.map(s => [s.front, s.back]), [
    ['¿Qué fue la Revolución francesa?', 'Un conflicto social y político que transformó Francia'],
    ['¿Quién fue Luis XVI?', 'El último rey de Francia antes de la revolución'],
    ['¿Qué eran los jacobinos?', 'El grupo más radical de la Asamblea'],
    ['¿Cómo se llama el sistema de pesos y medidas que se creó entonces?', 'Sistema métrico decimal'],
  ]);
});

test('negritas: un hueco por cada una, en su frase', () => {
  const r = run('La **célula** es la unidad básica de la vida. Los seres vivos están hechos de células.');
  assert.deepEqual(brief(r), [['bold', 'La […] es la unidad básica de la vida.', 'La célula es la unidad básica de la vida.']]);
  assert.equal(r[0].typeId, 'cloze');
  assert.equal(r[0].fields.x, 'La {{célula}} es la unidad básica de la vida.');
});

test('listas: pasos con lista numerada; «… son:» como pregunta; listas hermanas para clasificar', () => {
  const r = run('# Célula\n\n## Fases de la mitosis\n\n1. Profase\n2. Metafase\n3. Anafase\n4. Telofase\n\n## Ventajas\n\n- Rápida\n- Barata\n\n## Inconvenientes\n\n- Poco precisa\n- Requiere luz\n\n## Núcleo\n\nLas funciones del núcleo son:\n\n- Guardar el ADN\n- Controlar la célula');
  const by = k => r.find(s => s.kind === k);
  assert.equal(by('steps').front, 'Ordena: fases de la mitosis');
  assert.equal(by('steps').fields.s, 'Profase\nMetafase\nAnafase\nTelofase');
  assert.equal(by('sort').fields.g, 'Ventajas: Rápida, Barata\nInconvenientes: Poco precisa, Requiere luz');
  assert.equal(by('list').front, '¿Cuáles son las funciones del núcleo?');
  assert.equal(by('list').back, '- Guardar el ADN\n- Controlar la célula');
});

test('tablas: una tarjeta por celda; de dos columnas cortas, también emparejar; de pronombres, conjugación', () => {
  const t = run('| Orgánulo | Función |\n| --- | --- |\n| Mitocondria | Energía |\n| Ribosoma | Proteínas |\n| Lisosoma | Digestión |');
  assert.deepEqual(t.filter(s => s.kind === 'table').map(s => [s.front, s.back]), [['Mitocondria → función', 'Energía'], ['Ribosoma → función', 'Proteínas'], ['Lisosoma → función', 'Digestión']]);
  assert.equal(t.find(s => s.kind === 'match').selected, false);
  const c = run('## Conjugación de gehen\n\n| Persona | Präsens | Präteritum |\n| --- | --- | --- |\n| ich | gehe | ging |\n| du | gehst | gingst |\n| er | geht | ging |', { lang: 'de-DE' });
  assert.deepEqual(c.map(s => [s.kind, s.fields.v, s.fields.k]), [['conj', 'gehen', 'Präsens'], ['conj', 'gehen', 'Präteritum']]);
  assert.equal(c[0].fields.f, 'ich = gehe\ndu = gehst\ner = geht');
});

test('mazos de idiomas: vocabulario con el lado del idioma bien puesto, frases para ordenar', () => {
  const r = run('- evde – en casa\n- en el trabajo = işte\n- kapı (puerta)\n- Ben evde kitap okuyorum – Leo un libro en casa', { lang: 'tr-TR' });
  assert.deepEqual(r.map(s => [s.kind, s.typeId, s.front, s.back]), [
    ['vocab', 'vocab', 'evde', 'en casa'], ['vocab', 'vocab', 'işte', 'en el trabajo'], ['vocab', 'vocab', 'kapı', 'puerta'],
    ['phrase', 'order', 'Leo un libro en casa', 'Ben evde kitap okuyorum'],
  ]);
  // En un mazo sin idioma, los mismos pares son tarjetas básicas
  assert.ok(run('- evde – en casa').every(s => s.typeId === 'basic'));
});

test('fechas y código', () => {
  const d = run('Napoleón Bonaparte llegó al poder en 1799 con un golpe de Estado.');
  assert.deepEqual(d.map(s => [s.kind, s.typeId, s.front, s.back]), [['date', 'number', 'Napoleón Bonaparte llegó al poder en ____ con un golpe de Estado.', '1799']]);
  const c = run('Para deshacer el último commit sin perder los cambios:\n\n```\ngit reset --soft HEAD~1\n```');
  assert.deepEqual(c.map(s => [s.kind, s.front]), [['code', '¿Cómo deshacer el último commit sin perder los cambios?']]);
});

test('no repite lo que ya es una tarjeta ni lo que sale dos veces', () => {
  const md = 'Mitosis: división celular en dos.\n\nMitosis: división celular en dos.';
  assert.equal(run(md).length, 1);
  assert.equal(run(md, { existing: [{ front: 'Mitosis' }] }).length, 0);
});
