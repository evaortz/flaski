// Base común de las pruebas de punta a punta.
// La app se prueba siempre en modo local (todo en el navegador, sin Supabase):
// se sustituye js/config.js por uno sin credenciales, así nunca se toca la base de datos real.
import { test as base, expect } from '@playwright/test';

const LOCAL_CONFIG = `export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const APP_NAME = 'Flaski';
`;

// Datos ya hechos, sin tocar la pantalla: una receta se construye con el código de la propia app (las mismas
// funciones que usan sus pantallas) en una página aparte, una vez por proceso, y la prueba la mete en el
// navegador antes de abrir la app. Para las pruebas que solo necesitan tener datos; las que prueban justamente
// crear, añadir de Explorar o pegar siguen haciéndolo con la pantalla.
//   await seed({
//     folders: ['Oposición'],
//     decks: [{ name: 'Macro', folder?: 'Oposición', lang?: 'de-DE', cards?: [['pregunta', 'respuesta'], …],
//               studied?: { due: -1, interval: 3 } }],   // progreso de todas sus preguntas (due en días desde hoy)
//     builtin: ['Alemán · A2'],                          // como «Añadir a mis listas» en Explorar
//     pages: [{ md: '# Título\n\nTexto…', deck?: 'Macro', folder?: 'Oposición' }],   // como pasteNotes
//   });
//   await openApp(page);
async function buildSeed(recipe) {
  const api = await import('/js/api.js');
  const { S } = await import('/js/comun.js');
  const { saveNote } = await import('/js/pantallas/editor.js');
  const { getType } = await import('/js/pantallas/estudio.js');
  const { readBuiltin, importParsed } = await import('/js/pantallas/explorar.js');
  const { boldLabels } = await import('/js/notesio.js');
  const { textToBlocks, newBlock } = await import('/js/pages.js');
  // Cada receta empieza de cero, en la misma página (sin recargar)
  api.resetLocal();
  for (const k of ['decks', 'cards', 'progress', 'folders', 'tags', 'types', 'pages']) S[k]?.clear?.();
  const folders = new Map(), decks = new Map(), now = Date.now(), DAY = 864e5;
  for (const name of recipe.folders || []) {
    const f = await api.createFolder({ owner: S.uid, name, parent_id: null });
    S.folders.set(f.id, f); folders.set(name, f.id);
  }
  for (const d of recipe.decks || []) {
    const row = await api.createDeck({ owner: S.uid, name: d.name, description: '', icon: '', color: '', folder_id: folders.get(d.folder) || null, tags: [], pinned: false, is_public: false, options: { newPerDay: null, preset: '', lang: d.lang || '' } });
    S.decks.set(row.id, { tags: [], ...row }); decks.set(d.name, row.id);
    const made = [];
    for (const [q, a] of d.cards || []) made.push(...await saveNote({ type: getType('basic'), fields: { q, a, n: '' }, deckId: row.id }));
    if (d.studied) {
      const { due = 0, interval = 1 } = d.studied;
      for (const c of made) await api.saveProgress(S.uid, c.id, { reps: 2, interval, ease: 2.5, lapses: 0, due: now + due * DAY - (due <= 0 ? 1000 : 0), firstSeen: now - (interval + 7) * DAY, last: now - interval * DAY, stability: interval, difficulty: 5 });
    }
  }
  if (recipe.builtin?.length) {
    const index = await (await fetch('decks/index.json')).json();
    for (const name of recipe.builtin) {
      const file = index.find(x => x.name.includes(name))?.file;
      if (!file) throw new Error(`No hay ninguna lista de Explorar que se llame «${name}»`);
      const { deck } = await importParsed({ ...(await readBuiltin(file)), source: 'incluido:' + file });
      decks.set(name, deck.id);
    }
  }
  for (const p of recipe.pages || []) {
    const m = /^# (.+)\n+/.exec(p.md);
    const body = m ? p.md.slice(m[0].length) : p.md;
    const blocks = body.trim() ? boldLabels(textToBlocks(body)) : [newBlock()];
    await api.savePage({ id: api.newId(), owner: S.uid, title: m ? m[1] : '', icon: '', deck_id: decks.get(p.deck) || null, folder_id: folders.get(p.folder) || null, tags: [], blocks });
  }
  return localStorage.getItem('flaski-local-v1');
}

export const test = base.extend({
  // La página que construye las recetas (una por proceso de pruebas) y lo ya construido
  seeder: [async ({ browser }, use, workerInfo) => {
    const ctx = await browser.newContext({ baseURL: workerInfo.project.use.baseURL, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('flaski-seed')) { localStorage.clear(); localStorage.setItem('flaski-intro-done', '1'); localStorage.setItem('flaski-news-seen', 'never'); } } catch {} });
    await page.route('**/js/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: LOCAL_CONFIG }));
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    const built = new Map();
    let open = false;
    await use(async recipe => {
      const key = JSON.stringify(recipe);
      if (!built.has(key)) {
        if (!open) {
          await page.goto('/');
          await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
          open = true;
        }
        built.set(key, await page.evaluate(buildSeed, recipe));
      }
      return built.get(key);
    });
    await ctx.close();
  }, { scope: 'worker' }],
  // seed(receta): antes de openApp. Solo la primera vez que se abre la página (las recargas conservan lo que la prueba haga)
  seed: async ({ page, seeder }, use) => {
    await use(async recipe => {
      const data = await seeder(recipe);
      await page.addInitScript(d => { try { if (!sessionStorage.getItem('flaski-seed')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('flaski-seed', '1'); } } catch {} }, data);
    });
  },

  // La presentación de bienvenida sale con la app vacía: en las pruebas se da por vista,
  // salvo en las que la prueban (test.use({ intro: true })).
  intro: [false, { option: true }],
  page: async ({ page, intro }, use) => {
    if (!intro) await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); localStorage.setItem('flaski-news-seen', 'never'); } catch {} });
    await page.route('**/js/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: LOCAL_CONFIG }));
    // Nada de red externa (trazos de kanji, etc.)
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(page);
    expect(errors, 'errores de JavaScript en la página').toEqual([]);
  },
});
export { expect };

