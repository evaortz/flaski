// A 375 px nada se sale de lado: la lista, el mapa, la ficha de una casilla y el editor de una pregunta de alemán
import { test, expect, openApp, addBuiltinDeck } from './fixtures.js';

const fits = page => page.evaluate(() => ({ doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth, body: document.body.scrollWidth <= document.body.clientWidth }));

test('375 px: lista, mapa, ficha y editor de alemán sin desbordar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openApp(page);
  await addBuiltinDeck(page, 'Alemán · A2');
  expect(await fits(page)).toEqual({ doc: true, body: true });                        // la lista
  const seg = await page.locator('.dk-qh .mp-seg').boundingBox();
  expect(seg.x + seg.width).toBeLessThanOrEqual(375);
  await page.locator('[data-map-view="map"]').click();
  expect(await fits(page)).toEqual({ doc: true, body: true });                        // el mapa
  await page.locator('.mp-cells .mp-cell').first().click();
  if (await page.locator('#mpPop').count()) await page.locator('[data-act="map-ficha"]').click();
  await expect(page.locator('.mp-ficha')).toBeVisible();
  expect(await fits(page)).toEqual({ doc: true, body: true });                        // la ficha
  await page.locator('.mp-ficha .mp-fedit').click();
  await expect(page.locator('.ed-tools [data-char="ß"]')).toBeVisible();
  expect(await fits(page)).toEqual({ doc: true, body: true });                        // el editor
  const ss = await page.locator('.ed-tools [data-char="ß"]').boundingBox();
  expect(ss.x + ss.width).toBeLessThanOrEqual(375);
  const save = await page.locator('.ed-save').boundingBox();
  expect(save.x + save.width).toBeLessThanOrEqual(375);
});
