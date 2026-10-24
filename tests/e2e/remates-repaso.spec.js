// Remates del repaso: hermanas, lo de hoy igual en Hoy y en Biblioteca, estudiar todo lo nuevo de un apunte,
// el apunte y su lista en una ficha, Intro en el título, la caja «respuesta» al escribir y «Varias de golpe»
import { test, expect, openApp, nav } from './fixtures.js';

const DAY = 864e5;
function seed(page, { newPerDay = 10 } = {}) {
  const iso = t => new Date(t).toISOString(), now = Date.now(), at = iso(now - 40 * DAY);
  const noun = (id, note, tpl, g, w, pl, t, extra = {}) => ({ id, deck_id: 'de', owner: 'local', type_id: 'de-noun', template: tpl, note_id: note,
    fields: { g, w, pl, t }, front: tpl === 't1' ? w : t, back: tpl === 't1' ? g : w, note: '', hint: '', tags: [], position: 0, created_at: at, ...extra });
  const basic = (id, deck, k, extra = {}) => ({ id, deck_id: deck, owner: 'local', type_id: 'basic', template: 't1', note_id: null,
    fields: { q: `Pregunta ${k}`, a: `Respuesta ${k}`, n: '' }, front: `Pregunta ${k}`, back: `Respuesta ${k}`, note: '', hint: '', tags: [], position: k, created_at: at, ...extra });
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: newPerDay, prefs: { study: { tandaAsked: true } } },
    decks: [
      { id: 'de', owner: 'local', name: 'Alemán', created_at: at, folder_id: null, options: { lang: 'de-DE' } },
      { id: 'macro', owner: 'local', name: 'Tema 4', created_at: at, folder_id: null, options: {} },
    ],
    cards: [
      // Wohnung: la ida ya estudiada (toca hoy) y la vuelta nueva; Bahnhof: las dos nuevas
      noun('w1', 'n1', 't1', 'die', 'Wohnung', 'die Wohnungen', 'el piso'),
      noun('w2', 'n1', 't2', 'die', 'Wohnung', 'die Wohnungen', 'el piso', { position: 1 }),
      noun('b1', 'n2', 't1', 'der', 'Bahnhof', 'die Bahnhöfe', 'la estación de tren', { position: 2 }),
      noun('b2', 'n2', 't2', 'der', 'Bahnhof', 'die Bahnhöfe', 'la estación de tren', { position: 3 }),
      // Un apunte con 4 preguntas nuevas, en la lista que se creó con él
      ...[1, 2, 3, 4].map(k => basic(`m${k}`, 'macro', k, { page_id: 'p-t4', block_id: k < 3 ? 'h1' : 'h2' })),
    ],
    progress: [{ user_id: 'local', card_id: 'w1', reps: 3, interval: 4, ease: 2.5, lapses: 0, due: iso(now - DAY), first_seen: iso(now - 9 * DAY), last: iso(now - 5 * DAY) }],
    log: [{ user_id: 'local', day: new Date(now - DAY - 36e5 * new Date().getHours()).toLocaleDateString('sv'), count: 3 }],
    folders: [], tags: [], types: [], events: [],
    pages: [{ id: 'p-t4', owner: 'local', title: 'Tema 4', folder_id: null, deck_id: 'macro', created_at: at, updated_at: at,
      blocks: [{ id: 'h1', type: 'h2', text: 'Oferta' }, { id: 'b1', type: 'p', text: 'La oferta…' }, { id: 'h2', type: 'h2', text: 'Demanda' }, { id: 'b2', type: 'p', text: 'La demanda…' }] }],
  };
  return page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
}
const queue = page => page.evaluate(async () => {
  const { todayQueue } = await import('/js/pantallas/estudio.js');
  return todayQueue('all').ids;
});

