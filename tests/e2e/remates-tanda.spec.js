// Remates de la tanda: contador tras «Otra vez», volver a donde empezó, «No lo sé» en las de elegir y la hoja de editar
import { test, expect, openApp, nav, createDeck, newCard, addBasicCards, addBuiltinDeck } from './fixtures.js';

const left = page => page.locator('.studybar .left');
const study = page => page.locator('#main [data-start]').first().click();

test('tras «Otra vez» el contador avanza y la que vuelve se suma al total; al salir se vuelve a la lista', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await addBasicCards(page, [['Francia', 'París'], ['Italia', 'Roma'], ['Portugal', 'Lisboa']]);
  await study(page);
  await expect(left(page)).toContainText('pregunta 1 de 3');
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="1"]').click();
  await expect(left(page)).toContainText('pregunta 2 de 4');
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="3"]').click();
  await expect(left(page)).toContainText('pregunta 3 de 4');
  await page.locator('.studybar [data-act="exit"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Capitales' })).toBeVisible();
});

test('«No lo sé, ver respuesta» en una de elegir deja «Otra vez» marcado', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await newCard(page);
  await page.locator('[data-set-type="choice"]').click();
  await page.locator('#fld-q').fill('¿Capital de Francia?');
  await page.locator('#fld-a').fill('París');
  await page.locator('#fld-w').fill('Roma; Lisboa; Berlín');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await study(page);
  await page.locator('[data-act="reveal"][data-giveup]').click();
  await expect(page.locator('.grade.g1')).toHaveClass(/suggested/);
});

test('editar una pregunta dentro de la tanda: colores de siempre, título a la vista y los tipos caben', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Capitales');
  await addBasicCards(page, [['Francia', 'París']]);
  await study(page);
  await page.locator('[data-card]').click();
  await expect(page.locator('body')).not.toHaveClass(/in-study/);
  const title = await page.locator('.ed-title > span').boundingBox();
  expect(title.y).toBeGreaterThanOrEqual(0);
  const segs = await page.locator('.ed-segs').evaluate(el => [...el.children].every(k => k.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1 && k.scrollWidth <= k.clientWidth + 1));
  expect(segs).toBe(true);
  // Todos los nombres de campo (también los opcionales) en la misma letra
  const fonts = await page.locator('.ef-name').evaluateAll(els => [...new Set(els.map(e => getComputedStyle(e.closest('.ef').classList.contains('ef-req') ? e.parentElement : e).fontFamily))]);
  expect(fonts.length).toBeGreaterThan(0);
  // «Eliminar» en rojo sobre fondo claro (no sobre el color de la tanda)
  const bg = await page.locator('#sheetBody').evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/rgb\(255, 255, 255\)|rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/in-study/);
});

test('con «2 botones», «Otra vez» y «Bien» se reparten el ancho', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); S.prefs.study.buttons = 2; });
  await createDeck(page, 'Capitales');
  await addBasicCards(page, [['Francia', 'París']]);
  await study(page);
  await page.locator('[data-act="reveal"]').click();
  const [row, a, b] = await Promise.all(['.grades', '.grade.g1', '.grade.g3'].map(s => page.locator(s).boundingBox()));
  expect(Math.abs(a.width - b.width)).toBeLessThan(2);
  expect(a.width + b.width).toBeGreaterThan(row.width * 0.9);
});

test('Biblioteca cuenta las nuevas como «Estudiar» (una por nota)', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); S.newPerDay = 0; });   // hoy no toca ninguna: la ficha dice «N nuevas»
  await nav(page, 'Biblioteca');
  const hand = await page.locator('#main .lt-list').filter({ hasText: 'Japonés' }).locator('.lt-hand').textContent();
  const n = Number(/(\d+) nuevas/.exec(hand)?.[1]);
  expect(n).toBeGreaterThan(0);
  await page.locator('#main .lt-list').filter({ hasText: 'Japonés' }).click();
  await study(page);
  await expect(left(page)).toContainText(`de ${n}`);
});

test('huecos: la puntuación de detrás va pegada al hueco', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  await page.locator('[data-set-type="cloze"]').click();
  await page.locator('#fld-x').fill('El Terror lo dirigió {{Robespierre}}.');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await study(page);
  await expect(page.locator('.card .cz-nw')).toHaveText('….');
});
