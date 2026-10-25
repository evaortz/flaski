// Preguntas de entender: «Explícalo con tus palabras» y «¿Qué pasaría si…?», y el paso de las básicas de ejemplo a su tipo
import { test, expect, openApp, openDeck, newCard } from './fixtures.js';

async function create(page, seed, typeId, fill) {
  await seed({ decks: [{ name: 'Macro' }] });
  await openApp(page);
  await openDeck(page, 'Macro');
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await page.locator(`[data-pick-type="${typeId}"]`).click();
  await page.locator('[data-act="use-type"]').click();
  for (const [id, v] of Object.entries(fill)) await page.locator(`#fld-${id}`).fill(v);
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await page.locator('#main [data-start]').first().click();
}

test('Explícalo: escribes, se marcan las ideas que salen (sin tildes, plural…) y se propone el botón', async ({ page, seed }) => {
  await create(page, seed, 'explain', { q: '¿Por qué subir los tipos ayuda a bajar la inflación?', k: 'Encarece el crédito\nBaja la inversión y el consumo\nCae la demanda agregada' });
  await expect(page.locator('.ent-chip')).toHaveText('Explícalo con tus palabras');
  await expect(page.locator('[data-ex-mode]')).toContainText(['Escribir', 'Pensarlo']);
  await page.locator('[data-ex-mode="write"]').click();
  await page.locator('#exText').fill('Los CREDITOS se encarecen y la gente invierte menos: baja la inversion');
  await page.locator('[data-act="reveal"]').click();
  const boxes = page.locator('.ent-idea input');
  await expect(boxes).toHaveCount(3);
  expect(await boxes.evaluateAll(l => l.map(i => i.checked))).toEqual([true, true, false]);
  await expect(page.locator('.ent-verdict b')).toHaveText('2 de 3 → a medias');
  await expect(page.locator('.grades [data-grade]')).toHaveText([/^Todavía no/, /^A medias/, /^Lo sé explicar/]);
  await expect(page.locator('.grades [data-grade="2"]')).toHaveClass(/suggested/);
  // Marcas la que falta: todas → «Lo sé explicar»
  await boxes.nth(2).check();
  await expect(page.locator('.ent-verdict b')).toHaveText('3 de 3 → lo sabes explicar');
  await expect(page.locator('.grades [data-grade="3"]')).toHaveClass(/suggested/);
  await page.locator('.grades [data-grade="3"]').click();
  await expect(page.locator('.ent-done')).toContainText('Lo que entiendes');
  await expect(page.locator('.ent-done .ent-pill')).toHaveText(['Lo sabrías explicar']);
});

