// Remates de la corrección: «casi» con letras especiales y con el artículo; títulos largos con letra más pequeña
import { test, expect, openApp, nav, createDeck, newCard } from './fixtures.js';

async function typingCard(page, q, a) {
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('#typePicker [data-pick-type="typing"]').click();
  await page.locator('[data-act="use-type"]').click();
  await page.locator('.ef-input').nth(0).fill(q);
  await page.locator('.ef-input').nth(1).fill(a);
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
}

test('escribir la respuesta: tildes y artículo valen «casi» (Difícil), no mal', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Vocabulario');
  await typingCard(page, 'Estación de tren', 'estación');
  await page.locator('#main [data-start]').first().click();
  await page.locator('#typed').fill('estacion');
  await page.locator('#typed').press('Enter');
  await expect(page.locator('.vnear')).toHaveText('Casi · Revisa las letras especiales');
  await expect(page.locator('[data-grade="2"]')).toHaveClass(/suggested/);
});

test('escribir la respuesta: sin el artículo, «casi · Te falta el artículo»', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Casa');
  await typingCard(page, 'Vivienda', 'el piso');
  await page.locator('#main [data-start]').first().click();
  await page.locator('#typed').fill('piso');
  await page.locator('#typed').press('Enter');
  await expect(page.locator('.vnear')).toHaveText('Casi · Te falta el artículo');
});

test('títulos largos de lista y de apunte: letra más pequeña y no más de 3 líneas en el móvil @ambos', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openApp(page);
  const long = 'Constitución Española de 1978: Título Preliminar y derechos fundamentales';
  await createDeck(page, long);
  const h = page.locator('.dk-title');
  await expect(h).toHaveClass(/is-longer/);
  const lines = async loc => loc.evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(await lines(h)).toBeLessThanOrEqual(3);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-page"]').first().click();
  await page.locator('#pgTitle').fill(long);
  await expect(page.locator('#pgTitle')).toHaveClass(/is-longer/);
  expect(await lines(page.locator('#pgTitle'))).toBeLessThanOrEqual(3);
});
