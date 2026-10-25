// El tema de ejemplo «Por qué se te olvidan las cosas»: una pregunta de cada tipo, cada una unida a su apartado,
// con las dos imágenes del apunte y la nota de cada pregunta; y quien tenía una versión de antes pasa a las nuevas
import { test, expect, openApp, nav } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

const TYPES = ['basic', 'reverse', 'cloze', 'typing', 'choice', 'truefalse', 'number', 'order', 'steps', 'sort', 'match', 'explain', 'whatif', 'occlusion'];
const deckCards = page => page.evaluate(() => import('/js/comun.js').then(({ S }) => {
  const d = [...S.decks.values()].find(x => x.source === 'tema:por-que-se-te-olvidan-las-cosas'), p = [...S.pages.values()].find(x => x.deck_id === d?.id);
  const blocks = new Set((p?.blocks || []).map(b => b.id));
  return [...S.cards.values()].filter(c => c.deck_id === d?.id).map(c => ({ id: c.id, type: c.type_id, q: c.fields.q || c.fields.x || c.fields.s || c.fields.a || c.fields.t || c.fields.h, linked: blocks.has(c.block_id), img: c.fields.img || '', note: c.type_id === 'cloze' ? c.fields.e : c.fields.n }));
}));

test('al añadirlo: 17 preguntas, una nota de cada tipo, todas unidas a su apartado, y la imagen de la curva guardada', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await expect(page.locator('.ex-hero')).toContainText('Un recorrido por todos los tipos de pregunta');
  await page.locator('.ex-hero [data-ex="read-tema"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  const cards = await deckCards(page);
  expect(cards).toHaveLength(17);
  expect([...new Set(cards.map(c => c.type))].sort()).toEqual([...TYPES].sort());
  expect(cards.filter(c => !c.linked)).toEqual([]);
  expect(cards.filter(c => c.type === 'occlusion')).toHaveLength(3);
  expect(await page.evaluate(() => import('/js/media.js').then(m => m.imageBlob('tema-curva-olvido')).then(b => !!b && b.size > 0))).toBe(true);
  expect(cards.find(c => c.type === 'basic').q).toBe('¿Por qué memorizaba Ebbinghaus sílabas sin sentido, como «DAX» o «BOK»?');
  // Las que traen «nota» la llevan en su campo de nota (en la de huecos, en «Extra») y la enseñan al ver la respuesta
  const withNote = cards.filter(c => c.note);
  expect(withNote.length).toBeGreaterThanOrEqual(7);
  expect(withNote.find(c => c.type === 'cloze').note).toContain('34 %');
  // Cada una se pinta en la tanda (anverso y reverso) sin fallar; la de tapar la imagen, con su dibujo y sus recuadros
  const faces = await page.evaluate(async ids => {
    const { S } = await import('/js/comun.js'); const { cardModel, faceHTML } = await import('/js/pantallas/estudio.js');
    return ids.map(id => { const c = S.cards.get(id), m = cardModel(c), f = faceHTML(m, { id, revealed: true, hint: false, typed: null, choice: null }); return [m.tpl.mode, (f.front || '').length > 0, /occ-m/.test(f.front || ''), (f.answer || '').replace(/<[^>]+>/g, '')]; });
  }, cards.map(c => c.id));
  expect(faces.every(([, ok]) => ok)).toBe(true);
  expect(faces.filter(([mode, , occ]) => mode === 'occlusion' && occ)).toHaveLength(3);
  const strip = s => s.replace(/<[^>]+>/g, '').replace(/[*_=]/g, '').slice(0, 30);
  for (const c of withNote) expect(faces[cards.indexOf(c)][3]).toContain(strip(c.note));
});

test('el apunte enseña todo lo que sabe hacer un apunte, con sus dos imágenes ya cargadas', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { addTema } = await import('/js/pantallas/pruebas.js'); const { TEMAS } = await import('/js/primera-vez.js');
    const { go } = await import('/js/app.js');
    const r = await addTema(TEMAS.find(t => t.old));
    go('page', { pageId: r.page.id });
  });
  const pg = page.locator('#main');
  await expect(pg.locator('.nb-callout').first()).toBeVisible();
  expect(await pg.locator('.nb-table').count()).toBe(3);
  await expect(pg.locator('.nb-quote')).not.toHaveCount(0);
  await expect(pg.locator('.nb-hr')).not.toHaveCount(0);
  await expect(pg.locator('.nb-todo')).not.toHaveCount(0);
  await expect(pg.locator('.nb-text a[href^="https://es.wikipedia.org"]')).toHaveCount(1);
  await expect(pg.locator('.nb-text ruby')).not.toHaveCount(0);
  // Las dos imágenes, cargadas (no el hueco de una que falta)
  await expect(pg.locator('.nb-img img')).toHaveCount(2);
  for (const i of [0, 1]) {
    const img = pg.locator('.nb-img img').nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(x => x.complete && x.naturalWidth > 0)).toBe(true);
  }
});

