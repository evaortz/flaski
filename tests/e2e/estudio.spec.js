import { test, expect, openApp, nav, createDeck, addBasicCards, addBuiltinDeck } from './fixtures.js';

test('crear un mazo con tarjetas, estudiarlas y que el progreso sobreviva a recargar', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Turco básico');
  await addBasicCards(page, [['ev', 'casa'], ['kapı', 'puerta']]);
  await expect(page.locator('#cardCount')).toHaveText('2 tarjetas');

  await page.locator('#main [data-start]').click();
  await expect(page.locator('.studybar .left')).toHaveText('2 quedan');
  for (const front of ['ev', 'kapı']) {
    await expect(page.locator('.card .front')).toContainText(front);
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.locator('[data-grade="3"]').click();
  }
  await expect(page.getByRole('heading', { name: '¡Sesión terminada!' })).toBeVisible();
  await expect(page.locator('.tally .g3')).toHaveText('Bien 2');

  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('.hero-num')).toHaveText('0');
  await expect(page.locator('.list .deck .go')).toHaveText('Al día');
});

test('«Otra vez» vuelve a sacar la tarjeta en la misma sesión y «Deshacer» la recupera', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Repaso');
  await addBasicCards(page, [['bir', 'uno']]);
  await page.locator('#main [data-start]').click();

  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.locator('[data-grade="1"]').click();
  await expect(page.locator('.studybar .left')).toHaveText('1 quedan');
  await expect(page.locator('.card .front')).toContainText('bir');

  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.locator('[data-grade="3"]').click();
  await expect(page.getByRole('heading', { name: '¡Sesión terminada!' })).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer la última' }).click();
  await expect(page.locator('.studybar .left')).toHaveText('1 quedan');
  await expect(page.locator('[data-grade="3"]')).toBeVisible();
});

test('el límite de nuevas por día se respeta y «10 nuevas más» lo amplía', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');   // 20 tarjetas, límite de 15 nuevas al día
  await nav(page, 'Estudiar');
  await expect(page.locator('.hero-num')).toHaveText('15');

  await page.getByRole('button', { name: 'Empezar a estudiar' }).click();
  for (let i = 0; i < 15; i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="4"]').click();
  }
  await expect(page.getByRole('heading', { name: '¡Sesión terminada!' })).toBeVisible();
  await page.getByRole('button', { name: '10 nuevas más' }).click();
  await expect(page.locator('.studybar .left')).toHaveText('5 quedan');

  // Lo pedido sigue valiendo hoy aunque se recargue
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('.hero-num')).toHaveText('5');
});

test('tarjeta de escribir la respuesta: corrige y sugiere la nota', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Escribir');
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('.tchip-big', { hasText: 'Escribir la respuesta' }).click();
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
