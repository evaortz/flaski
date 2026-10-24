// Remates de Biblioteca: mover a una carpeta nueva, carpeta vacía, hojas con título a mano, textos, nombre al pegar y colores
import { test, expect, openApp, nav, createDeck, deckMenu } from './fixtures.js';

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
