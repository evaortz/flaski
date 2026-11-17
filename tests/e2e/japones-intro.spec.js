// Japonés · el aviso de bienvenida a lo nuevo (niveles del JLPT): sale una vez a quien estudia japonés, con su
// porcentaje del N5; «Ver mi nivel» abre Tu japonés; no vuelve al recargar, y a quien no estudia japonés no le sale
import { test, expect, openApp } from './fixtures.js';

const JA = { decks: [{ name: 'Japonés', lang: 'ja-JP', studied: { due: 5, interval: 30 }, notes: [
  { type: 'vocab', fields: { w: '会[あ]う', t: 'quedar', p: '', e: '', n: '' } }] }] };
const unseen = page => page.addInitScript(() => { try { if (!sessionStorage.getItem('jin-t')) { sessionStorage.setItem('jin-t', '1'); localStorage.removeItem('flaski-ja-intro'); } } catch {} });

test('sale una vez a quien estudia japonés, con su porcentaje; «Ver mi nivel» abre Tu japonés y no vuelve', async ({ page, seed }) => {
  await seed(JA);
  await unseen(page);
  await openApp(page);
  const sh = page.locator('#sheetBody .jin');
  await expect(sh.locator('.sheet-hand')).toHaveText('¡Novedades de japonés!');
  await expect(sh.locator('.jin-pct')).toContainText(/\d+ %\s*del N5 ya lo sabes de verdad/);
  await expect(sh.locator('.jin-list li')).toHaveCount(3);
  await sh.locator('[data-act="ja-nivel"]').click();
  await expect(page.locator('#sheetBody .jn .rd-big')).toContainText('del N5');
  expect(await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return S.prefs.seen.ja; })).toBe('2026-11-jlpt');
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.locator('#sheetBody .jin')).toHaveCount(0);
});

test('a quien no estudia japonés no le sale', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Inglés', lang: 'en-GB', cards: [['dog', 'perro']] }] });
  await unseen(page);
  await openApp(page);
  await page.waitForTimeout(1500);
  await expect(page.locator('#sheetBody .jin')).toHaveCount(0);
});
