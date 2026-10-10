import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCards, sentences, looksSpanish, plainText, isAcronymPair, acronymCard, CALLOUT_PRE } from '../../js/suggest.js';
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

test('casos reales (PDFs de Wikipedia y de examen): conceptos bien cortados', () => {
  const r = run([
    'Se llama cariocinesis a la formación de los dos núcleos con que concluye habitualmente la mitosis.',
    'La cariocinesis (del griego cario = núcleo y cinesis = movimiento), mitosis astral o mitosis anfiastral, es la división del núcleo celular.',
    'En biología, la mitosis es un proceso que ocurre en el núcleo de las células eucariotas.',
    'Tras la duplicación, cada cromosoma consistirá en dos copias idénticas de la misma hebra de ADN, llamadas cromátidas hermanas.',
    'La mitosis se completa casi siempre con la llamada citocinesis o división del citoplasma.',
    'Así pues, es la unidad fisiológica de la vida.',
    'Las células son capaces de dirigir su propia síntesis.',
    'La diferenciación es a menudo parte del ciclo celular.',
    'Técnicamente no es parte de la mitosis.',
  ].join('\n\n'));
  assert.deepEqual(r.map(s => [s.front, s.back]), [
    ['¿Cómo se llama la formación de los dos núcleos con que concluye habitualmente la mitosis?', 'Cariocinesis'],
    ['¿Qué es la cariocinesis?', 'La división del núcleo celular'],
    ['¿Qué es la mitosis?', 'Un proceso que ocurre en el núcleo de las células eucariotas'],
    ['¿Cómo se llaman las dos copias idénticas de la misma hebra de ADN?', 'Cromátidas hermanas'],
  ]);
});

test('casos reales: apartados con su idea principal; títulos genéricos con contexto; sin bibliografía', () => {
  const r = run('# Célula\n\n## Orgánulos\n\n### Definición\n\nSe define a la célula como la unidad morfológica y funcional de todo ser vivo.\n\n### Profase\n\nSe produce en ella la condensación del material genético.\n\n### Tipos celulares\n\nExisten dos grandes tipos celulares:\n\n## Referencias\n\nMcIntosh, J. Richard: «Mitosis» (https://cshperspectives.org). Cold Spring Harbor.');
  assert.deepEqual(r.map(s => [s.kind, s.front]), [['section', 'Definición — Orgánulos'], ['section', 'Profase']]);
});

test('casos reales de examen: pregunta con su respuesta, saltando la línea para rellenar; opciones → opción múltiple; fichas con casillas fuera', () => {
  const r = run([
    '¿Cuáles son los tres poderes, según la teoría de la división de poderes?', '___________________, ___________________, y ____________________', 'Respuesta correcta:', 'Legislativo – Ejecutivo – Judicial',
    '¿Quién propuso la división de poderes?', '1. Voltaire.\n2. Montesquieu.\n3. Kant.', 'Respuesta correcta: Montesquieu.',
    '| Hecho | Relación |\n| --- | --- |\n| Malas cosechas | ☐ fue causa de |\n| Deudas | ☐ fue consecuencia de |',
  ].join('\n\n'));
  assert.deepEqual(r.map(s => [s.kind, s.typeId, s.front, s.back]), [
    ['qa', 'basic', '¿Cuáles son los tres poderes, según la teoría de la división de poderes?', 'Legislativo, Ejecutivo, Judicial'],
    ['qa', 'choice', '¿Quién propuso la división de poderes?', 'Montesquieu'],
  ]);
  assert.equal(r[1].fields.w, 'Voltaire; Kant');
});

test('casos reales: cronologías como fechas; números de nota fuera de las respuestas', () => {
  const r = run('- 1831: Robert Brown describió el núcleo celular.\n- Década de 1830: Theodor Schwann estudió la célula animal.\n\nRibosoma: Los ribosomas son partículas visibles al microscopio electrónico.15 Están formados por ARN.');
  assert.deepEqual(r.map(s => [s.kind, s.front, s.back]), [
    ['date', 'Robert Brown describió el núcleo celular — ¿cuándo?', '1831'],
    ['date', 'Theodor Schwann estudió la célula animal — ¿cuándo?', 'Década de 1830'],
    ['def', 'Ribosoma', 'Los ribosomas son partículas visibles al microscopio electrónico. Están formados por ARN.'],
  ]);
});

