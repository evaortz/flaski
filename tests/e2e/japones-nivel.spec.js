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

test('Prepárate el N5: lo que falta va a una lista nueva, solo como en el examen, y entra en el Plan; si así no llegas, suben las nuevas al día', async ({ page, seed }) => {
  await seed(SEED);
  await openApp(page);
  // Con 5 nuevas al día no se llega a 680 palabras en 60 días
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); S.newPerDay = 5; });
  await nav(page, 'Perfil');
  await page.locator('#main [data-act="ja-nivel"]').click();
  await page.locator('#sheetBody [data-act="jx-open"]').click();
  const sh = page.locator('#sheetBody .jx');
  await expect(sh.locator('.sheet-hand')).toHaveText('Prepárate el N5');
  await expect(sh.locator('[data-jx-date]')).toHaveCount(2);
  await expect(sh).toContainText('680');
  // Otra fecha: dentro de 60 días
  const day = await page.evaluate(async () => { const { dayKey, addDays } = await import('/js/plan.js'); return addDays(dayKey(), 60); });
  await sh.locator('[data-jx-other]').click();
  await sh.locator('[data-jx-day]').fill(day);
  await sh.locator('[data-act="jx-save"]').click();
  // Con 10 min al día tampoco hay tiempo: suben las nuevas y los minutos, lo justo para llegar
  await expect(page.locator('#toast')).toContainText(/Para llegar al N5: \d+ nuevas al día \(antes 5\) y \d+ min más al día/);
  const r = await page.evaluate(async () => {
    const { S } = await import('/js/comun.js');
    const d = [...S.decks.values()].find(x => x.options?.jlpt === 'n5');
    const cards = [...S.cards.values()].filter(c => c.deck_id === d.id);
    const folder = S.folders.get(d.folder_id)?.name;
    const ex = S.prefs.plan.exams.find(e => e.id === 'ex-jlpt-n5');
    const { forecastNow } = await import('/js/plan2-app.js');
    const verdict = forecastNow().exams.find(e => e.id === 'ex-jlpt-n5')?.verdict;
    return { name: d.name, folder, n: cards.length, t2: cards.filter(c => c.template === 't2').length, aru: cards.find(c => c.fields.t && c.fields.w === '会[あ]う') ? 1 : 0, w: cards.find(c => c.fields.w?.startsWith('明'))?.fields.w, exam: ex && { date: ex.date, folder: ex.scope.folders[0] === d.folder_id, first: ex.order[0] === d.id }, cap: S.prefs.plan.caps?.newPerDay, verdict };
  });
  expect(r).toMatchObject({ name: 'JLPT N5 · lo que te falta', folder: 'JLPT N5', n: 680, t2: 0, aru: 0, w: '明[あか]るい', exam: { date: day, folder: true, first: true } });
  expect(r.cap).toBeGreaterThan(5);
  expect(r.cap).toBeLessThanOrEqual(30);
  expect(r.verdict).not.toBe('no');
  // Los kanji de esas palabras entran ya en la lista «Kanji», sin tener que volver a abrir la app
  await expect.poll(() => page.evaluate(async () => { const { S } = await import('/js/comun.js'); return [...S.cards.values()].filter(c => c.type_id === 'ja-kanji').length; }), { timeout: 15000 }).toBeGreaterThan(150);
  await expect(page.locator('#main')).toContainText('JLPT N5');
});

test('Tu japonés solo sale en Perfil si estudias japonés', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Inglés', lang: 'en-GB', cards: [['dog', 'perro']] }] });
  await openApp(page);
  await nav(page, 'Perfil');
  await expect(page.locator('#main [data-nav="stats"]').first()).toBeVisible();
  await expect(page.locator('#main [data-act="ja-nivel"]')).toHaveCount(0);
});
