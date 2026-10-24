// Remates de Biblioteca: mover a una carpeta nueva, carpeta vacía, hojas con título a mano, textos, nombre al pegar y colores
import { test, expect, openApp, nav, createDeck, deckMenu, addBasicCards } from './fixtures.js';

test('«Mover a otra carpeta» › «+ Carpeta nueva»: la lista se mueve a la carpeta que se crea; vacía no ofrece estudiar', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await deckMenu(page, '[data-act="move-deck"]');
  await expect(page.locator('#sheetBody h2.sheet-hand')).toContainText('Mover');
  await expect(page.locator('#sheetBody .movelist')).toContainText('Sueltos');
  await page.locator('#sheetBody [data-act="new-folder"]').click();
  await expect(page.locator('#sheetBody h2.sheet-hand')).toHaveText('Nueva carpeta');
  await expect(page.locator('#fo-parent option').first()).toHaveText('Ninguna, en Biblioteca');
  // Los colores son los 9 acentos (y «el del tema»)
  await expect(page.locator('#sheetBody .colors .cpick')).toHaveCount(10);
  await expect(page.locator('#sheetBody .colors .cpick').nth(1)).toHaveAttribute('title', 'Cobalto');
  await page.locator('#fo-name').fill('Geografía');
  await page.locator('#sheetBody .colors .cpick').filter({ has: page.locator('input[value="bosque"]') }).click();
  await page.locator('#sheetBody button[type="submit"]').click();
  await expect(page.locator('#main .fhero-name')).toHaveText('Geografía');
  await expect(page.locator('#main')).toContainText('Capitales');
  await expect(page.locator('#main .fhero')).toHaveAttribute('style', /--fold:#1D7550/);

  // Una carpeta vacía no tiene «Estudiar la carpeta»
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').first().click();
  await page.locator('#fo-name').fill('Vacía');
  await page.locator('#sheetBody button[type="submit"]').click();
  await expect(page.locator('#main .fhero-name')).toHaveText('Vacía');
  await expect(page.locator('#main .fhero-study')).toHaveCount(0);
});

test('pegar una lista nueva: título a mano, «desde una tabla», su nombre antes de añadir y «añadida»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').first().click();
  await expect(page.locator('#sheetBody h2.sheet-hand')).toHaveText('Importar');
  await page.locator('#sheetBody [data-act="paste"]').click();
  await expect(page.locator('#sheetBody h2.sheet-hand')).toHaveText('Pegar una lista');
  await page.locator('#pasteText').fill('Francia\tParís\nItalia\tRoma');
  await page.locator('[data-act="paste-preview"]').click();
  await expect(page.locator('#sheetBody h2.sheet-hand')).toHaveText('Lista pegada');
  await expect(page.locator('#sheetBody')).toContainText('desde una tabla');
  await page.locator('#newDeckName').fill('Capitales de Europa');
  await page.locator('[data-act="add-preview"]').click();
  await expect(page.locator('#toast')).toContainText('«Capitales de Europa» añadida');
  await expect(page.getByRole('heading', { level: 1, name: 'Capitales de Europa' })).toBeVisible();
});

test('buscar en Biblioteca también dentro de las preguntas; abre la pregunta', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await addBasicCards(page, [['Francia', 'París'], ['Italia', 'Roma']]);
  await nav(page, 'Biblioteca');
  await page.locator('#libSearch').fill('parís');
  await expect(page.locator('#main .lib-q')).toHaveCount(1);
  await expect(page.locator('#main .lib-q')).toContainText('Francia');
  await expect(page.locator('#main .lib-q')).toContainText('Capitales');
  await page.locator('#main .lib-q').click();
  await expect(page.locator('#fld-a')).toHaveValue('París');
});

test('lista archivada: sin «para hoy» ni «Estudiar», con «Archivada · Sacar del archivo»; y «Borrar» con un apunte', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await addBasicCards(page, [['Francia', 'París']]);
  await deckMenu(page, '[data-act="archive-deck"]');
  await expect(page.locator('.dk-head')).toContainText('Archivada');
  await expect(page.locator('.dk-head .dk-study')).toHaveCount(0);
  await expect(page.locator('.dk-head')).not.toContainText('para hoy');
  await page.locator('.dk-head [data-act="archive-deck"]').click();
  await expect(page.locator('.dk-head .dk-study')).toBeVisible();

  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-page"]').first().click();
  await page.locator('#pgTitle').fill('Tema 1');
  await page.locator('[data-act="page-menu"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Borrar apunte');
  await page.locator('#sheetBody [data-act="ask-delete-page"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('¿Borrar este apunte?');
  await expect(page.locator('#sheetBody [data-act="delete-page"]')).toHaveText('Borrar');
});

test('«Nombre (A-Z)» mezcla apuntes y listas; el filtro de etiqueta incluye las listas con preguntas que la llevan', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Botánica');
  await addBasicCards(page, [['Rosa', 'Rosaceae']]);
  await createDeck(page, 'Zoología');
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-page"]').first().click();
  await page.locator('#pgTitle').fill('Mitosis');
  await nav(page, 'Biblioteca');
  await page.locator('#libSort').selectOption('name');
  await expect(page.locator('#main .ltiles .ltile .lt-name, #main .ltiles .ltile b').first()).toBeVisible();
  const names = await page.locator('#main .ltiles > li').allInnerTexts();
  const order = ['Botánica', 'Mitosis', 'Zoología'].map(n => names.findIndex(t => t.includes(n)));
  expect(order).toEqual([...order].sort((a, b) => a - b));

  // Una etiqueta solo en una pregunta de «Botánica»: el filtro la enseña
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const api = await import('/js/api.js'); const { addTag } = await import('/js/pantallas/editor.js');
    const t = await addTag('plantas');
    const c = [...S.cards.values()].find(x => x.front === 'Rosa');
    S.cards.set(c.id, await api.updateCard(c.id, { tags: [t.id] }));
  });
  await nav(page, 'Hoy'); await nav(page, 'Biblioteca');
  await page.locator('#main [data-tagfilter]').first().click();
  await expect(page.locator('#main .ltiles')).toContainText('Botánica');
  await expect(page.locator('#main .ltiles')).not.toContainText('Zoología');
});
