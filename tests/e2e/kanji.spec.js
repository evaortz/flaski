// Escribir kanji a mano: Hanzi Writer corrige trazo a trazo (con datos de trazos locales en vez de jsDelivr)
import { readFileSync } from 'node:fs';
import { test, expect, openApp, nav, newCard } from './fixtures.js';

const NICHI = readFileSync(new URL('./trazos/nichi.json', import.meta.url), 'utf8');   // 日

// Recorre la línea media de cada trazo (coordenadas de Hanzi Writer: 1024×1024, con la y hacia arriba)
async function writeStrokes(page, box, medians, touch) {
  const r = await box.boundingBox();
  const pad = Math.round(r.width * 0.06), scale = (r.width - 2 * pad) / 1024;
  const at = ([x, y]) => ({ x: r.x + pad + x * scale, y: r.y + pad + (900 - y) * scale });
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  for (const median of medians) {
    const pts = [];
    for (let k = 0; k < median.length - 1; k++)
      for (let t = 0; t < 6; t++) pts.push(at(median[k].map((v, j) => v + (median[k + 1][j] - v) * t / 6)));
    pts.push(at(median.at(-1)));
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
      for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
      await page.mouse.up();
    }
    await page.waitForTimeout(150);
  }
}

test('escribir 日 a mano: se corrige trazo a trazo y sin errores @ambos', async ({ page }, info) => {
  await page.route(/hanzi-writer-data-jp@[^/]+\/%E6%97%A5\.json$/, route => route.fulfill({ contentType: 'application/json', body: NICHI }));
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-deck"]').click();
  await page.locator('#d-name').fill('Japonés');
  await page.locator('[data-kind="lang"]').click();
  await page.locator('#d-lang').selectOption('ja-JP');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="handwrite"]').click(); await page.locator('[data-act="use-type"]').click();
  await page.locator('#fld-q').fill('sol');
  await page.locator('#fld-a').fill('日');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await page.locator('#main [data-start]').first().click();

  const box = page.locator('#hwBox');
  await expect(box.locator('svg path').first()).toBeAttached();
  const medians = JSON.parse(NICHI).medians;
  await writeStrokes(page, box, medians, info.project.name === 'movil');
  await expect(page.locator('.verdict')).toContainText('Todos los trazos bien');
});