for (const v of [0, 1]) test(`quien tenía la versión ${v + 1}: se quitan las de antes, se añaden las nuevas y lo tuyo no se toca`, async ({ page }) => {
  await openApp(page);
  await page.evaluate(v => { window.__v = v; }, v);
  // El tema como era antes
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const { readTema } = await import('/js/pantallas/cuenta.js'); const { TEMAS } = await import('/js/primera-vez.js');
    const { makeSuggested, temaPicks } = await import('/js/pantallas/sugerencias.js');
    const t = TEMAS.find(x => x.old), { title, blocks } = await readTema(t);
    const p = await api.createPage({ owner: S.uid, title, icon: '', deck_id: null, folder_id: null, tags: [], blocks }); S.pages.set(p.id, p);
    const old = await (await fetch(t.old[1 - window.__v])).json();
    await makeSuggested(p, await temaPicks(p, old), 'new', 'tema:por-que-se-te-olvidan-las-cosas');
    const now = await (await fetch(t.cards)).json();
    window.__oldQ = old.map(x => x.pregunta).filter(q => !now.some(x => x.pregunta === q));
    window.__same = old.map(x => x.pregunta).filter(q => now.some(x => x.pregunta === q));
  });
  const before = await deckCards(page);
  const oldQ = await page.evaluate(() => window.__oldQ);
  expect(before.length).toBeGreaterThan(10);
  // Una tuya en la misma lista: no se toca
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const d = [...S.decks.values()].find(x => x.source === 'tema:por-que-se-te-olvidan-las-cosas');
    for (const c of await api.createCards([{ deck_id: d.id, owner: S.uid, front: 'Mía', back: 'sí', type_id: 'basic', template: 't1', fields: { q: 'Mía', a: 'sí' } }])) S.cards.set(c.id, c);
  });
  const n = await page.evaluate(() => import('/js/pantallas/cuenta.js').then(m => m.migrateTemas()));
  expect(n).toBeGreaterThan(0);
  const after = await deckCards(page);
  expect(after.filter(c => oldQ.includes(c.q) && c.q !== 'Mía')).toEqual([]);
  // Las que coinciden siguen siendo la misma pregunta (y conservan su progreso)
  const same = await page.evaluate(() => window.__same);
  for (const q of same) expect(after.find(c => c.q === q)?.id).toBe(before.find(c => c.q === q)?.id);
  expect(after.some(c => c.q === 'Mía')).toBe(true);
  expect(after.filter(c => c.q !== 'Mía')).toHaveLength(17);
  expect([...new Set(after.map(c => c.type))].sort()).toEqual([...TYPES].sort());
  // Otra vez: no cambia nada
  expect(await page.evaluate(() => import('/js/pantallas/cuenta.js').then(m => m.migrateTemas()))).toBe(0);
});

test('en el móvil, las tablas del apunte no parten palabras: si no caben, se desplazan de lado en su caja', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { addTema } = await import('/js/pantallas/pruebas.js'); const { TEMAS } = await import('/js/primera-vez.js');
    const { go } = await import('/js/app.js');
    const r = await addTema(TEMAS.find(t => t.old));
    go('page', { pageId: r.page.id });
  });
  await expect(page.locator('#main .nb-tbl')).toHaveCount(3);
  const r = await page.locator('#main .nb-tbl').evaluateAll(tbls => {
    const broken = [];
    for (const t of tbls) for (const cell of t.querySelectorAll('th, td')) {
      const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) for (const m of n.data.matchAll(/\S+/g)) {
        const range = document.createRange(); range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
        const lines = new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
        if (lines.size > 1) broken.push(m[0]);
      }
    }
    // La página no se desplaza de lado: lo hace la caja de la tabla
    return { broken, page: document.documentElement.scrollWidth <= innerWidth + 1, wraps: tbls.map(t => getComputedStyle(t.closest('.nb-tablewrap')).overflowX) };
  });
  expect(r.broken).toEqual([]);
  expect(r.page).toBe(true);
  expect(r.wraps.every(x => x === 'auto')).toBe(true);
});

