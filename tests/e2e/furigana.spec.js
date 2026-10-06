import { test, expect, openApp, nav, addBuiltinDeck } from './fixtures.js';

test('furigana en el editor: añadir, ver la vista previa y cambiarla', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="new-deck"]').click();
  await page.locator('#d-name').fill('Japonés');
  await page.locator('[data-kind="lang"]').click();
  await page.locator('#d-lang').selectOption('ja-JP');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="vocab"]').click();

  // Kanji justo antes del cursor + 振 → recuadro con vista previa en directo
  await page.locator('#fld-w').fill('水を飲む');
  await page.locator('#fld-w').evaluate(t => t.setSelectionRange(1, 1));
  await page.locator('[data-fmt="ruby"]').click();
  await expect(page.locator('#rubyPop')).toBeVisible();
  await expect(page.locator('#rubyPop .rp-pv')).toContainText('水');
  await page.locator('#rpIn').fill('みず');
  await expect(page.locator('#rpRt')).toHaveText('みず');
  await page.locator('#rpIn').press('Enter');
  await expect(page.locator('#rubyPop')).toBeHidden();
  await expect(page.locator('#fld-w')).toHaveValue('水[みず]を飲む');
  await expect(page.locator('[data-ruby-for="w"] rt')).toHaveText('みず');

  // Seleccionar otro kanji
  await page.locator('#fld-w').evaluate(t => { const i = t.value.indexOf('飲'); t.setSelectionRange(i, i + 1); });
  await page.locator('[data-fmt="ruby"]').click();
  await page.locator('#rpIn').fill('の');
  await page.locator('[data-act="ruby-ok"]').click();
  await expect(page.locator('#fld-w')).toHaveValue('水[みず]を飲[の]む');

  // Con el cursor dentro de una lectura, 振 la edita (o la quita)
  await page.locator('#fld-w').evaluate(t => t.setSelectionRange(3, 3));
  await page.locator('[data-fmt="ruby"]').click();
  await expect(page.locator('#rpIn')).toHaveValue('みず');
  await page.locator('[data-act="ruby-del"]').click();
  await expect(page.locator('#fld-w')).toHaveValue('水を飲[の]む');

  // Con el cursor en medio de una palabra en kanji, se toma la palabra entera
  await page.locator('#fld-w').fill('学校');
  await page.locator('#fld-w').evaluate(t => t.setSelectionRange(1, 1));
  await page.locator('[data-fmt="ruby"]').click();
  await expect(page.locator('#rubyPop .rp-pv')).toContainText('学校');
  await page.locator('#rpIn').fill('がっこう');
  await page.locator('#rpIn').press('Enter');
  await expect(page.locator('#fld-w')).toHaveValue('学校[がっこう]');
});

test('furigana oculta al estudiar: se destapa tocando el kanji', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await page.locator('#main [data-start]').click();
  // Avanza hasta una tarjeta con la furigana oculta en el anverso
  for (let i = 0; i < 30 && !(await page.locator('.ruby-hide').count()); i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="4"]').click();
  }
  const ruby = page.locator('.ruby-hide ruby').first();
  await expect(ruby).toBeVisible();
  const color = () => ruby.locator('rt').evaluate(el => getComputedStyle(el).color);
  expect(await color()).toBe('rgba(0, 0, 0, 0)');          // la lectura no se ve
  await ruby.click();
  await expect(ruby).toHaveClass(/peek/);
  expect(await color()).not.toBe('rgba(0, 0, 0, 0)');      // y al tocar, sí
});