// Abre una lista desde la Biblioteca (con datos sembrados: lo que antes dejaba abierto createDeck)
export async function openDeck(page, name) {
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-open]').filter({ hasText: name }).first().click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
// Abre un apunte desde la Biblioteca (con datos sembrados: lo que antes dejaba abierto pasteNotes)
export async function openPage(page, title) {
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-page]').filter({ hasText: title }).first().click();
  await expect(page.locator('#pgTitle')).toHaveValue(title);
}
// Abre la app y espera a que termine de cargar
export async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
}

// Cambia de sección con la barra de abajo (durante una sesión de estudio está oculta: se sale antes)
export async function nav(page, name) {
  const exit = page.locator('.studybar [data-act="exit"]');
  if (await exit.count()) await exit.click();
  await page.locator('#nav').getByRole('button', { name }).click();
}

// Responde la siguiente tarjeta de la sesión con una nota (1-4)
export async function answer(page, g = 3) {
  await page.locator('[data-act="reveal"]').click();
  await page.locator(`[data-grade="${g}"]`).click();
}

export async function createDeck(page, name) {
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-deck"]').click();
  await page.locator('#d-name').fill(name);
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

// En una lista: «+» → «Una pregunta» (hoja en el móvil, menú desplegable en el ordenador)
export async function newCard(page) {
  await page.locator('#main [data-act="add-menu"]').click();
  await page.locator('#sheetBody [data-act="new-card"], #dkPop:not([hidden]) [data-act="new-card"]').click();
}
// En una lista: «…» → la opción con ese data-act (o data-stats)
export async function deckMenu(page, sel) {
  await page.locator('#main [data-act="deck-menu"]:visible').click();
  await page.locator(`#sheetBody ${sel}, #dkPop:not([hidden]) ${sel}`).click();
}

// Desde la vista de un mazo: crea tarjetas básicas (pregunta → respuesta)
export async function addBasicCards(page, pairs) {
  await newCard(page);
  for (const [i, [q, a]] of pairs.entries()) {
    await page.locator('#fld-q').fill(q);
    await page.locator('#fld-a').fill(a);
    const last = i === pairs.length - 1;
    await page.locator(last ? '.ed-foot button[type="submit"]' : '[data-act="save-card-more"]').click();
    if (!last) await expect(page.locator('#fld-q')).toHaveValue('');
  }
  await expect(page.locator('#sheet')).toBeHidden();
}

// Añade un mazo de los incluidos en la app desde Explorar
export async function addBuiltinDeck(page, name) {
  await nav(page, 'Explorar');
  await page.locator('#main [data-builtin]').filter({ hasText: name }).first().click();
  await page.getByRole('button', { name: 'Añadir a mis listas' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
// Unos apuntes a partir de un texto: un apunte nuevo (el primer «# » es su título) y el resto pegado dentro
export async function pasteNotes(page, text) {
  const m = /^# (.+)\n+/.exec(text);
  // En una carpeta, en el móvil, se crea con el botón «+» (Apunte o Lista)
  const direct = page.locator('#main [data-act="new-page"]:visible').first();
  if (await direct.count()) await direct.click();
  else { await page.locator('#main [data-act="create-menu"]').click(); await page.locator('#sheetBody [data-act="new-page"]').click(); }
  if (m) await page.locator('#pgTitle').fill(m[1]);
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.evaluate(t => {
    const dt = new DataTransfer(); dt.setData('text/plain', t);
    document.querySelector('[data-block-input]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, m ? text.slice(m[0].length) : text);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// Empieza una tanda desde Hoy; la primera vez sale la hoja de duración y se acepta la que viene marcada
export async function startTanda(page) {
  await page.locator('#main .hero-go').click();
  const go = page.locator('#sheetBody [data-act="tanda-go"]');
  await expect(go.or(page.locator('.studybar'))).toBeVisible();
  if (await go.isVisible()) await go.click();
  await expect(page.locator('.studybar')).toBeVisible();
}

// Editor de una pregunta en el móvil: Borrar, Duplicar y Reiniciar progreso van en «⋯ Más»
export async function edExtra(page) {
  const more = page.locator('[data-act="ed-extra"]');
  await expect(page.locator('.ed-save')).toBeVisible();
  if (await more.count() && await more.evaluate(el => getComputedStyle(el).display !== 'none')) await more.click();
}