test('siglas y acrónimos: detecta ADN, OMS, OTAN, PIB y rechaza números romanos', () => {
  // Pruebas unitarias de isAcronymPair
  assert.ok(isAcronymPair('ADN', 'ácido desoxirribonucleico'));
  assert.ok(isAcronymPair('OMS', 'Organización Mundial de la Salud'));
  assert.ok(isAcronymPair('OTAN', 'Organización del Tratado del Atlántico Norte'));
  assert.ok(isAcronymPair('PIB', 'Producto Interior Bruto'));
  assert.ok(isAcronymPair('TIC', 'Tecnologías de la Información y la Comunicación'));
  assert.ok(!isAcronymPair('III', 'fase de mitosis'));
  assert.ok(!isAcronymPair('XIX', 'siglo de las luces'));
  assert.ok(!isAcronymPair('ABC', 'un gato negro'));

  // Pruebas en textos reales mediante run
  const r = run([
    'El ácido desoxirribonucleico (ADN) es la molécula portadora de la información genética.',
    'La Organización Mundial de la Salud (OMS) coordina las directrices sanitarias globales.',
    'El PIB (Producto Interior Bruto) refleja el valor monetario de la producción de un país.',
    'Las siglas ARN corresponden al ácido ribonucleico.',
  ].join('\n\n'));

  const siglas = r.filter(s => s.front.includes('siglas')).map(s => [s.front, s.back]);
  assert.deepEqual(siglas, [
    ['¿Qué significan las siglas ADN?', 'Ácido desoxirribonucleico'],
    ['¿Qué significan las siglas OMS?', 'Organización Mundial de la Salud'],
    ['¿Qué significan las siglas PIB?', 'Producto Interior Bruto'],
    ['¿Qué significan las siglas ARN?', 'Ácido ribonucleico'],
  ]);
  assert.ok(siglas.length === 4);
});

test('conceptos funcionales y objetivos: función de X, objetivo de X, se encarga de', () => {
  const r = run([
    'La función de los ribosomas es sintetizar proteínas a partir de la información del ARN.',
    'La función del núcleo celular es proteger y organizar el material genético.',
    'El objetivo del ensayo clínico es determinar la eficacia del nuevo tratamiento.',
    'El aparato de Golgi se encarga de transportar y empaquetar proteínas.',
    'Las mitocondrias tienen como función generar energía química en forma de ATP.',
  ].join('\n\n'));

  assert.deepEqual(r.map(s => [s.front, s.back]), [
    ['¿Cuál es la función de los ribosomas?', 'Sintetizar proteínas a partir de la información del ARN'],
    ['¿Cuál es la función del núcleo celular?', 'Proteger y organizar el material genético'],
    ['¿Cuál es el objetivo del ensayo clínico?', 'Determinar la eficacia del nuevo tratamiento'],
    ['¿De qué se encarga el aparato de Golgi?', 'Transportar y empaquetar proteínas'],
    ['¿Cuál es la función de las mitocondrias?', 'Generar energía química en forma de ATP'],
  ]);
});

test('filtro anafórico y destacados: descarta «dicho proceso», «ambos», y potencia callouts', () => {
  // Las oraciones anafóricas sin contexto no deben generar tarjetas vagas
  const vagos = run([
    'Dicho proceso es la base de la respiración celular en organismos aerobios.',
    'Dicha estructura es fundamental para mantener la presión osmótica de la célula.',
    'Estos últimos son producidos en el interior del citoplasma celular.',
    'Ambos son mecanismos de transporte pasivo a través de la membrana.',
    'El mismo es un elemento presente en la pared celular de los vegetales.',
  ].join('\n\n'));
  assert.equal(vagos.length, 0);

  // Oraciones con locución introductoria deben extraer el sujeto real
  const intro = run('En este sentido, la membrana plasmática es una bicapa lipídica que delimita la célula.');
  assert.equal(intro.length, 1);
  assert.equal(intro[0].front, '¿Qué es la membrana plasmática?');

  // Destacados con prefijos tipo Importante / Recuerda deben recibir bonificación de score y seleccionarse
  const callouts = run([
    'Importante: La replicación del ADN es un proceso semiconservativo y bidireccional.',
    'Recuerda: Los cloroplastos son los orgánulos encargados de llevar a cabo la fotosíntesis.',
  ].join('\n\n'));
  assert.equal(callouts.length, 2);
  assert.ok(callouts.every(s => s.score >= 0.7 && s.selected));
  assert.equal(callouts[0].front, '¿Qué es la replicación del ADN?');
  assert.equal(callouts[1].front, '¿Qué son los cloroplastos?');
});