test('¿Qué pasaría si…?: ↑ = ↓ en cada efecto, «Comprobar» marca bien y mal', async ({ page, seed }) => {
  await create(page, seed, 'whatif', { s: 'El BCE sube los tipos 0,5 puntos.', e: 'Inversión: baja\nAhorro: sube', k: 'Pedir prestado sale más caro' });
  await expect(page.locator('.ent-chip')).toHaveText('¿Qué pasaría si…?');
  await expect(page.locator('.wi-row .wi-name')).toHaveText(['Inversión', 'Ahorro']);
  await page.locator('[data-wi="0:down"]').click();
  await page.locator('[data-wi="1:down"]').click();
  await expect(page.locator('[data-wi="1:down"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-act="reveal"]').click();
  await expect(page.locator('[data-wi="0:down"]')).toHaveClass(/is-right/);
  await expect(page.locator('[data-wi="1:down"]')).toHaveClass(/is-wrong/);
  await expect(page.locator('[data-wi="1:up"]')).toHaveClass(/is-right/);
  await expect(page.locator('.ent-verdict b')).toHaveText('1 de 3 → todavía no');
  await expect(page.locator('.grades [data-grade="1"]')).toHaveClass(/suggested/);
});

// El color de un botón y el de su fondo (resuelto con un lienzo) → contraste WCAG
const contrast = el => {
  const rgba = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [l1, l2] = [lum(rgba(getComputedStyle(el).color)), lum(rgba(getComputedStyle(el).backgroundColor))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
test('¿Qué pasaría si…?: botones con su palabra, el elegido se lee y al comprobar la correcta y la equivocada se ven enteras', async ({ page, seed }) => {
  await create(page, seed, 'whatif', { s: 'Estudias todo la víspera.', e: 'Horas de estudio: igual\nLo que recuerdas un mes después: baja', k: 'Lo repartido dura más' });
  await expect(page.locator('.ent-q')).toHaveText('Para cada cosa, di si sube, se queda igual o baja.');
  await expect(page.locator('.wi-row').first().locator('.wi-b')).toHaveText(['↑ Sube', '= Igual', '↓ Baja']);
  // El nombre, encima de sus tres botones y en letra normal
  const [name, btn] = await Promise.all([page.locator('.wi-name').first().boundingBox(), page.locator('.wi-b').first().boundingBox()]);
  expect(btn.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  expect(await page.locator('.wi-name').first().evaluate(el => getComputedStyle(el).fontFamily)).not.toContain(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-hand').split(',')[0].trim()));
  await page.locator('[data-wi="0:up"]').click();
  await page.locator('[data-wi="1:down"]').click();
  expect(await page.locator('[data-wi="0:up"]').evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
  await page.locator('[data-act="reveal"]').click();
  await expect(page.locator('[data-wi="0:eq"]')).toHaveClass(/is-right/);
  await expect(page.locator('[data-wi="0:up"]')).toHaveClass(/is-wrong/);
  for (const sel of ['[data-wi="0:eq"]', '[data-wi="0:up"]', '[data-wi="1:down"]']) {
    expect(await page.locator(sel).evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    expect(await page.locator(sel).evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
  }
  expect(Number(await page.locator('[data-wi="0:down"]').evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(1);
});

test('las básicas del tema de ejemplo pasan a «Explícalo» sin perder el progreso; las editadas no, y repetirlo no cambia nada', async ({ page }) => {
  const now = new Date().toISOString(), due = new Date(Date.now() + 5 * 864e5).toISOString();
  const Q = 'Explica por qué no conviene repasar ni antes ni después de estar a punto de olvidar.', A = 'Antes es perder el tiempo; después hay que volver a aprenderlo';
  const card = (id, q, a) => ({ id, deck_id: 'd', owner: 'local', type_id: 'basic', template: 't1', fields: { q, a, n: '' }, front: q, back: a, note: '', hint: '', tags: [], position: 1, created_at: now });
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: 15, prefs: {} },
    decks: [{ id: 'd', owner: 'local', name: 'Por qué se te olvidan las cosas', created_at: now, folder_id: null, icon: '', color: '', tags: [], pinned: false, archived: false, options: {} }],
    cards: [card('c1', Q, A), card('c2', 'Explica con tus palabras por qué reconocer no es lo mismo que recordar.', 'Mi respuesta, cambiada')],
    progress: [{ user_id: 'local', card_id: 'c1', reps: 3, interval: 5, ease: 2.5, lapses: 0, stability: 5, difficulty: 5, due, first_seen: now, last: now }],
    log: [], folders: [], tags: [], types: [], events: [], pages: [],
  };
  await page.addInitScript(data => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', data); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
  await openApp(page);
  const read = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('flaski-local-v1')); return { cards: d.cards.map(c => [c.id, c.type_id, c.fields.k || '']), progress: d.progress.map(p => [p.card_id, p.interval]) }; });
  const want = { cards: [['c1', 'explain', 'Antes es perder el tiempo\nDespués hay que volver a aprenderlo'], ['c2', 'basic', '']], progress: [['c1', 5]] };
  await expect.poll(read).toEqual(want);
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await read()).toEqual(want);
});

test('Explícalo: el modo elegido (Escribir, Pensarlo) se lee: texto del color de la tanda sobre blanco', async ({ page, seed }) => {
  await create(page, seed, 'explain', { q: '¿Por qué sube el paro?', k: 'Cae la demanda' });
  for (const m of ['write', 'think']) {
    const b = page.locator(`[data-ex-mode="${m}"]`);
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    const [bg, fg, txt] = await b.evaluate(el => { const c = getComputedStyle(el); return [c.backgroundColor, c.color, el.textContent]; });
    expect(bg).toBe('rgb(255, 255, 255)');
    expect(fg).not.toBe(bg);
    expect(txt.trim().length).toBeGreaterThan(0);
  }
});

// Las casillas de las ideas tienen aspecto propio: sin marcar, borde blanco y fondo transparente; marcada, blanca
// con la marca en el azul de la tanda (también en oscuro)
test('casillas de «¿Qué ideas te salieron?»: aspecto propio, en claro y en oscuro', async ({ page, seed }) => {
  await create(page, seed, 'explain', { q: '¿Por qué funciona repartir?', k: 'Se olvida un poco\nRecordar cuesta y fija' });
  await page.locator('[data-act="reveal"]').click();
  const boxes = page.locator('.ent-idea input');
  await boxes.nth(1).check();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async theme => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.theme = theme; applyLook(S.prefs.look); }, theme);
    const [off, on] = await boxes.evaluateAll(xs => xs.map(x => { const cs = getComputedStyle(x), mark = getComputedStyle(x, '::after'); return { app: cs.appearance, bg: cs.backgroundColor, border: cs.borderTopColor, mark: mark.borderRightColor, markOn: mark.opacity }; }));
    expect(off).toMatchObject({ app: 'none', bg: 'rgba(0, 0, 0, 0)', border: 'rgb(255, 255, 255)', markOn: '0' });
    expect(on).toMatchObject({ app: 'none', bg: 'rgb(255, 255, 255)', markOn: '1' });
    const session = await page.evaluate(() => { const x = document.createElement('i'); x.style.color = 'var(--session)'; document.body.append(x); const c = getComputedStyle(x).color; x.remove(); return c; });
    expect(on.mark).toBe(session);
  }
});
