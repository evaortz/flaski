import { test, expect, openApp, nav } from './fixtures.js';

test('sustantivo alemán: elegir el artículo y escribir la palabra con mayúscula', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="paste"]').click();
  await page.locator('#pasteText').fill(JSON.stringify({
    name: 'Alemán', lang: 'de-DE',
    notes: [{ type: 'de-noun', fields: { g: 'das', w: 'Haus', pl: 'die Häuser', t: 'la casa' } }],
  }));
  await page.getByRole('button', { name: 'Ver vista previa' }).click();
  await page.getByRole('button', { name: 'Añadir a mis mazos' }).click();
  await page.locator('#main [data-start]').click();

  // Tarjeta 1: der, die o das (solo sale una hermana nueva por sesión)
  await expect(page.locator('.card .front')).toContainText('Haus');
  await expect(page.locator('[data-choice]')).toHaveText([/der$/, /die$/, /das$/]);   // con su número de atajo delante
  await page.locator('[data-choice]', { hasText: 'die' }).click();
  await expect(page.locator('[data-grade="1"]')).toHaveClass(/suggested/);
  await page.locator('[data-grade="1"]').click();
  await page.locator('[data-choice]', { hasText: 'das' }).click();
  await expect(page.locator('[data-grade="3"]')).toHaveClass(/suggested/);
  await page.locator('[data-grade="3"]').click();
  await expect(page.getByRole('heading', { name: '¡Sesión terminada!' })).toBeVisible();
});

test('alemán: «strasse» por «Straße» es casi, y se sugiere Difícil', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="paste"]').click();
  await page.locator('#pasteText').fill(JSON.stringify({ name: 'Alemán', lang: 'de-DE', notes: [{ type: 'listen', fields: { x: 'Straße', t: 'la calle' } }] }));
  await page.getByRole('button', { name: 'Ver vista previa' }).click();
  await page.getByRole('button', { name: 'Añadir a mis mazos' }).click();
  await page.locator('#main [data-start]').click();
  await page.locator('#typed').fill('strasse');
  await page.locator('#typed').press('Enter');
  await expect(page.locator('.vnear')).toContainText('Casi');
  await expect(page.locator('[data-grade="2"]')).toHaveClass(/suggested/);
});
