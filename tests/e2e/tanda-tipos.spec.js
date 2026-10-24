// La tanda con una pregunta de cada uno de los 19 tipos: se responde cada una, se comprueba que no se sale
// de la pantalla y que salen los 4 botones con su intervalo. En el móvil guarda capturas en test-results/tanda/.
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';

const NICHI = readFileSync(new URL('./trazos/nichi.json', import.meta.url), 'utf8');   // 日
const DAY = 864e5, T0 = Date.now() - 30 * DAY;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="400" height="260" fill="#cfe3f5"/><path d="M40 200 Q140 60 220 140 T380 70" stroke="#4a7fb5" stroke-width="10" fill="none"/></svg>';

const DECKS = [['gen', 'Historia', ''], ['tr', 'Turco', 'tr-TR'], ['de', 'Alemán', 'de-DE'], ['ja', 'Japonés N5 · Lugares', 'ja-JP']];
// [tipo, plantilla, lista, campos, cómo se responde]
const reveal = async page => page.locator('[data-act="reveal"]').click();
const typed = text => async page => { await page.locator('#typed').fill(text); await page.locator('#typed').press('Enter'); };
const pickAll = (pick, target, check) => async page => {
  while (await page.locator(pick).count()) { await page.locator(pick).first().click(); if (target) await page.locator(target).first().click(); }
  await page.locator(check).click();
};
const CASES = [
  ['basic', 't1', 'gen', { q: '¿En qué año se aprobó la Constitución española?', a: '1978', n: 'Referéndum del 6 de diciembre' }, reveal],
  ['reverse', 't1', 'tr', { a: 'kütüphane', b: 'biblioteca', n: 'Okulun kütüphanesi çok büyük.' }, reveal],
  ['typing', 't1', 'tr', { q: 'biblioteca', a: 'kütüphane', n: 'Okulun kütüphanesi çok büyük.' }, typed('kutuphane')],
  ['cloze', 't1', 'tr', { x: 'Ev{{de}}yim', e: 'Estoy en casa' }, reveal],
  ['choice', 't1', 'gen', { q: '¿Capital de Australia?', a: 'Canberra', w: 'Sídney; Melbourne; Perth', n: '' }, async page => page.locator('.choice').first().click()],
  ['handwrite', 't1', 'ja', { q: 'Escribe «sol»', a: '日', n: 'ひ / にち' }, reveal],
  ['truefalse', 't1', 'gen', { s: 'Colón llegó a América en 1492', v: 'v', n: 'El 12 de octubre' }, async page => page.keyboard.press('2')],
  ['sort', 't1', 'de', { q: '¿Qué artículo lleva cada palabra?', g: 'der: Tisch, Stuhl\ndie: Lampe\ndas: Buch', n: '' }, pickAll('[data-sort-pick]', '[data-sort-group="0"]', '[data-act="sort-check"]')],
  ['clozechoice', 't1', 'de', { x: 'Ich wohne {{seit}} zwei Jahren hier.', w: 'für; vor; ab', e: 'Llevo dos años viviendo aquí.' }, async page => page.locator('.choice').nth(1).click()],
  ['steps', 't1', 'gen', { q: 'Ordena las fases de la mitosis', s: 'Profase\nMetafase\nAnafase\nTelofase', n: '' }, pickAll('[data-ord-pick]', null, '[data-act="ord-check"]')],
  ['number', 't1', 'gen', { q: '¿Cuántos artículos tiene la Constitución?', a: '169', t: '', u: 'artículos', n: '' }, async page => { await page.locator('#numIn').fill('170'); await page.locator('#numIn').press('Enter'); }],
  ['match', 't1', 'tr', { t: 'Une cada palabra con su traducción', p: 'ev = casa\nokul = escuela\nsu = agua', n: '' }, async page => {
    const L = t => page.locator('.match-col').first().getByRole('button', { name: t, exact: true });
    const R = t => page.locator('.match-col').nth(1).getByRole('button', { name: t, exact: true });
    await L('ev').click(); await R('agua').click();
    for (const [a, b] of [['ev', 'casa'], ['okul', 'escuela'], ['su', 'agua']]) { await L(a).click(); await R(b).click(); }
  }],
  ['occlusion', 't1', 'gen', { img: '![](img:mapa0001)', m: '20 50 25 20\n60 20 25 20', h: '¿Qué río es?', n: 'El Ebro' }, reveal],
  ['vocab', 't1', 'tr', { w: 'kütüphane', t: 'biblioteca', p: '/ky\'typhane/', e: 'Okulun kütüphanesi çok büyük.', n: '' }, reveal],
  ['conj', 't1', 'de', { v: 'gehen', k: 'Präsens', t: 'ir', f: 'ich = gehe\ndu = gehst\ner = geht', n: '' }, async page => {
    const ins = page.locator('.conj-in');
    for (const [k, v] of ['gehe', 'gehts', 'geht'].entries()) await ins.nth(k).fill(v);
    await ins.last().press('Enter');
  }],
  ['listen', 't1', 'tr', { x: 'Merhaba', t: 'Hola', n: '' }, typed('Merhaba')],
  ['order', 't1', 'tr', { f: 'Ben / eve / gidiyorum', t: 'Voy a casa', n: '' }, pickAll('[data-ord-pick]', null, '[data-act="ord-check"]')],
  ['de-noun', 't1', 'de', { g: 'das', w: 'Haus', pl: 'die Häuser', t: 'casa', n: '' }, async page => page.locator('.choice').first().click()],
  ['kanji', 't1', 'ja', { k: '図書館', m: 'biblioteca', on: 'トショカン', kun: '', e: '図書館[としょかん]で 本[ほん]を 読[よ]みます。' }, reveal],
];