// El tema es una lista sin idioma (no de turco por tener una de ordenar): en la de escribir, las letras del español y
// sin altavoz. Por todos los caminos que lo crean, y una lista creada desde un apunte en español con una de ordenar.
async function checkNoTurkish(page, source) {
  const r = await page.evaluate(src => import('/js/comun.js').then(({ S }) => [...S.decks.values()].filter(d => d.source === src).map(d => d.options?.lang)), source);
  expect(r).toEqual(['']);
  await page.evaluate(async src => {
    const { S } = await import('/js/comun.js'); const { startSession } = await import('/js/pantallas/estudio.js');
    const d = [...S.decks.values()].find(x => x.source === src), c = [...S.cards.values()].find(x => x.deck_id === d.id && x.type_id === 'typing');
    startSession(d.id, { ids: [c.id] });
  }, source);
  await expect(page.locator('.chars-study button')).toHaveText(['ñ', 'á', 'é', 'í', 'ó', 'ú', 'ü', '¿', '¡']);
  await expect(page.locator('article.card .say')).toHaveCount(0);
}
const SRC = 'tema:por-que-se-te-olvidan-las-cosas';

test('sin idioma: Explorar › «Añadir y leer»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('.ex-hero [data-ex="read-tema"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  await checkNoTurkish(page, SRC);
});

test('sin idioma: Explorar con cuenta', async ({ page }) => {
  await mockCloud(page);
  await openCloud(page);
  await nav(page, 'Explorar');
  await page.locator('.ex-hero [data-ex="read-tema"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  await checkNoTurkish(page, SRC);
});

test.describe('bienvenida', () => {
  test.use({ intro: true });
  test('sin idioma: la primera vez, «Leer el tema»', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-fr-what="otra"]').click();
    await page.getByRole('button', { name: 'Prueba con un tema de ejemplo' }).click();
    await page.locator('[data-fr-tema="1"]').click();
    await page.locator('[data-fr-go="open"]').click();
    await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
    await checkNoTurkish(page, SRC);
  });
});

test('sin idioma: una lista creada desde un apunte en español con una de ordenar y una de escribir', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const { makeSuggested } = await import('/js/pantallas/sugerencias.js'); const { go } = await import('/js/app.js');
    const p = await api.createPage({ owner: S.uid, title: 'Memoria', icon: '', deck_id: null, folder_id: null, tags: [], blocks: [{ id: 'b1', type: 'p', text: 'El efecto de espaciado: lo repartido dura más.' }] }); S.pages.set(p.id, p);
    await makeSuggested(p, [
      { typeId: 'order', fields: { f: 'lo repartido dura más', t: 'Ordena', n: '' }, answer: 'lo repartido', blockId: 'b1' },
      { typeId: 'typing', fields: { q: '¿Cómo se llama el efecto?', a: 'Efecto de espaciado', n: '' }, answer: 'espaciado', blockId: 'b1' },
    ], 'new');
    go('page', { pageId: p.id });
  });
  await checkNoTurkish(page, 'apuntes');
});

test('reparación: una lista del tema que se quedó de turco sin una letra del turco pasa a sin idioma', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const { readTema } = await import('/js/pantallas/cuenta.js'); const { TEMAS } = await import('/js/primera-vez.js');
    const { temaPicks } = await import('/js/pantallas/sugerencias.js');
    const t = TEMAS.find(x => x.old), { title, blocks } = await readTema(t);
    const p = await api.createPage({ owner: S.uid, title, icon: '', deck_id: null, folder_id: null, tags: [], blocks }); S.pages.set(p.id, p);
    const d = await api.createDeck({ owner: S.uid, name: title, description: '', source: 'tema:por-que-se-te-olvidan-las-cosas', options: { lang: 'tr-TR' } });
    S.decks.set(d.id, { tags: [], ...d });
    const { makeSuggested } = await import('/js/pantallas/sugerencias.js');
    await makeSuggested(p, await temaPicks(p, await (await fetch(t.cards)).json()), d.id);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await checkNoTurkish(page, SRC);
});
