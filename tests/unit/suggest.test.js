import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCards, sentences, looksSpanish, plainText, isAcronymPair, acronymCard, CALLOUT_PRE, fixGrammar, grammarIssue, genderOf, useGender, trimCloze, verbHole } from '../../js/suggest.js';
import { plainTextToPage } from '../../js/notesio.js';
import genderEs from '../../js/vendor/gender-es.js';
import { textToBlocks } from '../../js/pages.js';

const run = (md, opts) => suggestCards({ title: '', blocks: textToBlocks(md) }, opts);
const brief = list => list.map(s => [s.kind, s.front, s.back]);

test('frases: no corta en abreviaturas', () => {
  assert.deepEqual(sentences('Llegó en el s. XV, p. ej. en 1492. Después volvió. ¿Y luego? Nada.'), ['Llegó en el s. XV, p. ej. en 1492.', 'Después volvió.', '¿Y luego?', 'Nada.']);
  assert.ok(looksSpanish('en la escuela') > looksSpanish('okulda'));
  assert.equal(plainText('La **célula** es *la* base {{de}} todo'), 'La célula es la base de todo');
});

test('definiciones: «¿Qué es…?» con su artículo; también dentro de un párrafo; las etiquetas no', () => {
  const r = run('Mitosis: división de una célula en dos células hijas.\n\nNota: repasar el tema 3.\n\nEjemplo: una célula de la piel.\n\nTodo bien. Meiosis: división que da cuatro células con la mitad de cromosomas.');
  assert.deepEqual(brief(r), [
    ['def', '¿Qué es la mitosis?', 'División de una célula en dos células hijas.'],
    ['def', '¿Qué es la meiosis?', 'División que da cuatro células con la mitad de cromosomas'],
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
  assert.deepEqual(d.map(s => [s.kind, s.typeId, s.front, s.back]), [['date', 'number', '¿Cuándo llegó Napoleón Bonaparte al poder con un golpe de Estado?', '1799']]);
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
  assert.deepEqual(r.map(s => [s.kind, s.front]), [['section', '¿Qué son los orgánulos?'], ['section', '¿Qué es la profase?']]);
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
    ['date', '¿Cuándo describió Robert Brown el núcleo celular?', '1831'],
    ['date', '¿Cuándo estudió Theodor Schwann la célula animal?', 'Década de 1830'],
    ['def', '¿Qué es el ribosoma?', 'Los ribosomas son partículas visibles al microscopio electrónico. Están formados por ARN.'],
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


test('lo resaltado, subrayado o en color cuenta como negrita; los subpuntos dan una tarjeta', async () => {
  const { suggestCards, emphasize, writingTips } = await import('../../js/suggest.js');
  assert.equal(emphasize('La ==membrana== y la <u>pared</u> y <span style="color:red">el núcleo</span>'), 'La **membrana** y la **pared** y **el núcleo**');
  const page = { title: 'Célula', blocks: [
    { id: 'a', type: 'p', text: 'La ==membrana== protege la célula y regula lo que entra.' },
    { id: 'b', type: 'li', text: 'Núcleo' }, { id: 'c', type: 'li', text: 'ADN', indent: 1 }, { id: 'd', type: 'li', text: 'Nucléolo', indent: 1 }, { id: 'e', type: 'li', text: 'Citoplasma' },
  ] };
  const s = suggestCards(page);
  assert.ok(s.some(x => x.kind === 'bold' && x.fields.x.includes('{{membrana}}')), 'hueco del resaltado');
  const sub = s.find(x => x.kind === 'sub');
  assert.equal(sub.front, 'Núcleo: ¿qué incluye?');
  assert.equal(sub.back, '- ADN\n- Nucléolo');
  assert.ok(s.every(x => x.id && x.id.includes('|')), 'cada sugerencia con un id estable');
  // Consejos según cómo está escrito
  const tips = writingTips({ blocks: [
    { id: 'p', type: 'p', text: 'x'.repeat(10) + ' ' + 'palabra '.repeat(40) },
    { id: 'l1', type: 'li', text: 'uno' }, { id: 'l2', type: 'li', text: 'dos' },
  ] }, []);
  assert.deepEqual(tips.map(t => t.id), ['emphasis', 'list']);
});

test('fechas: «¿Cuándo…?» con la fecha como respuesta, también con rangos y en cada frase del párrafo', () => {
  assert.deepEqual(run('La Revolución francesa empezó en 1789. El Terror lo dirigió Robespierre entre 1793 y 1794. Napoleón llegó al poder en 1799.').map(s => [s.typeId, s.front, s.back]), [
    ['number', '¿Cuándo empezó la Revolución francesa?', '1789'],
    ['basic', '¿Cuándo dirigió Robespierre el Terror?', 'Entre 1793 y 1794'],
    ['number', '¿Cuándo llegó Napoleón al poder?', '1799'],
  ]);
  // «X fue el 14 de julio…» no es «¿Qué fue…?»
  assert.deepEqual(run('La toma de la Bastilla fue el 14 de julio de 1789.').map(s => [s.front, s.back]), [['¿Cuándo fue la toma de la Bastilla?', '14 de julio de 1789']]);
  // Datos con su nombre: «**Publicación:** 29 de diciembre de 1978»
  const d = suggestCards({ title: 'La Constitución Española · Título Preliminar', blocks: textToBlocks('## Datos clave\n\n- **Aprobación por las Cortes:** 31 de octubre de 1978.\n- **Publicación y entrada en vigor:** 29 de diciembre de 1978, en el BOE.\n- **Estructura:** un preámbulo y **169 artículos**.\n- **Reformas:** tres.') });
  assert.deepEqual(d.filter(s => ['date', 'num'].includes(s.kind)).map(s => [s.typeId, s.front, s.back]), [
    ['basic', '¿Cuándo aprobaron las Cortes la Constitución Española?', '31 de octubre de 1978'],
    ['basic', '¿Cuándo se publicó y entró en vigor la Constitución Española?', '29 de diciembre de 1978'],
    ['number', '¿Cuántos artículos tiene la Constitución Española?', '169'],
    ['number', '¿Cuántas reformas tiene la Constitución Española?', '3'],
  ]);
});

test('quién hace qué: de qué está formado, su misión, a qué está sujeto, a quién corresponde, «es **X**» y enumeraciones', () => {
  const r = run([
    'Las **Fuerzas Armadas**, constituidas por el **Ejército de Tierra**, la **Armada** y el **Ejército del Aire**, tienen como misión garantizar la soberanía de España.',
    'Los ciudadanos y los poderes públicos están **sujetos a la Constitución**.',
    'Corresponde a los **poderes públicos** promover las condiciones para la igualdad.',
    'Por eso el mejor momento para repasar algo es **justo cuando estás a punto de olvidarlo**: ni antes ni después.',
    'España propugna como valores la **libertad**, la **justicia** y el **pluralismo político**.',
  ].join('\n\n'));
  const fronts = r.map(s => s.front);
  for (const q of ['¿Quiénes constituyen las Fuerzas Armadas?', '¿Cuál es la misión de las Fuerzas Armadas?', '¿A qué están sujetos los ciudadanos y los poderes públicos?',
    '¿A quién corresponde promover las condiciones para la igualdad?', '¿Cuál es el mejor momento para repasar algo?']) assert.ok(fronts.includes(q), q);
  assert.ok(r.some(s => s.kind === 'enum' && s.fields.x === 'España propugna como valores {{la libertad, la justicia y el pluralismo político}}.'));
  // Los nombres de la enumeración no salen también como huecos sueltos
  assert.ok(!r.some(s => s.kind === 'bold' && /\{\{(?:Armada|libertad)\}\}/.test(s.fields.x)));
});

test('huecos más cortos: fuera lo que va detrás («…, del que…», «…, patria común…»)', () => {
  const r = run('La **soberanía nacional** reside en el pueblo español, del que emanan los poderes del Estado.');
  assert.equal(r.find(s => s.kind === 'bold').fields.x, 'La {{soberanía nacional}} reside en el pueblo español.');
});

test('en una lista de idiomas, una fecha o una cifra se preguntan como tales antes que como «Ordenar frase»', () => {
  const r = run('- **Toma de la Bastilla:** 14 de julio de 1789\n- Guten Morgen, mein Freund: buenos días, amigo', { lang: 'de-DE' });
  assert.deepEqual(r.map(s => [s.kind, s.typeId]), [['date', 'basic'], ['phrase', 'order']]);
});

/* ---------- Paso 7+8 · parte 1: arreglar lo que hay ---------- */
const paste = text => suggestCards({ id: 'p', ...plainTextToPage(text) }, { native: 'es-ES' });

test('gramática: «cuántos/cuántas» concuerda con el sustantivo (con rosaenlg-gender-es y sus excepciones)', () => {
  useGender(genderEs);
  assert.equal(fixGrammar('¿Cuántos fases tiene la mitosis?'), '¿Cuántas fases tiene la mitosis?');
  assert.equal(fixGrammar('¿Cuántas artículos tiene?'), '¿Cuántos artículos tiene?');
  assert.deepEqual(['fases', 'reformas', 'leyes', 'mitosis', 'meses', 'etapas', 'plazos'].map(genderOf), ['f', 'f', 'f', 'f', 'm', 'f', 'm']);
  assert.equal(grammarIssue('¿Cuántos fases tiene?'), 'cuántos');
});

test('gramática: nada de «del el», «de el» ni «a el»', () => {
  assert.equal(fixGrammar('¿Cuándo provocó el golpe de Estado del el inicio de la Guerra Civil?'), '¿Cuándo provocó el golpe de Estado del inicio de la Guerra Civil?');
  assert.equal(fixGrammar('Se interpone ante el órgano de el que depende y a el que lo dictó'), 'Se interpone ante el órgano del que depende y al que lo dictó');
  // «El golpe de Estado del 18 de julio de 1936 provocó…»: la fecha es del golpe
  const r = paste('La Segunda República\n\nEl golpe de Estado del 18 de julio de 1936 provocó el inicio de la Guerra Civil.');
  assert.deepEqual(r.map(s => [s.front, s.back]), [['¿Cuándo fue el golpe de Estado que provocó el inicio de la Guerra Civil?', '18 de julio de 1936']]);
});

test('gramática: el sujeto sale de la frase, no del título («La mitosis tiene cuatro fases»)', () => {
  const r = paste('La célula\n\nLa célula es la unidad básica de la vida.\nLa mitosis tiene cuatro fases: profase, metafase, anafase y telofase.');
  assert.ok(r.some(s => s.front === '¿Cuántas fases tiene la mitosis?' && s.back === '4'), r.map(s => s.front).join(' / '));
  assert.ok(!r.some(s => /fases tiene la célula/.test(s.front)));
});

test('gramática: fuera las referencias que no se entienden solas («ese mismo mes», «este», «dicho»)', () => {
  for (const q of ['¿Cuándo abandonó España Alfonso XIII ese mismo mes?', 'Cuando no lo fijen, este será de tres meses.', 'Estas se utilizarán junto a la bandera de España.', '¿Qué hace dicho órgano?']) assert.ok(grammarIssue(q), q);
  for (const q of ['¿Qué establece esta ley?', '¿Cuál es la capital del Estado?', 'La Constitución garantiza el derecho a la autonomía.']) assert.equal(grammarIssue(q), '', q);
  const r = paste('La Segunda República\n\nLa Segunda República se proclamó el 14 de abril de 1931. Alfonso XIII abandonó España ese mismo mes.');
  assert.ok(r.length && !r.some(s => /mismo mes/.test(s.front)), r.map(s => s.front).join(' / '));
});

test('tabla «Pregunta | Respuesta»: el anverso es la celda de la izquierda, sin «→ respuesta»', () => {
  const r = run('| Pregunta | Respuesta |\n|---|---|\n| ¿Dónde reside la soberanía nacional? | En el pueblo español (art. 1.2) |\n| ¿Cuál es la capital del Estado? | La villa de Madrid (art. 5) |');
  assert.deepEqual(r.map(s => [s.front, s.back]), [['¿Dónde reside la soberanía nacional?', 'En el pueblo español (art. 1.2)'], ['¿Cuál es la capital del Estado?', 'La villa de Madrid (art. 5)']]);
});

test('«Verbo + **término**: definición» y el término a secas se preguntan: «¿Qué es la curva del olvido?», «¿Qué es el efecto de espaciado?»', () => {
  const r = run('Descubrió la **curva del olvido**: olvidamos muy deprisa al principio y cada vez más despacio después.\n\n**Efecto de espaciado:** se recuerda mejor lo que se repasa repartido en el tiempo.\n\n**Dificultades deseables:** lo que cuesta un poco al practicar hace que el aprendizaje dure más.');
  assert.deepEqual(r.map(s => s.front), ['¿Qué es la curva del olvido?', '¿Qué es el efecto de espaciado?', '¿Qué son las dificultades deseables?']);
});

test('con un término genérico («Estructura», «Reformas»), el contexto: «¿Cuál es la estructura de la Constitución Española?»', () => {
  const r = suggestCards({ title: 'La Constitución Española · Título Preliminar', blocks: textToBlocks('## Datos clave\n\n- **Estructura:** un preámbulo, 169 artículos y diez títulos.\n- **Reformas:** tres, en 1992, 2011 y 2024.') });
  assert.ok(r.some(s => s.front === '¿Cuál es la estructura de la Constitución Española?'), r.map(s => s.front).join(' / '));
  assert.ok(r.some(s => s.front === '¿Cuáles son las reformas de la Constitución Española?'), r.map(s => s.front).join(' / '));
  // En apuntes en otro idioma, el término se queda tal cual
  assert.deepEqual(run('Photosynthesis: the process by which plants make their food from light.').map(s => s.front), ['Photosynthesis']);
});

test('una sugerencia por dato: el hueco del texto se enseña y la tabla de repaso y «¿Qué artículo…?» quedan plegados; dos huecos de la misma frase, uno', () => {
  const r = suggestCards({ title: 'Constitución', blocks: textToBlocks([
    '## Artículo 1 · El Estado', '1. La forma política del Estado español es la **Monarquía parlamentaria**.',
    '## Artículo 3 · Las lenguas', 'Todos los españoles tienen el **deber de conocerla** y el **derecho a usarla**.',
    '## Para no confundirse', '| Pregunta | Respuesta |\n|---|---|\n| ¿Cuál es la forma política del Estado? | La Monarquía parlamentaria (art. 1.3) |',
  ].join('\n\n')) });
  const mon = r.filter(s => /Monarqu/.test(s.back + s.front + (s.fields.x || '')));
  assert.equal(mon.length, 1);
  assert.equal(mon[0].fields.x, 'La forma política del Estado español es la {{Monarquía parlamentaria}}.');
  assert.deepEqual(mon[0].alts.map(a => a.front).sort(), ['¿Cuál es la forma política del Estado?', '¿Qué artículo establece que la forma política del Estado español es la Monarquía parlamentaria?']);
  const deber = r.filter(s => /españoles tienen/.test(s.fields.x || ''));
  assert.equal(deber.length, 1);
  assert.deepEqual(deber[0].alts.map(a => a.front), ['Todos los españoles tienen el deber de conocerla y el […].', '¿Qué artículo establece que todos los españoles tienen el deber de conocerla y el derecho a usarla?']);
});

test('huecos cortos: el trozo de la frase que tiene el hueco, con su sujeto, hasta 25 palabras', () => {
  assert.equal(trimCloze('La Constitución se fundamenta en la indisoluble unidad de la Nación española, patria común e indivisible de todos los españoles, y reconoce y garantiza el {{derecho a la autonomía}} de las nacionalidades y regiones que la integran y la solidaridad entre todas ellas.'),
    'La Constitución reconoce y garantiza el {{derecho a la autonomía}} de las nacionalidades y regiones que la integran y la solidaridad entre todas ellas.');
  assert.equal(trimCloze('España se constituye en un Estado social y democrático de Derecho, que propugna como valores superiores de su ordenamiento jurídico {{la libertad, la justicia, la igualdad y el pluralismo político}}.'),
    'España propugna como valores superiores de su ordenamiento jurídico {{la libertad, la justicia, la igualdad y el pluralismo político}}.');
  assert.equal(trimCloze('El plazo será de {{un mes}}; el de reposición, de dos.'), 'El plazo será de {{un mes}}.');
  // Sin verbo ya no es una frase
  assert.equal(trimCloze('Las {{Fuerzas Armadas}}, constituidas por el Ejército de Tierra, la Armada y el Ejército del Aire, tienen como misión garantizar la soberanía e independencia de España, defender su integridad territorial y el ordenamiento constitucional.'), null);
});

test('nunca un hueco en un verbo', () => {
  assert.ok(verbHole('Mientras duermes, el cerebro {{consolida}} lo que has aprendido.'));
  assert.ok(verbHole('{{Espaciar}} los repasos en vez de amontonarlos.'));
  assert.ok(!verbHole('Cada repaso {{aplana la curva}}.'));
  assert.ok(!verbHole('Valores como la {{justicia}} y la igualdad.'));
  assert.ok(!verbHole('El {{castellano}} es la lengua oficial.'));
  assert.ok(!run('Mientras duermes, el cerebro **consolida** lo que has aprendido durante el día.').some(s => s.typeId === 'cloze'));
});

test('listas de 5 o más: un hueco por elemento con los demás a la vista y en su orden, «¿Cuántos…?» y la lista entera plegada', () => {
  const r = suggestCards({ title: 'Constitución', blocks: textToBlocks('## Artículo 9 · Principios\n\n1. Uno.\n2. Dos.\n3. La Constitución garantiza:\n   - el principio de **legalidad**,\n   - la **jerarquía normativa**,\n   - la **publicidad** de las normas,\n   - la **seguridad jurídica**,\n   - la **responsabilidad**\n   - y la **interdicción de la arbitrariedad** de los poderes públicos.') });
  const holes = r.filter(s => s.kind === 'listitem');
  assert.equal(holes.length, 6);
  assert.equal(holes[2].fields.x, 'La Constitución garantiza (art. 9.3): el principio de legalidad, la jerarquía normativa, {{la publicidad de las normas}}, la seguridad jurídica, la responsabilidad y la interdicción…');
  const count = r.find(s => s.typeId === 'number');
  assert.equal(count.front, '¿Cuántos principios garantiza la Constitución (art. 9.3)?');
  assert.equal(count.fields.a, '6');
  assert.equal(count.alts?.[0]?.front, '¿Qué garantiza la Constitución (art. 9.3)?');
});

test('marcadas de entrada: solo las de 0,75 o más y como mucho 15 por apunte', () => {
  const r = run(Array.from({ length: 20 }, (_, i) => `Término ${i + 1}: definición número ${i + 1} del tema.`).join('\n\n') + '\n\nLa célula es la unidad básica de la vida.');
  assert.equal(r.length, 21);
  assert.equal(r.filter(s => s.selected).length, 15);
  assert.ok(r.filter(s => s.selected).every(s => s.score >= 0.75 && s.rec));
  assert.ok(!r.find(s => s.front === '¿Qué es la célula?').selected);   // 0,70: a un toque
});
