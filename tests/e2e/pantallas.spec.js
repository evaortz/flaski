import { test, expect, openApp, nav, answer, addBuiltinDeck } from './fixtures.js';

test('todas las pantallas cargan sin errores con la app vacía', async ({ page }) => {
  await openApp(page);
  for (const name of ['Mis mazos', 'Explorar', 'Perfil', 'Estudiar']) await nav(page, name);
  await nav(page, 'Perfil');
  await page.locator('[data-nav="stats"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Estadísticas' })).toBeVisible();
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
});

test('estadísticas con datos: los filtros de periodo funcionan', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');
  await page.locator('#main [data-start]').click();
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="3"]').click();
  }
  await nav(page, 'Perfil');
  await page.locator('[data-nav="stats"]').click();
  await expect(page.locator('#main')).toContainText('3');
  for (const label of ['7 días', '1 año', 'Todo']) {
    const b = page.locator('#main').getByRole('button', { name: label, exact: true });
    if (await b.count()) { await b.first().click(); await expect(b.first()).toHaveAttribute('aria-pressed', 'true'); }
  }
});

test('un ajuste de Inicio se guarda, se aplica y sobrevive a recargar', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');
  await nav(page, 'Estudiar');
  await expect(page.getByRole('heading', { name: 'Actividad' })).toBeVisible();

  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  const toggle = page.locator('input[data-pref="home.activity"]');
  await toggle.evaluate(el => el.scrollIntoView());
  await toggle.locator('xpath=..').click();
  await expect(toggle).not.toBeChecked();

  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Estudiar');
  await expect(page.getByRole('heading', { name: 'Tus mazos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Actividad' })).toHaveCount(0);
});

test('el mazo de demostración de japonés se añade y se puede abrir una sesión', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await expect(page.locator('#cardCount')).toContainText('tarjetas');
  await page.locator('#main [data-start]').click();
  await expect(page.locator('.card')).toBeVisible();
});

test('en móvil ninguna pantalla tiene scroll horizontal', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'solo en móvil');
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');
  const screens = [['Estudiar'], ['Mis mazos'], ['Explorar'], ['Perfil'], ['Perfil', 'stats'], ['Perfil', 'settings']];
  for (const [tab, sub] of screens) {
    await nav(page, tab);
    if (sub) await page.locator(`[data-nav="${sub}"]`).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${tab}${sub ? ' › ' + sub : ''}`).toBeLessThanOrEqual(0);
  }
});
