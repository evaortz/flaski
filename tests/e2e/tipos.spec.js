// Idioma del mazo y selector de tipos de tarjeta
import { test, expect, openApp, nav } from './fixtures.js';

async function newDeck(page, name, lang) {
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="new-deck"]').click();
  await page.locator('#d-name').fill(name);
  if (lang) {
    await page.locator('[data-kind="lang"]').click();
    await page.locator('#d-lang').selectOption(lang);
  } else {
    await page.locator('[data-kind="other"]').click();
  }
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
const picker = page => page.locator('#typePicker');
const groupNames = page => picker(page).locator('.tp-h').allInnerTexts();

test('mazo de alemán: el editor propone los tipos de alemán e idiomas, no los de otros idiomas', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Alemán', 'de-DE');
  await expect(page.locator('.deckhead')).toContainText('Alemán');
  await page.locator('#main [data-act="new-card"]').click();
  await expect(page.locator('.ed-typesel')).toContainText('Sustantivo alemán');       // empieza por el tipo propio del idioma
  await expect(page.locator('.ef-lang').first()).toContainText('Alemán');

  await page.locator('[data-act="pick-type"]').click();
  expect(await groupNames(page)).toEqual(['Para alemán', 'Para idiomas', 'Para cualquier tema']);
  await expect(picker(page)).toContainText('Vocabulario');
  await expect(picker(page).locator('[data-pick-type="kanji"]')).toHaveCount(0);

  await page.locator('[data-act="types-all"]').click();
  expect(await groupNames(page)).toContain('Otros');
  await expect(picker(page).locator('[data-pick-type="kanji"]')).toHaveCount(1);

  await page.locator('#typeSearch').fill('dictado');
  await expect(picker(page).locator('[data-pick-type]')).toHaveCount(1);
  await page.locator('#typeSearch').press('Enter');
  await expect(picker(page)).toBeHidden();
  await expect(page.locator('.ed-typesel')).toContainText('Dictado');
  // Vocabulario en un mazo de alemán: la palabra en alemán y la traducción en tu idioma
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="vocab"]').click();
  await expect(page.locator('[data-ef="w"] .ef-lang')).toHaveText('Alemán');
  await expect(page.locator('[data-ef="t"] .ef-lang')).toHaveText('Español');
});

test('mazo que no es de idiomas: solo tipos generales y sin audio', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Historia', '');
  await page.locator('#main [data-act="new-card"]').click();
  await expect(page.locator('.ed-typesel')).toContainText('Básica');
  await page.locator('[data-act="pick-type"]').click();
  expect(await groupNames(page)).toEqual(['Para cualquier tema']);
  await expect(picker(page).locator('[data-pick-type="vocab"]')).toHaveCount(0);
  await page.locator('[data-pick-type="reverse"]').click();
  await expect(page.locator('.ef-lang')).toHaveCount(0);
});

test('cambiar de mazo en el editor cambia el idioma de los campos', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Japonés', 'ja-JP');
  await newDeck(page, 'Francés', 'fr-FR');
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="vocab"]').click();
  await page.locator('#fld-w').fill('maison');
  await expect(page.locator('[data-ef="w"] .ef-lang')).toHaveText('Francés');
  await page.locator('#c-deck').selectOption({ label: 'Japonés' });
  await expect(page.locator('[data-ef="w"] .ef-lang')).toHaveText('Japonés');
  await expect(page.locator('#fld-w')).toHaveValue('maison');                       // lo escrito se conserva
  await expect(page.locator('[data-fmt="ruby"]')).toBeVisible();                     // furigana solo en japonés
});

test('un tipo oculto deja de salir en el editor', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Historia', '');
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('#typePicker [data-act="manage-types"]').click();
  await page.locator('[data-hide-type="cloze"]').click();
  await expect(page.locator('[data-hide-type="cloze"]')).toHaveText('Mostrar');
  await page.locator('#sheetBody').getByRole('button', { name: 'Cerrar' }).click();
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('[data-act="pick-type"]').click();
  await expect(picker(page).locator('[data-pick-type="cloze"]')).toHaveCount(0);
  await page.locator('#typeSearch').fill('huecos');                                  // buscando sí aparece
  await expect(picker(page).locator('[data-pick-type="cloze"]')).toHaveCount(1);
});

test('migración: los mazos antiguos reciben su idioma y desaparecen las copias por idioma', async ({ page }) => {
  const base = (id, deck, type, tpl, fields) => ({ id, deck_id: deck, owner: 'local', front: Object.values(fields)[0], back: Object.values(fields)[1] || '—', note: '', position: 1, note_id: 'n' + id, type_id: type, template: tpl, fields, hint: '', tags: [] });
  const vocabCopy = {
    id: 'copia-ja', owner: 'local', name: 'Vocabulario · Japonés', icon: '', description: '',
    fields: [{ id: 'w', name: 'Palabra', lang: 'ja-JP', autoplay: true, help: '' }, { id: 't', name: 'Traducción', lang: 'es-ES', autoplay: false, help: '' },
      { id: 'p', name: 'Pronunciación', lang: '', autoplay: false, help: '' }, { id: 'e', name: 'Ejemplo', lang: 'ja-JP', autoplay: false, help: '' }, { id: 'n', name: 'Notas', lang: '', autoplay: false, help: '' }],
    templates: [
      { id: 't1', name: 'Reconocer (palabra → traducción)', mode: 'flip', front: ['w'], back: ['t', 'p', 'e', 'n'] },
      { id: 't2', name: 'Recordar (traducción → escribir palabra)', mode: 'type', front: ['t'], back: ['p', 'e', 'n'], answer: 'w' },
    ],
  };
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: 15, prefs: {} },
    decks: [
      { id: 'd-tr', owner: 'local', name: 'Mis palabras', options: {}, tags: [] },
      { id: 'd-ja', owner: 'local', name: 'Cosas', options: {}, tags: [] },
      { id: 'd-hist', owner: 'local', name: 'Historia', options: {}, tags: [] },
      { id: 'd-de', owner: 'local', name: 'Alemán básico', options: {}, tags: [] },
    ],
    cards: [
      base('c1', 'd-tr', 'vocab', 't1', { w: 'ev', t: 'casa' }),
      base('c2', 'd-ja', 'copia-ja', 't1', { w: '水', t: 'agua' }),
      base('c3', 'd-hist', 'basic', 't1', { q: '¿Año?', a: '1789' }),
    ],
    progress: [], log: [], folders: [], tags: [], types: [vocabCopy], events: [],
  };
  await page.addInitScript(v => { if (!localStorage.getItem('flaski-local-v1')) localStorage.setItem('flaski-local-v1', v); }, JSON.stringify(db));
  await openApp(page);
  const stored = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('flaski-local-v1')));
  await expect.poll(async () => (await stored()).decks.map(d => `${d.id}:${d.options.lang}`)).toEqual(['d-tr:tr-TR', 'd-ja:ja-JP', 'd-hist:', 'd-de:de-DE']);
  await expect.poll(async () => (await stored()).types.length).toBe(0);
  expect((await stored()).cards.find(c => c.id === 'c2').type_id).toBe('vocab');

  await nav(page, 'Mis mazos');
  await page.getByRole('button', { name: /Cosas/ }).first().click();
  await expect(page.locator('.deckhead')).toContainText('Japonés');
  await page.locator('#main [data-start]').click();
  await expect(page.locator('.card .front')).toContainText('水');
});
