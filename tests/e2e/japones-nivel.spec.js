// Japonés · Tu japonés (Perfil): cuánto llevas del N5 y del N4 con el criterio estricto (lo recordarías dentro de
// 3 semanas), palabras y kanji, y lo que te falta
import { test, expect, openApp, nav } from './fixtures.js';

const SEED = { decks: [
  { name: 'Japonés asentado', lang: 'ja-JP', studied: { due: 5, interval: 30 }, notes: [
    { type: 'vocab', fields: { w: '会[あ]う', t: 'quedar', p: '', e: '', n: '' } },
    { type: 'vocab', fields: { w: '青[あお]い', t: 'azul', p: '', e: '', n: '' } },
    { type: 'vocab', fields: { w: '本[ほん]', t: 'libro', p: '', e: '', n: '' } }] },
  { name: 'Japonés reciente', lang: 'ja-JP', studied: { due: 1, interval: 5 }, notes: [
    { type: 'vocab', fields: { w: '赤[あか]い', t: 'rojo', p: '', e: '', n: '' } }] }
] };

test('Tu japonés: lo asentado cuenta, lo reciente aún no; lo que falta del N5 y del N4, palabras y kanji', async ({ page, seed }) => {
  await seed(SEED);
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('#main [data-act="ja-nivel"]').click();
  const sh = page.locator('#sheetBody .jn');
  await expect(sh.locator('.rd-big')).toContainText('del N5');
  // 会う, 青い y 本 llevan un mes: las sabes. 赤い, de hace 5 días, aún no
  await expect(sh.locator('[data-jnk="w"]')).toContainText('3 de 684');
  await expect(sh.locator('.rd-h')).toContainText('680 palabras');
  await expect(sh.locator('.jn-list li')).toHaveCount(40);
  await expect(sh.locator('.jn-list')).not.toContainText('青い');
  await sh.locator('[data-jn-all]').click();
  await expect(sh.locator('.jn-list li')).toHaveCount(680);
  // Los kanji: sus preguntas de kanji aún no se han repasado, así que ninguno cuenta; 日 no está en tus palabras
  await sh.locator('[data-jnk="k"]').click();
  await expect(sh.locator('[data-jnk="k"]')).toContainText('0 de 103');
  await expect(sh.locator('.kj-tile[data-kj="日"]')).toBeVisible();
  await expect(sh.locator('.kj-tile[data-kj="青"]')).toHaveCount(0);
  // El N4
  await sh.locator('[data-jn="n4"]').click();
  await expect(sh.locator('.rd-big')).toContainText('del N4');
  await expect(sh.locator('[data-jnk="k"]')).toContainText('de 181');
  await expect(sh.locator('.jn-src')).toContainText('Jonathan Waller');
});

test('Tu japonés solo sale en Perfil si estudias japonés', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Inglés', lang: 'en-GB', cards: [['dog', 'perro']] }] });
  await openApp(page);
  await nav(page, 'Perfil');
  await expect(page.locator('#main [data-nav="stats"]').first()).toBeVisible();
  await expect(page.locator('#main [data-act="ja-nivel"]')).toHaveCount(0);
});
