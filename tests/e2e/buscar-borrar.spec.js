// Buscar sin tildes ni diéresis (la ñ cuenta) en Biblioteca, en una lista, en el apunte y en los tipos; y qué pasa al
// borrar una lista, un apunte o una carpeta (sus preguntas y Hoy)
import { test, expect, openApp, openPage, nav, deckMenu, newCard, hoyCount } from './fixtures.js';

test('buscar ignora tildes, diéresis y mayúsculas (no la ñ)', async ({ page, seed }) => {
  await seed({
    builtin: ['Alemán · A2'],
    decks: [{ name: 'Historia · La Revolución', cards: [['La estación del norte', 'Bahnhof'], ['Küche', 'cocina'], ['España', 'país']] }],
  });
  await openApp(page);
  await nav(page, 'Biblioteca');
  for (const [q, has] of [['revolucion', 'Revolución'], ['aleman', 'Alemán'], ['ALEMÁN', 'Alemán']]) {
    await page.locator('#libSearch').fill(q);
    await expect(page.locator('#main .ltiles')).toContainText(has);
  }
  await page.locator('#libSearch').fill('kuche');
  await expect(page.locator('#main .lib-q').filter({ hasText: 'Küche' })).toHaveCount(1);
  await page.locator('#libSearch').fill('espana');                                      // la ñ no es una n
  await expect(page.locator('#main .lib-q').filter({ hasText: 'España' })).toHaveCount(0);
  await page.locator('#libSearch').fill('españa');
  await expect(page.locator('#main .lib-q').filter({ hasText: 'España' })).toHaveCount(1);

  // En la lista
  await page.locator('#libSearch').fill('');
  await page.locator('#main .lt-list').filter({ hasText: 'Revolución' }).click();
  await page.locator('#cardSearch').fill('estacion');
  await expect(page.locator('#main')).toContainText('La estación del norte');
  await page.locator('#cardSearch').fill('kuche');
  await expect(page.locator('#main')).toContainText('Küche');

  // En el selector de tipos
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('#typeSearch').fill('numerica');
  await expect(page.locator('#typePicker [data-pick-type="number"]')).toHaveCount(1);
});

test('buscar en el apunte sin tildes', async ({ page, seed }) => {
  await seed({ pages: [{ md: '# Historia\n\nLa Revolución francesa empezó en 1789.' }] });
  await openApp(page);
  await openPage(page, 'Historia');
  await page.locator('[data-act="find"]').click();
  await page.locator('#findQ, .find-bar input').first().fill('revolucion');
  await expect(page.locator('.find-count, #findCount').first()).toContainText('1');
});

test('borrar un apunte con preguntas: las preguntas siguen en su lista', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Historia' }], pages: [{ md: '# Francia\n\nLa **Bastilla** cayó en 1789.', deck: 'Historia' }] });
  await openApp(page);
  await openPage(page, 'Francia');
  await page.locator('.pg-top [data-act="suggest-cards"]').click();
  await page.locator('#sheetBody [data-act="create-suggested"], #sheetBody button.primary').last().click();
  await expect(page.locator('#sheet')).toBeHidden();
  const before = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return [...S.cards.values()].length; });
  expect(before).toBeGreaterThan(0);
  await page.locator('[data-act="page-menu"]').click();
  await page.locator('#sheetBody [data-act="ask-delete-page"]').click();
  await page.locator('#sheetBody [data-act="delete-page"]').click();
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main')).not.toContainText('Francia');
  await page.locator('#main .lt-list').filter({ hasText: 'Historia' }).click();
  await expect(page.locator('.dk-meta')).toContainText(before === 1 ? '1 pregunta' : `${before} preguntas`);
});

test('borrar una lista: sus preguntas se van también de Hoy', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Capitales', cards: [['Francia', 'París'], ['Italia', 'Roma']] }] });
  await openApp(page);
  await nav(page, 'Hoy');
  await expect.poll(() => hoyCount(page).then(c => c.total)).toBe(2);
  await nav(page, 'Biblioteca');
  await page.locator('#main .lt-list').filter({ hasText: 'Capitales' }).click();
  await deckMenu(page, '[data-act="ask-delete-deck"]');
  await page.locator('#sheetBody [data-act="delete-deck"]').click();
  await expect(page.locator('#toast')).toContainText('Lista en la papelera');
  expect(await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return S.cards.size; })).toBe(0);
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-legend')).toHaveCount(0);
});

test('borrar una carpeta: va a la papelera con sus listas y sus preguntas salen de Hoy', async ({ page, seed }) => {
  await seed({ folders: ['Tema 1'], decks: [{ name: 'Capitales', folder: 'Tema 1', cards: [['Francia', 'París']] }] });
  await openApp(page);
  await expect.poll(() => hoyCount(page).then(c => c.total)).toBe(1);
  await nav(page, 'Biblioteca');
  await page.locator('#main .lfold').filter({ hasText: 'Tema 1' }).click();
  await page.locator('#main [data-act="edit-folder"], #main .fhero [data-act*="folder"]').first().click();
  await page.locator('#sheetBody [data-act="ask-delete-folder"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('¿Borrar la carpeta «Tema 1»?');
  await page.locator('#sheetBody [data-act="delete-folder"]').click();
  await expect(page.locator('#toast')).toContainText('Carpeta en la papelera');
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main .lfold')).toHaveCount(0);
  await expect(page.locator('#main')).not.toContainText('Capitales');
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-legend')).toHaveCount(0);
});
