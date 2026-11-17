// Japonés · los kanji como sistema: salen solos de tus palabras (lista «Kanji»), se presentan justo antes de la
// primera palabra que los usa, cada paso espera al anterior, y se ven en «Tus kanji» y en su ficha
import { test, expect, openApp, nav, startTanda } from './fixtures.js';

const JA = { decks: [{ name: 'Japonés N5', lang: 'ja-JP', notes: [
  { type: 'vocab', fields: { w: '休日[きゅうじつ]', t: 'día festivo', p: '', e: '', n: '' } },
  { type: 'vocab', fields: { w: '休[やす]み', t: 'vacaciones', p: '', e: '', n: '' } },
  { type: 'vocab', fields: { w: '本[ほん]', t: 'libro', p: '', e: '', n: '' } },
] }] };
const kanjiCards = page => page.evaluate(async () => {
  const { S } = await import('/js/comun.js');
  return [...S.cards.values()].filter(c => c.type_id === 'ja-kanji').map(c => `${c.fields.k}${c.template}`).sort();
});

test('los kanji de tus palabras tienen su pregunta (tres pasos) en la lista «Kanji», una vez cada uno', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await expect.poll(() => kanjiCards(page)).toEqual(['休t1', '休t2', '休t3', '日t1', '日t2', '日t3', '本t1', '本t2', '本t3']);
  // Al recargar no se duplican
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect((await kanjiCards(page)).length).toBe(9);
  // Tus kanji: los tres, sin empezar, y la ficha con lo que significa y tus palabras
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-open]').filter({ hasText: 'Kanji' }).first().click();
  await expect(page.locator('#main .kj-col')).toContainText('3 kanji en las palabras de tus listas');
  await expect(page.locator('#main .kj-tile')).toHaveCount(3);
  await page.locator('#main .kj-tile[data-kj="休"]').click();
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('descans');
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('休日');
  await expect(page.locator('#sheetBody .kj-sheet')).toContainText('Paso 1: qué significa');
});

test('en la tanda, el kanji nuevo se presenta justo antes de la primera palabra que lo usa, y el paso 2 espera', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await expect.poll(() => kanjiCards(page)).toHaveLength(9);
  await nav(page, 'Hoy');
  await startTanda(page);
  // 休日: primero 休 y 日 (presentados, no se puntúan), luego la palabra
  await expect(page.locator('.kj-intro')).toContainText('Kanji nuevo');
  await expect(page.locator('.kj-intro .kj-big')).toHaveText('休');
  await page.locator('[data-act="ja-intro"]').click();
  await expect(page.locator('.kj-intro .kj-big')).toHaveText('日');
  await page.locator('[data-act="ja-intro"]').click();
  await expect(page.locator('article.card')).toContainText('休日');
  await expect(page.locator('.kj-intro')).toHaveCount(0);
  // Ninguna pregunta del paso 2 o 3 está en la tanda (esperan a que el paso 1 lleve unos días)
  const queued = await page.evaluate(async () => {
    const { S } = await import('/js/comun.js');
    return S.session.queue.map(id => S.cards.get(id)).filter(c => c.type_id === 'ja-kanji').map(c => c.template);
  });
  expect(queued.filter(t => t !== 't1')).toEqual([]);
});

test('paso 2: «¿cómo se lee aquí?» con la lectura del kanji en una de tus palabras y la explicación', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await expect.poll(() => kanjiCards(page)).toHaveLength(9);
  // El paso 1 de 休, superado hace días: su paso 2 ya puede salir
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const api = await import('/js/api.js');
    const t1 = [...S.cards.values()].find(c => c.type_id === 'ja-kanji' && c.fields.k === '休' && c.template === 't1');
    const p = { reps: 3, interval: 5, ease: 2.5, lapses: 0, due: Date.now() + 2 * 864e5, firstSeen: Date.now() - 9 * 864e5, last: Date.now() - 5 * 864e5, stability: 5, difficulty: 5 };
    S.progress.set(t1.id, p); await api.saveProgress(S.uid, t1.id, p);
  });
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js');
    const t2 = [...S.cards.values()].find(c => c.type_id === 'ja-kanji' && c.fields.k === '休' && c.template === 't2');
    const { go } = await import('/js/app.js');
    S.session = { scope: 'all', queue: [t2.id], done: 0, revealed: false, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null, startedAt: Date.now(), minutes: 0, picked: true };
    go('study');
  });
  await expect(page.locator('.kj-ask')).toContainText('¿Cómo se lee');
  const word = await page.locator('.kj-wordbig').textContent();
  const want = word.includes('日') ? 'きゅう' : 'やす';
  await page.locator('.kj-choices .choice', { hasText: want }).click();
  await expect(page.locator('.kj-choices .choice.right')).toContainText(want);
  await expect(page.locator('.kj-why')).toContainText(`Aquí se lee ${want}`);
});

test('la lista «Kanji»: «Tus kanji» arriba y sus preguntas plegadas debajo @ambos', async ({ page, seed }) => {
  await seed(JA);
  await openApp(page);
  await expect.poll(() => kanjiCards(page)).toHaveLength(9);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-open]').filter({ hasText: 'Kanji' }).first().click();
  const col = page.locator('#main .kj-col'), fold = page.locator('#main .dk-fold');
  await expect(col).toBeVisible();
  await expect(fold.locator('summary')).toContainText('Ver las 9 preguntas');
  await expect(page.locator('#main #cardRows')).toBeHidden();
  const [a, b] = [await col.boundingBox(), await fold.boundingBox()];
  expect(a.y).toBeLessThan(b.y);                                   // los kanji, antes que las preguntas
  await expect(page.locator('#main .kn-entry')).toHaveCount(0);   // la tabla de kana, en las listas de palabras
  await fold.locator('summary').click();
  await expect(page.locator('#main #cardRows li')).toHaveCount(9);
});
