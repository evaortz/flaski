// Idioma del mazo y selector de tipos de tarjeta
import { test, expect, openApp, nav, newCard } from './fixtures.js';

async function newDeck(page, name, lang) {
  await nav(page, 'Biblioteca');
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
const groupNames = page => picker(page).locator('.tp-g').allTextContents();

test('mazo de alemán: el editor propone los tipos de alemán e idiomas, no los de otros idiomas @ambos', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Alemán', 'de-DE');
  await expect(page.locator('.deckhead')).toContainText('Alemán');
  await newCard(page);
  await expect(page.locator('.ed-typesel')).toContainText('Sustantivo alemán');       // empieza por el tipo propio del idioma
  await expect(page.locator('.ef-input[lang="de-DE"]').first()).toBeVisible();
  // Los 4 de una lista de idiomas, con el del idioma; «Más tipos» abre el selector por grupos
  await expect(page.locator('.ed-segs [data-set-type]')).toHaveText(['Vocabulario', 'Básica', 'Escribir respuesta', 'Sustantivo alemán']);
  await page.locator('[data-act="pick-type"]').click();
  expect(await groupNames(page)).toEqual(['Recordar', 'Escribir', 'Elegir', 'Completar', 'Relacionar y ordenar', 'Entender', 'Con imagen', 'Tus tipos']);
  await expect(picker(page).locator('[data-pick-type="de-noun"]')).toContainText('alemán');
  await expect(picker(page).locator('[data-pick-type="kanji"]')).toHaveCount(0);

  await page.locator('[data-act="types-all"]').click();
  await expect(picker(page).locator('[data-pick-type="kanji"]')).toHaveCount(1);

  await page.locator('#typeSearch').fill('dictado');
  await expect(picker(page).locator('[data-pick-type]')).toHaveCount(1);
  await page.locator('#typeSearch').press('Enter');
  await expect(picker(page)).toBeHidden();
  await expect(page.locator('.ed-typesel')).toContainText('Dictado');
  // Vocabulario en un mazo de alemán: la palabra en alemán y la traducción en tu idioma
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="vocab"]').click(); await page.locator('[data-act="use-type"]').click();
  await expect(page.locator('#fld-w')).toHaveAttribute('lang', 'de-DE');
  await expect(page.locator('#fld-t')).toHaveAttribute('lang', /^es/);
});

test('mazo que no es de idiomas: solo tipos generales y sin audio', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Historia', '');
  await newCard(page);
  await expect(page.locator('.ed-typesel')).toContainText('Básica');
  await page.locator('[data-act="pick-type"]').click();
  await expect(page.locator('.ed-segs [data-set-type]')).toHaveText(['Básica', 'Con inversa', 'Huecos', 'Opción múltiple']);
  await expect(picker(page).locator('[data-pick-type="vocab"]')).toHaveCount(0);
  await page.locator('[data-act="types-all"]').click();                               // «Ver también los de idiomas»
  await expect(picker(page).locator('[data-pick-type="vocab"]')).toHaveCount(1);
  await page.locator('[data-pick-type="reverse"]').click(); await page.locator('[data-act="use-type"]').click();
  await expect(page.locator('.ed-typesel')).toHaveText('Con inversa');
  await expect(page.locator('.ef-input[lang]')).toHaveCount(0);
});

test('el último tipo que usaste en la lista sale marcado; «Varias de golpe» usa los mismos segmentos y «Más tipos»', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Historia', '');
  await newCard(page);
  await page.locator('[data-set-type="cloze"]').click();
  await page.locator('#fld-x').fill('La {{Bastilla}} cayó en 1789');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await newCard(page);
  await expect(page.locator('.ed-typesel')).toHaveText('Huecos');
  await page.keyboard.press('Escape');
  await page.locator('#main [data-act="add-menu"]').click();
  await page.locator('#sheetBody [data-act="quick-add"], #dkPop:not([hidden]) [data-act="quick-add"]').click();
  await expect(page.locator('.quickform .ed-typesel')).toHaveText('Huecos');
  await page.locator('.quickform [data-act="pick-type"]').click();
  await page.locator('#typePicker [data-pick-type="truefalse"]').click();
  await expect(page.locator('[data-act="use-type"]')).toHaveText('Usar «Verdadero o falso»');
  await page.locator('[data-act="use-type"]').click();
  await expect(page.locator('#typePicker')).toBeHidden();
  await expect(page.locator('.quickform .ed-typesel')).toHaveText('Verdadero o falso');
  await expect(page.locator('#q-text')).toHaveAttribute('placeholder', /La Luna tiene luz propia/);
});

test('cambiar de mazo en el editor cambia el idioma de los campos', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Japonés', 'ja-JP');
  await newDeck(page, 'Francés', 'fr-FR');
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('[data-pick-type="vocab"]').click(); await page.locator('[data-act="use-type"]').click();
  await page.locator('#fld-w').fill('maison');
  await expect(page.locator('#fld-w')).toHaveAttribute('lang', 'fr-FR');
  await page.locator('#c-deck').selectOption({ label: 'Japonés' });
  await expect(page.locator('#fld-w')).toHaveAttribute('lang', 'ja-JP');
  await expect(page.locator('#fld-w')).toHaveValue('maison');                       // lo escrito se conserva
  await expect(page.locator('[data-fmt="ruby"]')).toBeVisible();                     // furigana solo en japonés
});

test('un tipo oculto deja de salir en el editor', async ({ page }) => {
  await openApp(page);
  await newDeck(page, 'Historia', '');
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator('#typePicker [data-act="manage-types"]').click();
  await page.locator('[data-hide-type="cloze"]').click();
  await expect(page.locator('[data-hide-type="cloze"]')).toHaveText('Mostrar');
  await page.locator('#sheetBody').getByRole('button', { name: 'Cerrar' }).click();
  await newCard(page);
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

  await nav(page, 'Biblioteca');
  await page.getByRole('button', { name: /Cosas/ }).first().click();
  await expect(page.locator('.deckhead')).toContainText('Japonés');
  await page.locator('#main [data-start]').click();
  await expect(page.locator('.card .front')).toContainText('水');
});
