// Japonés · frases y gramática en la tanda: furigana solo en lo que no sabes, partículas en color (y su hoja),
// la frase desmontada (y ordenarla), la entonación de la palabra y la familia de un verbo
import { test, expect, openApp } from './fixtures.js';

const FRASE = '私[わたし]は毎朝[まいあさ]図書館[としょかん]で本[ほん]を読[よ]みます。';
const JA = { decks: [{ name: 'Japonés N5', lang: 'ja-JP', notes: [
  { type: 'vocab', fields: { w: '図書館[としょかん]', t: 'biblioteca', p: '', e: FRASE, n: '' } },
  { type: 'vocab', fields: { w: '飲[の]む', t: 'beber', p: '', e: '', n: '' } },
] }] };
// Abre la tanda con la pregunta de reconocer de esa palabra
async function study(page, word, { reveal = false } = {}) {
  await page.evaluate(async ({ word, reveal }) => {
    const { S } = await import('/js/comun.js'); const { go } = await import('/js/app.js');
    const c = [...S.cards.values()].find(x => x.type_id === 'vocab' && x.template === 't1' && x.fields.w.startsWith(word));
    S.session = { scope: 'all', queue: [c.id], done: 0, revealed: reveal, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null, startedAt: Date.now(), minutes: 0, picked: true };
    go('study');
  }, { word, reveal });
}

test('furigana solo en lo que no sabes: desaparece cuando ya sabes leer esos kanji', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await expect.poll(() => page.evaluate(async () => [...(await import('/js/comun.js')).S.cards.values()].filter(c => c.type_id === 'ja-kanji').length)).toBeGreaterThan(0);
  await study(page, '図書館');
  await expect(page.locator('[data-fid="w"] rt')).toHaveText('としょかん');
  // Los tres kanji, con el paso 2 superado: ya sabes leerlos
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const api = await import('/js/api.js');
    for (const c of S.cards.values()) if (c.type_id === 'ja-kanji' && '図書館'.includes(c.fields.k) && c.template !== 't3') {
      const p = { reps: 3, interval: 5, ease: 2.5, lapses: 0, due: Date.now() + 3 * 864e5, firstSeen: Date.now() - 9 * 864e5, last: Date.now() - 864e5, stability: 5, difficulty: 5 };
      S.progress.set(c.id, p); await api.saveProgress(S.uid, c.id, p);
    }
  });
  await study(page, '図書館');
  await expect(page.locator('[data-fid="w"] .fld-t')).toContainText('図書館');
  await expect(page.locator('[data-fid="w"] rt')).toHaveCount(0);
  // La entonación (el diccionario la tiene: としょかん, 2)
  await expect(page.locator('[data-fid="w"] .ja-pitch')).toBeVisible();
});

test('partículas en color y su hoja; la frase desmontada y ordenarla', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await study(page, '図書館', { reveal: true });
  await expect(page.locator('[data-fid="e"] .ja-pt')).toHaveText(['は', 'で', 'を']);
  await page.locator('[data-fid="e"] .ja-pt[data-pt="で"]').click();
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('en (un sitio) o con qué');
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('No la confundas con');
  await page.keyboard.press('Escape');
  // Desmontar la frase
  await page.locator('[data-fid="e"] [data-act="ja-frase"]').click();
  const rows = page.locator('#sheetBody .ja-chunks li');
  await expect(rows.filter({ hasText: '図書館で' })).toContainText('dónde o con qué');
  await expect(rows.filter({ hasText: '図書館で' })).toContainText('biblioteca');
  await expect(rows.filter({ hasText: '読みます' })).toContainText('la acción');
  await expect(rows.filter({ hasText: '読みます' })).toContainText('読む en cortés');
  await page.locator('#sheetBody [data-act="ja-ordenar"]').click();
  await expect(page.locator('#toast')).toContainText('Pregunta de ordenar añadida');
  const order = await page.evaluate(async () => [...(await import('/js/comun.js')).S.cards.values()].find(c => c.type_id === 'order')?.fields.f);
  expect(order).toContain('図書館で / 本を / 読みます');
});

test('la familia de un verbo: sus formas y «Practicar sus formas» crea sus preguntas', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await study(page, '飲', { reveal: true });
  await page.locator('[data-act="ja-verbo"]').click();
  await expect(page.locator('#sheetBody .ja-forms')).toContainText('飲んで');
  await expect(page.locator('#sheetBody .ja-forms')).toContainText('む → んで');
  await page.locator('#sheetBody [data-act="ja-verbo-crear"]').click();
  await expect(page.locator('#toast')).toContainText('4 preguntas de formas de 飲む');
  const forms = await page.evaluate(async () => [...(await import('/js/comun.js')).S.cards.values()].filter(c => c.type_id === 'ja-verbo').map(c => c.fields.a).sort());
  expect(forms).toEqual(['飲まない', '飲みます', '飲んだ', '飲んで']);
});