test('la tanda con una pregunta de cada tipo: todo cabe y salen los 4 botones', async ({ page }, info) => {
  test.setTimeout(120e3);
  await page.route(/hanzi-writer-data-jp@[^/]+\/%E6%97%A5\.json$/, route => route.fulfill({ contentType: 'application/json', body: NICHI }));
  const now = new Date().toISOString();
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: 15, prefs: {} },
    decks: DECKS.map(([id, name, lang], k) => ({ id, owner: 'local', name, created_at: new Date(T0 + k).toISOString(), folder_id: null, icon: '', color: '', tags: [], pinned: false, archived: false, options: lang ? { lang } : {} })),
    cards: CASES.map(([type, tpl, deck, fields], k) => ({ id: `c${k}`, deck_id: deck, owner: 'local', type_id: type, template: tpl, fields, front: '—', back: '—', note: '', hint: '', tags: [], position: k, created_at: now })),
    // Todas ya vistas y para hoy, en el orden de la lista
    progress: CASES.map((_, k) => ({ user_id: 'local', card_id: `c${k}`, reps: 3, interval: 4, ease: 2.5, lapses: 0, stability: 4, difficulty: 5, due: new Date(T0 + k * 1000).toISOString(), first_seen: new Date(T0).toISOString(), last: new Date(T0).toISOString() })),
    log: [], folders: [], tags: [], types: [], events: [], pages: [],
  };
  await page.addInitScript(([data, svg]) => {
    localStorage.setItem('flaski-local-v1', data);
    const r = indexedDB.open('flaski-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('img', { keyPath: 'id' });
    r.onsuccess = () => r.result.transaction('img', 'readwrite').objectStore('img').put({ id: 'mapa0001', blob: new Blob([svg], { type: 'image/svg+xml' }), pending: false });
  }, [JSON.stringify(db), SVG]);
  await page.goto('/');
  await page.locator('#main [data-start="all"]').first().click();
  const shots = info.project.name === 'movil';
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  for (const [k, [type, , , , respond]] of CASES.entries()) {
    await expect(page.locator('.studybar')).toContainText(`pregunta ${k + 1} de ${CASES.length}`);
    if (shots) await page.screenshot({ path: `test-results/tanda/${String(k + 1).padStart(2, '0')}-${type}-a.png`, fullPage: true });
    expect(await fits(), `${type}: la pregunta se sale de la pantalla`).toBe(true);
    await respond(page);
    if (await page.locator('[data-act="reveal"]').count()) await reveal(page);
    await expect(page.locator('.grade')).toHaveCount(4);
    await expect(page.locator('.grade small')).toHaveCount(4);
    if (shots) await page.screenshot({ path: `test-results/tanda/${String(k + 1).padStart(2, '0')}-${type}-b.png`, fullPage: true });
    expect(await fits(), `${type}: la respuesta se sale de la pantalla`).toBe(true);
    await page.locator('[data-grade="3"]').click();
  }
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  if (shots) await page.screenshot({ path: 'test-results/tanda/20-fin.png', fullPage: true });
});
