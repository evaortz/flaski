// Remates de la pasada completa: mover juntos lista y apunte, reiniciar con confirmación, Explorar «Ya la tienes»,
// apunte vacío descartado, texto de etiquetas y «Hueco» con solo la frase
import { test, expect, openApp, nav, createDeck, deckMenu, addBasicCards, addBuiltinDeck, pasteNotes, edExtra } from './fixtures.js';

const ed = page => page.locator('[data-block-input]');
async function select(page, i, w) {
  if (!(await ed(page).count())) await page.locator('#pgBlocks .nb').nth(i).locator('.nb-text').click();
  await ed(page).evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
  await expect(page.locator('#selBar')).toBeVisible();
}

test('mover una lista lleva también su apunte a la carpeta', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Economía');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Inflación\n\nLos precios suben.');
  await page.locator('#pgDeck').selectOption({ label: 'Economía' });
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').first().click();
  await page.locator('#fo-name').fill('Macro');
  await page.locator('#sheetBody button[type="submit"]').click();
  await nav(page, 'Biblioteca');
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const { go } = await import('/js/app.js'); go('deck', { deckId: [...S.decks.values()].find(d => d.name === 'Economía').id }); });
  await deckMenu(page, '[data-act="move-deck"]');
  await page.locator('#sheetBody [data-move-to]').filter({ hasText: 'Macro' }).click();
  const folderOf = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const p = [...S.pages.values()].find(x => x.title === 'Inflación'); return S.folders.get(p.folder_id)?.name || null; });
  expect(folderOf).toBe('Macro');
});

test('«Reiniciar progreso» pide confirmación', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await addBasicCards(page, [['Francia', 'París']]);
  // Con progreso (como si ya la hubieras estudiado), el editor ofrece «Reiniciar progreso»
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const { cardForm } = await import('/js/pantallas/editor.js'); const c = [...S.cards.values()][0]; S.progress.set(c.id, { interval: 3, ease: 2.5, due: Date.now() + 864e5, reps: 1, lapses: 0 }); cardForm(c); });
  await edExtra(page);
  await page.locator('[data-act="ask-reset-card"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('¿Reiniciar el progreso de esta pregunta?');
  await page.locator('#sheetBody [data-act="reset-card"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('Explorar: si ya tienes la lista, «Ya la tienes · Abrir»', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await nav(page, 'Explorar');
  await page.getByRole('button', { name: /Japonés · Demo de Flaski/ }).click();
  await expect(page.locator('#sheetBody')).toContainText('Ya la tienes');
  await expect(page.locator('#sheetBody [data-act="add-preview"]')).toHaveCount(0);
  await page.locator('#sheetBody [data-act="open-owned"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Japonés · Demo de Flaski' })).toBeVisible();
});

test('un apunte nuevo que se deja vacío y sin título se descarta al salir; etiquetas «filtrar en Biblioteca»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-page"]').first().click();
  await expect(page.locator('#pgTitle')).toBeVisible();
  await nav(page, 'Biblioteca');
  expect(await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return S.pages.size; })).toBe(0);
  await page.locator('#main [data-act="new-page"]').first().click();
  await page.locator('#pgTitle').fill('Con título');
  await page.locator('[data-act="page-tags"]').click();
  await expect(page.locator('#sheetBody')).toContainText('filtrar en Biblioteca');
  await page.keyboard.press('Escape');
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main')).toContainText('Con título');
});

test('«Hueco» desde una selección: solo la frase y el hueco resaltado', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Francia\n\nLa Revolución empezó en 1789. El Terror lo dirigió Robespierre entre 1793 y 1794.');
  await page.locator('#pgDeck').selectOption({ label: 'Historia' });
  await select(page, 0, 'Robespierre');
  await page.locator('#selBar [data-act="sel-cloze"]').click();
  await expect(page.locator('#fld-x')).toHaveValue('El Terror lo dirigió {{Robespierre}} entre 1793 y 1794.');
  await expect(page.locator('.ef-cz mark')).toHaveText('Robespierre');
  await expect(page.locator('.ef-cz')).not.toContainText('{{');
});
