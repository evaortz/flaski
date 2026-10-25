// El tema de ejemplo «Por qué se te olvidan las cosas»: una pregunta de cada tipo, cada una unida a su apartado,
// con las dos imágenes del apunte y la nota de cada pregunta; y quien tenía una versión de antes pasa a las nuevas
import { test, expect, openApp, nav } from './fixtures.js';

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
