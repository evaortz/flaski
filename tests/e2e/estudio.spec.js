import { test, expect, openApp, nav, createDeck, addBasicCards, addBuiltinDeck, newCard } from './fixtures.js';

test('crear un mazo con tarjetas, estudiarlas y que el progreso sobreviva a recargar', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Turco básico');
  await addBasicCards(page, [['ev', 'casa'], ['kapı', 'puerta']]);
  await expect(page.locator('.dk-meta')).toContainText('2 preguntas');

  await page.locator('#main [data-start]').click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 2');
  for (const front of ['ev', 'kapı']) {
    await expect(page.locator('.card .front')).toContainText(front);
    await page.getByRole('button', { name: 'Ver respuesta' }).click();
    await page.locator('[data-grade="3"]').click();
  }
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  await expect(page.locator('.tally .g3')).toHaveText(/2\s*Bien/);

  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('.hero-num')).toHaveText('0');
  await expect(page.locator('.hero-word')).toHaveText('al día');
});

test('«Otra vez» vuelve a sacar la tarjeta en la misma sesión y «Deshacer» la recupera', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Repaso');
  await addBasicCards(page, [['bir', 'uno']]);
  await page.locator('#main [data-start]').click();

  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await page.locator('[data-grade="1"]').click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 1');
  await expect(page.locator('.card .front')).toContainText('bir');

  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await page.locator('[data-grade="3"]').click();
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer la última' }).click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 1');
  await expect(page.locator('[data-grade="3"]')).toBeVisible();
});

test('el límite de nuevas por día se respeta y «N nuevas más» lo amplía con las que quedan', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');   // 20 tarjetas, límite de 15 nuevas al día
  await nav(page, 'Hoy');
  await expect(page.locator('.hero-num')).toHaveText('15');

  // Desde la lista salen todas sus nuevas, sin el límite del día
  await page.locator('#nav').getByRole('button', { name: 'Biblioteca' }).click();
  await page.getByRole('button', { name: /Armonía vocálica/ }).first().click();
  await page.locator('#main [data-start]').first().click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 20');
  await page.locator('.studybar [data-act="exit"]').click();
  // La tanda de todo lo de hoy (la de siempre, sin minutos: aquí cabe entera en una corta y no sale su botón)
  await nav(page, 'Hoy');
  await page.evaluate(() => document.querySelector('#main').insertAdjacentHTML('beforeend', '<button data-start="all" id="t-all">todo</button>'));
  await page.locator('#t-all').click();
  for (let i = 0; i < 15; i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="4"]').click();
  }
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  await page.getByRole('button', { name: '5 nuevas más' }).click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 5');

  // Lo pedido sigue valiendo hoy aunque se recargue
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('.hero-num')).toHaveText('5');
});

test('tarjeta de escribir la respuesta: corrige y sugiere la nota', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Escribir');
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="typing"]').click();
  const inputs = page.locator('.ef-input');
  await inputs.nth(0).fill('hice (yapmak)');
  await inputs.nth(1).fill('yaptım');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();

  await page.locator('#main [data-start]').click();
  await page.locator('#typed').fill('yaptim');
  await page.locator('#typed').press('Enter');
  await expect(page.locator('[data-grade="1"]')).toHaveClass(/suggested/);
});