test('hermanas: una sola por tanda (también si una es repaso y otra nueva); Biblioteca suma lo mismo que Hoy', async ({ page }) => {
  await seed(page, { newPerDay: 3 });
  await openApp(page);
  const ids = await queue(page);
  // De Wohnung solo el repaso; de Bahnhof, una de las dos nuevas
  expect(ids).toContain('w1');
  expect(ids).not.toContain('w2');
  expect(ids.filter(id => id === 'b1' || id === 'b2')).toHaveLength(1);
  const n = Number(await page.locator('.hero-num').textContent());
  expect(n).toBe(ids.length);
  // Biblioteca: el apunte y su lista en una sola ficha, y las fichas suman lo de Hoy
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main .ltile')).toHaveCount(2);
  await expect(page.locator('#main .ltile[data-open="macro"]')).toHaveCount(0);
  const hands = await page.locator('#main .lt-hand').allTextContents();
  expect(hands.reduce((a, t) => a + (parseInt(t, 10) || 0), 0)).toBe(n);
});

test('desde un apunte se estudia todo lo nuevo, y el resumen cuenta preguntas', async ({ page }) => {
  await seed(page, { newPerDay: 1 });
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main .ltile[data-page="p-t4"]').click();
  await expect(page.locator('.pg-status')).toContainText('4 sin estudiar');
  await expect(page.locator('.pg-status [data-start="page:p-t4"]')).toHaveText('Estudiar este apunte · 4');
  await expect(page.locator('[data-study-section="h1"]')).toHaveText('Estudiar 2');
  await page.locator('.pg-status [data-start="page:p-t4"]').click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 4');
});

test('Intro en el título baja al primer bloque; en el móvil, escribiendo, sin la barra de abajo', async ({ page }, info) => {
  await seed(page);
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main .ltile[data-page="p-t4"]').click();
  await page.locator('#pgTitle').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' bis');
  await page.keyboard.press('Enter');
  await expect(page.locator('#pgBlocks [data-block-input="h1"]')).toBeFocused();
  await expect(page.locator('#pgTitle')).toHaveValue('Tema 4 bis');
  if (info.project.name === 'movil') {
    // Sin teclado, la barra sigue; con el teclado abierto (el alto visible baja), se esconde
    await expect(page.locator('#nav')).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 300 }); visualViewport.dispatchEvent(new Event('resize')); });
    await expect(page.locator('#nav')).toBeHidden();
    await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
    await expect(page.locator('#nav')).toBeVisible();
  }
});

test('escribir la respuesta: tras comprobar, la caja «respuesta» solo lleva los demás campos', async ({ page }) => {
  await seed(page);
  await openApp(page);
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js');
    const { go } = await import('/js/app.js');
    S.session = { scope: 'all', queue: ['w2'], done: 0, revealed: false, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null, startedAt: Date.now(), minutes: 0 };
    go('study');
  });
  await page.locator('#typed').fill('Wohnung');
  await page.locator('#typed').press('Enter');
  await expect(page.locator('.verdict.ok')).toBeVisible();
  await expect(page.locator('.answer .fld')).toHaveCount(2);
  await expect(page.locator('.answer .fld-l')).toHaveText(['Artículo', 'Plural']);
});

test('«Varias de golpe»: detecta la coma, el ejemplo sigue al tipo y el botón cuenta notas y preguntas', async ({ page }) => {
  await seed(page);
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main .ltile[data-open="de"]').click();
  await page.locator('#main [data-act="add-menu"]').click();
  await page.locator('#sheetBody [data-act="quick-add"], #dkPop:not([hidden]) [data-act="quick-add"]').click();
  await page.locator('#q-type').selectOption('de-noun');
  await expect(page.locator('#q-text')).toHaveAttribute('placeholder', /^die - Wohnung - die Wohnungen - el piso/);
  await page.locator('#q-text').fill('die, Küche, die Küchen, la cocina\nder, Tisch, die Tische, la mesa\ndas, Bett, die Betten, la cama');
  await expect(page.locator('.qtable tbody tr').first().locator('td').nth(1)).toHaveText('Küche');
  await expect(page.locator('#qMap')).toContainText('separador: coma');
  await expect(page.locator('#qGo')).toHaveText('Crear 3 notas · 6 preguntas');
});
