// Explorar › un tema de ejemplo, con cuenta: al añadirlo se abre su apunte, «Añadir y empezar» abre la tanda
// y «La tienes» / «Abrir el tema» lo abren siempre
import { test, expect, nav } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

const opos = async page => { await nav(page, 'Explorar'); await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click(); };

test('con cuenta: «Añadir» abre el apunte y «La tienes» lo vuelve a abrir', async ({ page }) => {
  await mockCloud(page);
  await openCloud(page);
  await opos(page);
  await page.locator('[data-ex="add-tema"]').first().click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Constitución/);
  await expect(page.locator('#pgBlocks .nb').first()).toBeVisible();
  await opos(page);
  await page.locator('.ex-row [data-ex="open-tema"]').first().click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Constitución/);
});

test('con cuenta: «Añadir y empezar» del tema destacado abre la tanda de 5 min, y luego «Abrir el tema» abre el apunte', async ({ page }) => {
  await mockCloud(page);
  await openCloud(page);
  await nav(page, 'Explorar');
  await page.locator('.ex-hero [data-ex="start-tema"]').click();
  await expect(page.locator('.studybar')).toBeVisible();
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Explorar');
  await page.locator('.ex-hero [data-ex="open-tema"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
});
