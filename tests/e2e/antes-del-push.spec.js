// Remates de antes del push en la tanda: la respuesta numérica en su recuadro, la fila de letras especiales sin
// idioma, la pregunta de la cara de doble sentido…
import { test, expect, startTanda } from './fixtures.js';

const DAY = 864e5, T0 = Date.now() - 30 * DAY;
// Una lista con estas preguntas (todas para hoy, en este orden) y la tanda empezada
async function tanda(page, cards, { lang = '', prefs = {} } = {}) {
  const now = new Date().toISOString();
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: 15, prefs },
    decks: [{ id: 'd', owner: 'local', name: 'Repaso', created_at: now, folder_id: null, icon: '', color: '', tags: [], pinned: false, archived: false, options: lang ? { lang } : {} }],
    cards: cards.map(([type, tpl, fields], k) => ({ id: `c${k}`, deck_id: 'd', owner: 'local', type_id: type, template: tpl, fields, front: '—', back: '—', note: '', hint: '', tags: [], position: k, created_at: now })),
    progress: cards.map((_, k) => ({ user_id: 'local', card_id: `c${k}`, reps: 3, interval: 4, ease: 2.5, lapses: 0, stability: 4, difficulty: 5, due: new Date(T0 + k * 1000).toISOString(), first_seen: new Date(T0).toISOString(), last: new Date(T0).toISOString() })),
    log: [], folders: [], tags: [], types: [], events: [], pages: [],
  };
  await page.addInitScript(data => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', data); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
  await page.goto('/');
  await startTanda(page);
}

test('respuesta numérica: al verla sin contestar, el número va en el recuadro «respuesta»', async ({ page }) => {
  await tanda(page, [['number', 't1', { q: '¿En qué año publicó Ebbinghaus su estudio?', a: '1885', t: '', u: '', n: 'Über das Gedächtnis' }]]);
  await page.locator('[data-act="reveal"]').click();
  const box = page.locator('article.card .answer');
  await expect(box.locator('.ans-l')).toHaveText('respuesta');
  await expect(box.locator('.fld-main')).toContainText('1885');
  await expect(box).toContainText('Über das Gedächtnis');
  // y no suelto debajo de la pregunta
  await expect(page.locator('article.card > :not(.answer)').filter({ hasText: '1885' })).toHaveCount(0);
});

test('escribir la respuesta en una lista sin idioma: la fila de letras especiales es la del español', async ({ page }) => {
  await tanda(page, [['typing', 't1', { q: '¿Cómo se llama el efecto por el que se recuerda mejor lo repartido?', a: 'Efecto de espaciado', n: '' }]]);
  await expect(page.locator('.chars-study button')).toHaveText(['ñ', 'á', 'é', 'í', 'ó', 'ú', 'ü', '¿', '¡']);
});
