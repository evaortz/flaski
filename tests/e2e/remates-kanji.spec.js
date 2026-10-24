// Remates de kanji: kanji grande, lecturas, ficha del mapa, hoja «Orden de trazos» y fallos al escribir a mano
import { readFileSync } from 'node:fs';
import { test, expect, openApp, nav, newCard, addBuiltinDeck } from './fixtures.js';

const NICHI = readFileSync(new URL('./trazos/nichi.json', import.meta.url), 'utf8');   // 日

async function practiceKanji(page, k) {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo');
  await page.locator('[data-map-view="map"]').click();
  await page.locator('.mp-cells .mp-cell', { hasText: new RegExp(`^${k}$`) }).click();
  if (await page.locator('#mpPop').count()) await page.locator('#mpPop [data-act="map-ficha"]').click();
}

test('kanji suelto muy grande, lecturas kun y luego on, en minúscula y al tamaño del texto', async ({ page }, info) => {
  await practiceKanji(page, '水');
  // Ficha: el kanji grande con su significado y la de escribir como «agua · みず · スイ»
  await expect(page.locator('.mp-ft.is-cjk')).toContainText('agua');
  await expect(page.locator('.mp-qt b')).toContainText(['水', 'agua · みず · スイ']);
  await page.locator('[data-act="map-practice"]').click();
  const big = page.locator('.card .front .fld-kanji .fld-v');
  await expect(big).toBeVisible();
  const px = await big.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(px).toBeGreaterThanOrEqual(info.project.name === 'movil' ? 105 : 130);
  await page.locator('[data-act="reveal"]').click();
  await expect(page.locator('.card .answer .fld-l')).toContainText(['lectura kun', 'lectura on']);
  const kana = await page.locator('.card .answer .fld-kana .fld-v').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(kana).toBeGreaterThanOrEqual(20);
  expect(kana).toBeLessThanOrEqual(26);
});

test('hoja «Orden de trazos»: título a mano y créditos en una línea', async ({ page }) => {
  await practiceKanji(page, '水');
  await page.locator('[data-act="map-practice"]').click();
  await page.locator('.card .front [data-strokes]').first().click();
  await expect(page.locator('#sheetBody h2.sheet-hand')).toHaveText('Orden de trazos');
  await expect(page.locator('#sheetBody .hw-credits')).toHaveText('Trazos: Hanzi Writer · animCJK · Make Me A Hanzi');
});

test('escribir a mano: cada fallo hace parpadear el cuadro y al segundo sale la pista', async ({ page }) => {
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
  await page.evaluate(() => { window.__miss = 0; new MutationObserver(() => { if (document.querySelector('#hwBox.hw-miss')) window.__miss++; }).observe(document.querySelector('#hwBox'), { attributes: true, attributeFilter: ['class'] }); });
  // Un trazo que no toca (en diagonal por fuera del carácter), dos veces
  const r = await box.boundingBox();
  for (let k = 0; k < 2; k++) {
    await page.mouse.move(r.x + r.width * 0.1, r.y + r.height * 0.9);
    await page.mouse.down();
    for (let t = 1; t <= 8; t++) await page.mouse.move(r.x + r.width * (0.1 + t * 0.1), r.y + r.height * (0.9 - t * 0.1));
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  expect(await page.evaluate(() => window.__miss)).toBeGreaterThanOrEqual(2);
  // La pista: Hanzi Writer resalta el trazo que toca (un trazo con opacidad > 0 en la capa de resaltado)
  await expect.poll(() => box.evaluate(el => [...el.querySelectorAll('svg g')].some(g => g.style.opacity !== '' && Number(g.style.opacity) > 0 && [...g.querySelectorAll('path')].some(p => (p.getAttribute('stroke') || p.style.stroke || '').length && Number(getComputedStyle(p).opacity) > 0)))).toBe(true);
});
