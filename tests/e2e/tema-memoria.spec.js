// El tema de ejemplo «Por qué se te olvidan las cosas»: una pregunta de cada tipo, cada una unida a su apartado,
// con el dibujo de la curva del olvido; y quien ya lo tenía pasa a las nuevas sin perder el progreso de las que coinciden
import { test, expect, openApp, nav } from './fixtures.js';

const TYPES = ['basic', 'reverse', 'cloze', 'typing', 'choice', 'truefalse', 'number', 'order', 'steps', 'sort', 'match', 'explain', 'whatif', 'occlusion'];
const deckCards = page => page.evaluate(() => import('/js/comun.js').then(({ S }) => {
  const d = [...S.decks.values()].find(x => x.source === 'tema:por-que-se-te-olvidan-las-cosas'), p = [...S.pages.values()].find(x => x.deck_id === d?.id);
  const blocks = new Set((p?.blocks || []).map(b => b.id));
  return [...S.cards.values()].filter(c => c.deck_id === d?.id).map(c => ({ id: c.id, type: c.type_id, q: c.fields.q || c.fields.x || c.fields.s || c.fields.a || c.fields.t || c.fields.h, linked: blocks.has(c.block_id), img: c.fields.img || '' }));
}));

test('al añadirlo: 17 preguntas, una nota de cada tipo, todas unidas a su apartado, y la imagen de la curva guardada', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await expect(page.locator('.ex-hero')).toContainText('Un recorrido por todos los tipos de pregunta');
  await page.locator('.ex-hero [data-ex="start-tema"]').click();
  await expect(page.locator('.studybar')).toBeVisible();
  const cards = await deckCards(page);
  expect(cards).toHaveLength(17);
  expect([...new Set(cards.map(c => c.type))].sort()).toEqual([...TYPES].sort());
  expect(cards.filter(c => !c.linked)).toEqual([]);
  expect(cards.filter(c => c.type === 'occlusion')).toHaveLength(3);
  expect(await page.evaluate(() => import('/js/media.js').then(m => m.imageBlob('tema-curva-olvido')).then(b => !!b && b.size > 0))).toBe(true);
  expect(cards.find(c => c.type === 'basic').q).toBe('¿Quién estudió por primera vez cómo olvidamos?');
  // Cada una se pinta en la tanda (anverso y reverso) sin fallar; la de tapar la imagen, con su dibujo y sus recuadros
  const faces = await page.evaluate(async ids => {
    const { S } = await import('/js/comun.js'); const { cardModel, faceHTML } = await import('/js/pantallas/estudio.js');
    return ids.map(id => { const c = S.cards.get(id), m = cardModel(c), f = faceHTML(m, { id, revealed: true, hint: false, typed: null, choice: null }); return [m.tpl.mode, (f.front || '').length > 0, /occ-m/.test(f.front || '')]; });
  }, cards.map(c => c.id));
  expect(faces.every(([, ok]) => ok)).toBe(true);
  expect(faces.filter(([mode, , occ]) => mode === 'occlusion' && occ)).toHaveLength(3);
});

test('quien ya lo tenía: se quitan las de antes, se añaden las nuevas y las que coinciden conservan su progreso', async ({ page }) => {
  await openApp(page);
  // El tema como era antes
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const { readTema } = await import('/js/pantallas/cuenta.js'); const { TEMAS } = await import('/js/primera-vez.js');
    const { makeSuggested, temaPicks } = await import('/js/pantallas/sugerencias.js');
    const t = TEMAS.find(x => x.old), { title, blocks } = await readTema(t);
    const p = await api.createPage({ owner: S.uid, title, icon: '', deck_id: null, folder_id: null, tags: [], blocks }); S.pages.set(p.id, p);
    const old = await (await fetch(t.old)).json();
    await makeSuggested(p, await temaPicks(p, old), 'new', 'tema:por-que-se-te-olvidan-las-cosas');
    // Progreso en la de «¿En qué año…?» (sigue en el tema nuevo con el mismo texto)
    const c = [...S.cards.values()].find(x => x.fields.q === '¿En qué año publicó Ebbinghaus su estudio sobre la memoria?');
    const prog = { reps: 3, interval: 12, ease: 2.5, lapses: 0, due: Date.now() + 5 * 864e5, last: Date.now() - 864e5, first_seen: Date.now() - 20 * 864e5 };
    S.progress.set(c.id, prog);
    window.__kept = c.id;
  });
  const before = await deckCards(page);
  expect(before.some(c => c.q === '¿Qué memorizaba Ebbinghaus en sus experimentos?')).toBe(true);
  // Una tuya en la misma lista: no se toca
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const d = [...S.decks.values()].find(x => x.source === 'tema:por-que-se-te-olvidan-las-cosas');
    for (const c of await api.createCards([{ deck_id: d.id, owner: S.uid, front: 'Mía', back: 'sí', type_id: 'basic', template: 't1', fields: { q: 'Mía', a: 'sí' } }])) S.cards.set(c.id, c);
  });
  const n = await page.evaluate(() => import('/js/pantallas/cuenta.js').then(m => m.migrateTemas()));
  expect(n).toBeGreaterThan(0);
  const after = await deckCards(page);
  expect(after.some(c => c.q === '¿Qué memorizaba Ebbinghaus en sus experimentos?')).toBe(false);
  expect(after.some(c => c.q === 'Mía')).toBe(true);
  expect(after.filter(c => c.q !== 'Mía')).toHaveLength(17);
  expect([...new Set(after.map(c => c.type))].sort()).toEqual([...TYPES].sort());
  const kept = await page.evaluate(() => import('/js/comun.js').then(({ S }) => [S.cards.has(window.__kept), S.progress.get(window.__kept)?.interval]));
  expect(kept).toEqual([true, 12]);
  // Otra vez: no cambia nada
  expect(await page.evaluate(() => import('/js/pantallas/cuenta.js').then(m => m.migrateTemas()))).toBe(0);
});
