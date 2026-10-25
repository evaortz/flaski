// El apunte en el móvil (375 px) no se mueve de lado: con tabla, imagen, títulos y la barra de escribir
import { test, expect, openApp, nav } from './fixtures.js';

test.skip(({ isMobile }) => !isMobile, 'solo en el móvil');

test('apunte a 375 px con tabla e imagen: nada se sale de lado (y mover y plegar siguen con 44 px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { addImage } = await import('/js/media.js');
    const c = document.createElement('canvas'); c.width = 1200; c.height = 500; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 1200, 500);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    const img = await addImage(new File([blob], 'ancha.png', { type: 'image/png' }));
    const blocks = [
      { id: 'b1', type: 'h2', text: 'Un apartado con un título bastante largo para ver si cabe bien' },
      { id: 'b2', type: 'p', text: 'Texto normal con una palabraextremadamentelargaquenocabeenlalineadeningunamanera y más.' },
      { id: 'b3', type: 'table', text: '| Columna uno | Columna dos | Columna tres | Columna cuatro |\n| --- | --- | --- | --- |\n| aaaaaaaaaa | bbbbbbbbbbbb | cccccccccc | dddddddddd |' },
      { id: 'b4', type: 'img', text: '', src: img },
      { id: 'b5', type: 'li', text: 'Una viñeta' },
    ];
    const p = await api.createPage({ owner: S.uid, title: 'Ancho', icon: '', deck_id: null, folder_id: null, tags: [], blocks });
    S.pages.set(p.id, p);
    (await import('/js/app.js')).go('page', { pageId: p.id });
  });
  await expect(page.locator('#pgBlocks .nb')).toHaveCount(5);
  await page.waitForTimeout(500);
  const over = () => page.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    for (const el of document.querySelectorAll('#main *')) {
      const b = el.getBoundingClientRect();
      if (!b.width || b.right <= W + 0.5) continue;
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (['auto', 'hidden', 'scroll', 'clip'].includes(o)) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}+${Math.round(b.right - W)}`);
    }
    return { diff: document.documentElement.scrollWidth - W, out: out.slice(0, 8) };
  });
  expect(await over()).toEqual({ diff: 0, out: [] });
  // Ningún campo de escritura con menos de 16 px (Safari haría zoom al tocarlo y la página se movería de lado)
  const small = () => page.evaluate(() => [...document.querySelectorAll('#main input, #main textarea, #main select, #main [contenteditable="true"]')]
    .filter(el => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${getComputedStyle(el).fontSize}`));
  expect(await small()).toEqual([]);
  for (const id of ['b3', 'b4']) {
    await page.locator(`#pgBlocks .nb[data-block="${id}"]`).click({ position: { x: 60, y: 10 } });
    await page.waitForTimeout(200);
    expect(await small(), id).toEqual([]);
  }
  // Escribiendo en un bloque (sale mover y la barra de abajo)
  await page.locator('#pgBlocks .nb[data-block="b2"] .nb-text').click();
  await page.waitForTimeout(300);
  expect(await over()).toEqual({ diff: 0, out: [] });
  // Un apunte con preguntas unidas y sugeridas (las pastillas de la derecha y sus zonas de 44 px)
  await nav(page, 'Explorar');
  await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click();
  await page.locator('[data-ex="add-tema"]').first().click();
  await expect(page.locator('#pgBlocks .nb-cards').first()).toBeVisible();
  await expect(page.locator('#pgBlocks .nb-sugdot').first()).toBeVisible({ timeout: 5000 });
  expect(await over()).toEqual({ diff: 0, out: [] });
});
