// Explorar › Idiomas › «JLPT N5 · Gramática»: doce apuntes con sus preguntas, cada una unida a su apartado, en la
// carpeta «JLPT N5»; añadirlo dos veces no repite nada
import { test, expect, openApp, nav } from './fixtures.js';

test('JLPT N5 · Gramática: se ve en Explorar, se añaden los 12 apuntes con sus preguntas y no se repiten', async ({ page }) => {
  await openApp(page);
  const idx = await page.evaluate(async () => (await fetch('decks/jlpt-n5/index.json')).json());
  await nav(page, 'Explorar');
  const card = page.locator('#main .ex-curso');
  await expect(card).toContainText('JLPT N5 · Gramática');
  await expect(card).toContainText(`12 apuntes · ${idx.count} preg.`);
  await card.locator('.ex-card-b').click();
  const sh = page.locator('#sheetBody .jc');
  await expect(sh.locator('.jc-list li')).toHaveCount(12);
  await expect(sh.locator('.jc-list li').first()).toHaveText('1 · Presentarse');
  await expect(sh).toContainText('Minna no Nihongo');
  await sh.locator('[data-ex="add-curso"]').click();
  await expect(page.locator('#toast')).toContainText(`12 apuntes y ${idx.count} preguntas`, { timeout: 20000 });
  await expect(page.locator('#pgTitle')).toHaveText('1 · Presentarse');
  const r = await page.evaluate(async () => {
    const { S } = await import('/js/comun.js');
    const f = [...S.folders.values()].find(x => x.name === 'JLPT N5');
    const pages = [...S.pages.values()].filter(p => p.folder_id === f.id);
    const deck = [...S.decks.values()].find(d => d.source === 'incluido:jlpt-n5/index.json');
    const cards = [...S.cards.values()].filter(c => c.deck_id === deck.id);
    return { pages: pages.length, deckFolder: deck.folder_id === f.id, lang: deck.options?.lang, cards: cards.length, loose: cards.filter(c => !c.page_id || !c.block_id).length };
  });
  expect(r).toEqual({ pages: 12, deckFolder: true, lang: 'ja-JP', cards: idx.count, loose: 0 });
  // Otra vez en Explorar: «La tienes», y abrirlo no crea nada
  await nav(page, 'Explorar');
  await expect(page.locator('#main .ex-curso')).toContainText('La tienes');
  await page.locator('#main .ex-curso .ex-card-b').click();
  await page.locator('#sheetBody [data-ex="open-curso"]').click();
  await expect(page.locator('#pgTitle')).toHaveText('1 · Presentarse');
  expect(await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return [...S.pages.values()].filter(p => /^\d+ · /.test(p.title)).length; })).toBe(12);
});
