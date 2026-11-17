// Simulacro del JLPT: con preguntas de la carpeta «JLPT N5», las de oído se escuchan dentro del simulacro y la nota
// sale como en el examen (lenguaje sobre 120 y oído sobre 60, con sus mínimos, y si aprobarías)
import { test, expect, openApp } from './fixtures.js';

const OIDO = (x, a, w) => ({ type: 'oido', fields: { x, q: '¿Qué has oído?', a, w, t: '', n: '' } });
const SEED = { folders: ['JLPT N5'], decks: [
  { name: 'Gramática', folder: 'JLPT N5', lang: 'ja-JP', studied: { due: 5, interval: 10 }, notes: [
    { type: 'clozechoice', fields: { x: 'わたし{{は}} がくせいです。', w: 'を; に; で', e: '' } },
    { type: 'clozechoice', fields: { x: 'だれ{{が}} きましたか。', w: 'は; を; に', e: '' } },
    { type: 'choice', fields: { q: '¿Cómo se lee は cuando es partícula?', a: 'wa', w: 'ha; ba; pa', n: '' } }] },
  { name: 'De oído', folder: 'JLPT N5', lang: 'ja-JP', studied: { due: 5, interval: 10 }, notes: [
    OIDO('いま しちじ はんです。', '7:30', '4:30; 1:30; 7:00'), OIDO('りんごを みっつ ください。', '3', '1; 6; 8')] }
] };

test('simulacro de la carpeta JLPT N5: se escucha y la nota sale como en el JLPT', async ({ page, seed }) => {
  await seed(SEED);
  await openApp(page);
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { launch } = await import('/js/pantallas/simulacro.js');
    const f = [...S.folders.values()].find(x => x.name === 'JLPT N5');
    launch({ exam: 'f:' + f.id, n: 10, testOnly: true });
  });
  const qs = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.sim.qs.map(q => ({ right: q.opts.indexOf(q.correct) }))));
  expect(qs).toHaveLength(5);
  let heard = 0;
  for (let i = 0; i < qs.length; i++) {
    if (await page.locator('.sm-q ~ .listen-box, .sm-main .listen-box').count()) heard++;
    // Todas bien menos la primera
    await page.locator('.sm-choices .choice').nth(i === 0 ? (qs[i].right + 1) % 4 : qs[i].right).click();
    await page.locator(i === qs.length - 1 ? '[data-sim="review"].sm-next' : '[data-sim="next"]').click();
  }
  expect(heard).toBe(2);
  await page.locator('[data-sim="submit"]').click();
  const jl = page.locator('.sm-jl');
  await expect(jl.locator('.sm-h2')).toHaveText('Como en el JLPT N5');
  await expect(jl).toContainText('Vocabulario, gramática y lectura');
  await expect(jl).toContainText('Comprensión oral');
  await expect(jl.locator('.sm-jl-t')).toContainText('de 180 · hacen falta 80');
  const rec = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.sims.at(-1).jlpt));
  expect(rec.lvl).toBe('N5');
  expect(rec.lang + rec.oido).toBe(rec.total);
  expect([40, 60, 80, 120]).toContain(rec.lang);                   // 3 de lenguaje: 2 o 3 bien
  expect([30, 60]).toContain(rec.oido);                          // 2 de oído
  expect(rec.pass).toBe(rec.total >= 80 && rec.lang >= 38 && rec.oido >= 19);
});
