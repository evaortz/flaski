// La pantalla de una lista: cabecera con lo de hoy, estado, preguntas con su tipo, menús «+» y «…» y apuntes vinculados
import { test, expect, openApp, nav, addBuiltinDeck, pasteNotes, deckMenu } from './fixtures.js';

test('cabecera, filtros por etapa, tipo de cada pregunta y «Ver todas»', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Alemán · A2');
  await expect(page.locator('.dk-meta')).toContainText('Alemán · 48 preguntas · editado el');
  await expect(page.locator('.dk-num')).toContainText('15');
  await expect(page.locator('.dk-num')).toContainText('para hoy');
  await expect(page.locator('.dk-key')).toContainText('48');
  // El selector «Lista | Mapa» existe pero no sale hasta que haya mapa
  await expect(page.locator('.dk-view')).toHaveCount(1);
  await expect(page.locator('.dk-view')).toBeHidden();
  // Diez preguntas, cada una con su tipo
  await expect(page.locator('#cardRows .row')).toHaveCount(10);
  await expect(page.locator('#cardCount')).toHaveText('Mostrando 10 de 48');
  await expect(page.locator('#cardRows .cr-t').first()).not.toBeEmpty();
  await expect(page.locator('#cardRows')).toContainText('nueva');
  // Filtros
  await page.locator('[data-cfilter="today"]').click();
  await expect(page.locator('[data-cfilter="today"]')).toHaveText('Para hoy · 15');
  await expect(page.locator('[data-cfilter="today"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-act="cards-all"]').click();
  await expect(page.locator('#cardRows .row')).toHaveCount(15);
  await page.locator('[data-cfilter="all"]').click();
  await page.locator('[data-act="cards-all"]').click();
  await expect(page.locator('#cardRows .row')).toHaveCount(48);
  await expect(page.locator('#cardRows')).toContainText('Sustantivo alemán');
  // Al buscar salen todas las que coinciden
  await page.locator('#cardSearch').fill('der');
  await expect(page.locator('#cardCount')).toHaveText(/de 48 preguntas/);
});

test('«+» ofrece las cuatro formas de añadir y «…» archiva y borra la lista', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');
  await page.locator('#main [data-act="add-menu"]').click();
  const menu = page.locator('#sheetBody .dk-menu, #dkPop:not([hidden]) .dk-menu');
  await expect(menu).toContainText('Una pregunta');
  await expect(menu).toContainText('Varias de golpe');
  await expect(menu).toContainText('Desde un apunte');
  await expect(menu).toContainText('Importar archivo');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await deckMenu(page, '[data-act="archive-deck"]');
  await expect(page.locator('.dk-meta')).toContainText('archivada');
  await page.locator('#main [data-act="deck-menu"]:visible').click();
  await expect(page.locator('#sheetBody, #dkPop:not([hidden])').getByText('Desarchivar')).toBeVisible();
  await page.locator('#sheetBody [data-act="archive-deck"], #dkPop:not([hidden]) [data-act="archive-deck"]').click();
  await expect(page.locator('.dk-meta')).not.toContainText('archivada');

  await deckMenu(page, '[data-act="ask-delete-deck"]');
  await page.locator('#sheetBody [data-act="delete-deck"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeVisible();
  await expect(page.locator('#main')).not.toContainText('Armonía vocálica');
});

test('«Desde un apunte» abre sus sugerencias para esta lista; vincular un apunte y abrirlo desde la lista', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Gramática turca\n\nev es casa.\n\n| Turco | Español |\n|---|---|\n| ev | casa |\n| kapı | puerta |');
  await addBuiltinDeck(page, 'Alemán · A2');
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');
  // Las sugerencias del apunte van a la lista desde la que se piden (no a la primera)
  await page.locator('#main [data-act="add-menu"]').click();
  await page.locator('#sheetBody [data-act="from-note"], #dkPop:not([hidden]) [data-act="from-note"]').click();
  await page.locator('#sheetBody [data-note-sug]').filter({ hasText: 'Gramática turca' }).click();
  await expect(page.locator('#pgTitle')).toHaveValue('Gramática turca');
  await expect(page.locator('#sugDeck option:checked')).toHaveText('Turco · Armonía vocálica');
  // Vincular
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-open]').filter({ hasText: 'Armonía vocálica' }).click();
  await page.locator('[data-act="link-note"]').click();
  await page.locator('#sheetBody [data-link-page]').filter({ hasText: 'Gramática turca' }).click();
  await expect(page.locator('.dk-notes')).toContainText('Gramática turca');
  await expect(page.locator('.dk-notes')).toContainText('ev es casa');
  await page.locator('.dk-notes [data-page]').click();
  await expect(page.locator('#pgTitle')).toHaveValue('Gramática turca');
});
