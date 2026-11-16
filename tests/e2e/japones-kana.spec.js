// Japonés · hiragana y katakana: la tabla (con el color de cómo llevas cada uno), empezar con los hiragana, la mini
// ficha de un kana y, al fallar シ escribiendo el romaji de ツ, los dos juntos con la pista
import { test, expect, openApp, nav } from './fixtures.js';

const JA = { decks: [{ name: 'Japonés N5', lang: 'ja-JP', notes: [{ type: 'vocab', fields: { w: 'いぬ', t: 'perro', p: '', e: '', n: '' } }] }] };
async function openTable(page) {
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-open]').filter({ hasText: 'Japonés N5' }).first().click();
  await page.locator('#main [data-act="kana-table"]').click();
  await expect(page.locator('#sheetBody .kn-grid')).toBeVisible();
}

test('la tabla de kana: empezar con los hiragana crea su lista y la ficha de un kana trae su truco y su pareja', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await openTable(page);
  await expect(page.locator('#sheetBody')).toContainText('Aún no has empezado con los hiragana');
  await expect(page.locator('#sheetBody .kn-cell.kn-no')).toHaveCount(46);
  await page.locator('#sheetBody [data-act="kana-start"]').click();
  await expect(page.locator('#toast')).toContainText('Lista «Hiragana» creada');
  await expect(page.locator('#sheetBody')).toContainText('Te sabes 0 de 46');
  // ぬ: truco, pareja (め) y tu palabra いぬ
  await page.locator('#sheetBody [data-kana="ぬ"]').click();
  await expect(page.locator('#sheetBody .kj-story')).toContainText('lazo');
  await expect(page.locator('#sheetBody .kj-confuse')).toContainText('め');
  await expect(page.locator('#sheetBody .kj-words')).toContainText('いぬ');
  // Katakana: en la tabla, el otro alfabeto
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheetBody .kn-sheet')).toHaveCount(0);
  await page.locator('#main [data-act="kana-table"]').click();
  await page.locator('#sheetBody [data-kana-alpha="k"]').click();
  await expect(page.locator('#sheetBody [data-kana="ア"]')).toBeVisible();
  await expect(page.locator('#sheetBody')).toContainText('Aún no has empezado con los katakana');
});

test('al fallar シ escribiendo «tsu», los dos juntos con la pista y la opción de practicarlos', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await openTable(page);
  await page.locator('#sheetBody [data-kana-alpha="k"]').click();
  await page.locator('#sheetBody [data-act="kana-start"]').click();
  await expect(page.locator('#toast')).toContainText('Lista «Katakana» creada');
  await page.locator('#sheetBody [data-kana="シ"]').click();
  await page.locator('#sheetBody [data-act="kana-practice"]').click();
  await expect(page.locator('article.card')).toContainText('シ');
  await page.locator('#typed').fill('tsu');
  await page.locator('form[data-form="typed"] button[type="submit"]').click();
  await expect(page.locator('.kn-compare')).toContainText('Has puesto tsu y era shi');
  await expect(page.locator('.kn-compare .kn-two')).toContainText('ツ');
  const pairs = await page.evaluate(async () => (await import('/js/comun.js')).S.prefs.ja.parejas);
  expect(pairs['シ']['ツ']).toBe(1);
});
