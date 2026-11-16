// Japonés · leer japonés de verdad: el modo lectura de un apunte (cuánto entiendes, las nuevas marcadas), aprender una
// palabra nueva con su frase, y los subtítulos de un capítulo (con su traducción, emparejada por tiempo)
import { test, expect, openApp, openPage, nav } from './fixtures.js';

const TEXTO = '# El tren bala\n\n新しい新幹線が来年から走ります。東京から大阪まで二時間で行けるようになります。切符はアプリで予約できます。';
const JA = {
  decks: [{ name: 'Japonés N5', lang: 'ja-JP', studied: { due: 5, interval: 10 }, notes: [
    { type: 'vocab', fields: { w: '新[あたら]しい', t: 'nuevo', p: '', e: '', n: '' } },
    { type: 'vocab', fields: { w: '来年[らいねん]', t: 'el año que viene', p: '', e: '', n: '' } },
    { type: 'vocab', fields: { w: '東京[とうきょう]', t: 'Tokio', p: '', e: '', n: '' } },
  ] }],
  pages: [{ md: TEXTO, deck: 'Japonés N5' }],
};

test('el modo lectura: cuánto entiendes, las palabras nuevas, y aprender una con su frase', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await openPage(page, 'El tren bala');
  await page.locator('#main [data-act="ja-leer"]').click();
  await expect(page.locator('#sheetBody .rd-big')).toContainText('de este texto ya lo conoces');
  const pct = Number((await page.locator('#sheetBody .rd-big b').textContent()).replace(/\D/g, ''));
  expect(pct).toBeGreaterThan(5);
  expect(pct).toBeLessThan(90);
  // Las nuevas, subrayadas; las que ya sabes, no
  await expect(page.locator('#sheetBody .rd-text .rd-new[data-rd="予約"]')).toBeVisible();
  await expect(page.locator('#sheetBody .rd-text .rd-new[data-rd="東京"]')).toHaveCount(0);
  await expect(page.locator('#sheetBody .rd-list')).toContainText('切符');
  // Tocar 予約: su lectura y significado, la frase del texto, y aprenderla
  await page.locator('#sheetBody .rd-text [data-rd="予約"]').first().click();
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('よやく');
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('切符はアプリで予約できます。');
  await page.locator('#sheetBody [data-act="rd-learn"]').click();
  await expect(page.locator('#toast')).toContainText('Palabra añadida con su frase');
  const card = await page.evaluate(async () => [...(await import('/js/comun.js')).S.cards.values()].find(c => c.type_id === 'vocab' && c.fields.w.startsWith('予約'))?.fields);
  expect(card.w).toBe('予約[よやく]');
  expect(card.e).toBe('切符はアプリで予約できます。');
  // Ya no sale como nueva
  await expect(page.locator('#sheetBody .rd-text .rd-new[data-rd="予約"]')).toHaveCount(0);
});

test('subtítulos: un .srt en japonés (y otro en español) crean un apunte con su traducción, listo para leer', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').first().click();
  await page.locator('#sheetBody [data-act="import-subs"]').click();
  await page.locator('#subsJa').setInputFiles({ name: 'cap-03.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:02:14,000 --> 00:02:16,000\n東京は大きい町です。\n\n2\n00:05:40,000 --> 00:05:42,000\n新しい切符を予約しました。\n') });
  await page.locator('#subsEs').setInputFiles({ name: 'cap-03.es.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:02:14,500 --> 00:02:16,000\nTokio es una ciudad grande.\n\n2\n00:05:41,000 --> 00:05:42,000\nReservé un billete nuevo.\n') });
  await page.locator('#subsName').fill('Capítulo 3');
  await page.locator('#sheetBody [data-act="subs-go"]').click();
  await expect(page.locator('#toast')).toContainText('Apunte creado: 2 frases');
  await expect(page.locator('#sheetBody .rd')).toBeVisible();
  await expect(page.locator('#sheetBody .rd-text')).toContainText('Tokio es una ciudad grande.');
  await expect(page.locator('#sheetBody .rd-text p')).toHaveCount(2);
  await expect(page.locator('#sheetBody .rd-text p').first()).toContainText('02:14');
  await expect(page.locator('#sheetBody .rd-text .rd-new[data-rd="町"]')).toBeVisible();   // nueva, con su lectura encima
});
