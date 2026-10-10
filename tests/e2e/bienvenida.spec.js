// Presentación de bienvenida
import { test, expect, nav } from './fixtures.js';

test.use({ intro: true });

const open = async page => { await page.goto('/'); await expect(page.locator('.ob')).toBeVisible(); };

test('sale la primera vez, se recorre y crea un mazo del idioma elegido', async ({ page }) => {
  await open(page);
  await expect(page.locator('.ob h1')).toHaveText('Te damos la bienvenida a Flaski');
  await page.locator('.ob').getByRole('button', { name: 'Empezar', exact: true }).click();
  for (const title of ['Estudia solo lo que toca', 'Una tarjeta para cada cosa', 'Tus apuntes, unidos a tus tarjetas', 'Mazos hechos con IA']) {
    await expect(page.locator('.ob h2')).toHaveText(title);
    await expect(page.locator('.ob-phone img')).toHaveJSProperty('complete', true);
    expect(await page.locator('.ob-phone img').evaluate(i => i.naturalWidth)).toBeGreaterThan(0);   // la captura existe
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }
  await expect(page.locator('.ob h2')).toHaveText('¿Por dónde quieres empezar?');
  await page.locator('[data-ob-pick="lang"]').click();
  await page.locator('#obLang').selectOption('de-DE');
  await page.locator('[data-ob-go="lang"]').click();
  await expect(page.locator('.ob')).toHaveCount(0);
  await expect(page.locator('.ed-typesel')).toContainText('Sustantivo alemán');   // ya en el editor del mazo nuevo
  await page.locator('[data-act="close-sheet"]').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Alemán' })).toBeVisible();

  // No vuelve a salir
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('.ob:not(.news)')).toHaveCount(0);   // (las novedades sí pueden salir)
});

test('saltar, elegir un mazo de ejemplo de ese idioma', async ({ page }) => {
  await open(page);
  await page.locator('.ob-skip').click();
  await page.locator('[data-ob-pick="lang"]').click();
  await page.locator('#obLang').selectOption('ja-JP');
  await page.locator('[data-ob-example="japones-demo.json"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Japonés · Demo de Flaski');
});

test('«Ahora no» la cierra y se puede volver a ver desde Perfil', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ob h2')).toHaveText('Estudia solo lo que toca');
  await page.keyboard.press('Escape');                        // Esc lleva al final…
  await page.locator('[data-ob-done]').click();               // …y desde ahí se cierra
  await expect(page.locator('.ob')).toHaveCount(0);
  await nav(page, 'Perfil');
  await page.locator('[data-act="intro"]').click();
  await expect(page.locator('.ob')).toBeVisible();
});

test('las otras opciones llevan a su sitio', async ({ page }) => {
  await open(page);
  await page.locator('.ob-skip').click();
  await page.locator('[data-ob-pick="notes"]').click();
  await expect(page.locator('#pgTitle')).toBeVisible();
  await nav(page, 'Perfil');
  await page.locator('[data-act="intro"]').click();
  await page.locator('.ob-skip').click();
  await page.locator('[data-ob-pick="ia"]').click();
  await expect(page.getByRole('heading', { name: 'Pegar un mazo' })).toBeVisible();
});
