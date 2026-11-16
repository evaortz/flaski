import { test, expect, openApp, nav } from './fixtures.js';

// Una lista compartida trae su idioma y sus tipos de pregunta tal como los guardó su autor (por la API, sin pasar
// por la app). Al añadirla no se puede colar HTML: ni en el idioma (acaba en lang="…") ni en el modo o los ids de
// un tipo (acaban en class="mode-…", data-say="…")
const BAD_LANG = 'de" autofocus onfocus="window.__xss=1';
const BAD_TYPE = { id: 'evil', name: 'Trampa', fields: [{ id: 'q', name: 'P' }, { id: 'a', name: 'R' }],
  templates: [{ id: 't1', name: 'x', mode: 'x"><img src=x onerror="window.__xss=1">', front: ['q'], back: ['a'] }] };

test('añadir una lista compartida con idioma y tipo maliciosos: no se cuela nada y se puede estudiar', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Compartida', cards: [['bir', 'uno'], ['iki', 'dos']] }] });
  // La lista, compartida, con su idioma y un tipo propio con trampa en sus preguntas
  await page.addInitScript(([lang, type]) => {
    if (sessionStorage.getItem('flaski-evil')) return;
    sessionStorage.setItem('flaski-evil', '1');
    const db = JSON.parse(localStorage.getItem('flaski-local-v1'));
    const d = db.decks.find(x => x.name === 'Compartida');
    Object.assign(d, { is_public: true, options: { lang }, types: [type] });
    for (const c of db.cards) if (c.deck_id === d.id) c.type_id = 'evil';
    localStorage.setItem('flaski-local-v1', JSON.stringify(db));
  }, [BAD_LANG, BAD_TYPE]);
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('#main [data-pub]').first().click();
  await page.getByRole('button', { name: 'Añadir a mis listas' }).click();
  await expect(page.locator('#sheet')).toBeHidden();

  // La copia: sin idioma raro y sin el tipo con trampa
  const copy = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('flaski-local-v1'));
    const d = db.decks.filter(x => x.name === 'Compartida').find(x => !x.is_public);
    return { lang: d?.options?.lang ?? null, types: db.types.map(t => t.name) };
  });
  expect(copy.lang).not.toBe(BAD_LANG);
  expect(copy.types).not.toContain('Trampa');

  // Y estudiarla no ejecuta nada
  await page.locator('#main [data-start]').first().click();
  await expect(page.locator('.studybar')).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
