// Pistas de deslizar en la tanda: solo en el móvil; la primera vez solas y luego al arrastrar, hasta deslizar 10 veces y otra vez tras 30 días sin deslizar
import { test, expect, startTanda } from './fixtures.js';

const DAY = 864e5, T0 = Date.now() - 30 * DAY;
// Dos preguntas para hoy y las preferencias de deslizar que se quieran
async function seed(page, study = {}) {
  const now = new Date().toISOString();
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: 15, prefs: { study } },
    decks: [{ id: 'd', owner: 'local', name: 'Turco', created_at: now, folder_id: null, icon: '', color: '', tags: [], pinned: false, archived: false, options: {} }],
    cards: ['ev', 'su'].map((q, k) => ({ id: `c${k}`, deck_id: 'd', owner: 'local', type_id: 'basic', template: 't1', fields: { q, a: 'x', n: '' }, front: q, back: 'x', note: '', hint: '', tags: [], position: k, created_at: now })),
    progress: [0, 1].map(k => ({ user_id: 'local', card_id: `c${k}`, reps: 3, interval: 4, ease: 2.5, lapses: 0, stability: 4, difficulty: 5, due: new Date(T0 + k).toISOString(), first_seen: new Date(T0).toISOString(), last: new Date(T0).toISOString() })),
    log: [], folders: [], tags: [], types: [], events: [], pages: [],
  };
  await page.addInitScript(data => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', data); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
  await page.goto('/');
  await startTanda(page);
  await page.locator('[data-act="reveal"]').click();
}
const hints = page => page.locator('.swipe-hints');
// Empieza a arrastrar la pregunta hacia la derecha (sin soltar) o suelta el arrastre
const drag = (page, id, end = false) => page.locator('article.card .front').evaluate((el, [id, end]) => {
  const r = el.getBoundingClientRect(), y = r.y + r.height / 2, x0 = r.x + r.width / 2;
  const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: id, clientX: x, clientY: y }));
  if (end) return ev('pointercancel', x0);
  ev('pointerdown', x0);
  for (let k = 1; k <= 3; k++) ev('pointermove', x0 + k * 10);
}, [id, end]);

test('al ver la respuesta salen las pistas, tenues, y se van solas; deslizar cuenta @ambos', async ({ page }, info) => {
  await seed(page);
  if (info.project.name === 'escritorio') { await expect(page.locator('.grades')).toBeVisible(); await expect(hints(page)).toHaveCount(0); return; }
  await expect(hints(page).locator(':scope > span')).toHaveText(['←Otra vez', '→Bien', '↑ Fácil', '↓ Difícil']);
  // En los bordes de la pantalla, sin tapar el contenido: los lados fuera de los botones y «↓ Difícil» debajo
  const box = sel => hints(page).locator(sel).boundingBox(), grades = await page.locator('.grades').boundingBox();
  const [left, right, down] = [await box('.sh-left'), await box('.sh-right'), await box('.sh-down')];
  expect(left.x + left.width).toBeLessThanOrEqual(grades.x + 1);
  expect(right.x).toBeGreaterThanOrEqual(grades.x + grades.width - 1);
  expect(down.y).toBeGreaterThanOrEqual(grades.y + grades.height);
  await page.waitForTimeout(800);
  expect(Number(await hints(page).evaluate(el => getComputedStyle(el).opacity))).toBeCloseTo(0.35, 1);
  await expect(hints(page)).toHaveCount(0, { timeout: 4000 });
  // Deslizar a la derecha con el dedo: «Bien» y queda contado en las preferencias
  await page.locator('article.card .front').evaluate(el => {
    const r = el.getBoundingClientRect(), y = r.y + r.height / 2, x0 = r.x + r.width / 2;
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: x, clientY: y }));
    ev('pointerdown', x0);
    for (let k = 1; k <= 12; k++) ev('pointermove', x0 + k * 20);
    ev('pointerup', x0 + 240);
  });
  await expect(page.locator('.studybar .left')).toContainText('pregunta 2 de 2');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('flaski-local-v1')).settings.prefs.study.swipeCount)).toBe(1);
  // Después ya no salen solas (no tapan nada): solo mientras arrastras
  await page.locator('[data-act="reveal"]').click();
  await expect(page.locator('.grades')).toBeVisible();
  await expect(hints(page)).toHaveCount(0);
  await drag(page, 9);
  await expect(hints(page)).toHaveCount(1);
  await drag(page, 9, true);
  await expect(hints(page)).toHaveCount(0);
  // Hacia abajo: «Difícil»
  await page.locator('article.card .front').evaluate(el => {
    const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y0 = r.y + r.height / 2;
    const ev = (type, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 8, clientX: x, clientY: y }));
    ev('pointerdown', y0);
    for (let k = 1; k <= 12; k++) ev('pointermove', y0 + k * 20);
    ev('pointerup', y0 + 240);
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('flaski-local-v1')).events.map(e => e.grade))).toEqual([3, 2]);
});

test('tras 10 deslizamientos ya no salen', async ({ page }, info) => {
  test.skip(info.project.name === 'escritorio', 'solo en el móvil');
  await seed(page, { swipeCount: 10, swipeLast: Date.now() - 2 * DAY });
  await expect(page.locator('.grades')).toBeVisible();
  await expect(hints(page)).toHaveCount(0);
  await drag(page, 5);
  await page.waitForTimeout(300);
  await expect(hints(page)).toHaveCount(0);
});

test('vuelven si llevas 30 días sin deslizar', async ({ page }, info) => {
  test.skip(info.project.name === 'escritorio', 'solo en el móvil');
  await seed(page, { swipeCount: 10, swipeLast: Date.now() - 31 * DAY, swipeShown: true });
  await expect(page.locator('.grades')).toBeVisible();
  await expect(hints(page)).toHaveCount(0);
  await drag(page, 5);
  await expect(hints(page)).toHaveCount(1);
});

test('con «deslizar» desactivado no hay pistas', async ({ page }, info) => {
  test.skip(info.project.name === 'escritorio', 'solo en el móvil');
  await seed(page, { swipe: false });
  await expect(page.locator('.grades')).toBeVisible();
  await expect(hints(page)).toHaveCount(0);
});

// Con la tarjeta a medio arrastrar: la pastilla dice el intervalo de su botón, ese botón lleva el anillo de su color
// (separado por el fondo, nunca blanco), los demás se apagan y la tarjeta no lleva marco ni capa de color
test('a medio arrastrar: pastilla con el intervalo, el botón con su anillo y la tarjeta sin marco', async ({ page }, info) => {
  test.skip(info.project.name === 'escritorio', 'solo en el móvil');
  await seed(page, { swipeCount: 10, swipeLast: Date.now() });
  await expect(page.locator('.grades')).toBeVisible();
  for (const [dir, g, name, dx, dy] of [['right', 3, 'Bien', 1, 0], ['left', 1, 'Otra vez', -1, 0], ['up', 4, 'Fácil', 0, -1], ['down', 2, 'Difícil', 0, 1]]) {
    await page.locator('article.card .front').evaluate((el, [dx, dy]) => {
      const r = el.getBoundingClientRect(), x0 = r.x + r.width / 2, y0 = r.y + r.height / 2;
      const ev = (type, k) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 11, clientX: x0 + dx * k, clientY: y0 + dy * k }));
      ev('pointerdown', 0);
      for (let k = 1; k <= 8; k++) ev('pointermove', k * 25);
      window.__cancel = () => ev('pointercancel', 200);
    }, [dx, dy]);
    await page.waitForTimeout(300);
    const r = await page.locator('article.card .front').evaluate(el => {
      const card = el.closest('article.card'), cs = getComputedStyle(card), after = getComputedStyle(card, '::after');
      const bar = document.querySelector('#main .bar').getBoundingClientRect();
      const out = { swipe: card.dataset.swipe, label: after.content.replace(/^"|"$/g, ''), pill: after.backgroundColor, shadow: cs.boxShadow, bg: cs.backgroundColor, top: card.getBoundingClientRect().top, barBottom: bar.bottom,
        grades: [...document.querySelectorAll('.grade')].map(b => ({ g: b.dataset.grade, when: b.querySelector('small')?.textContent.trim(), bg: getComputedStyle(b).backgroundColor, shadow: getComputedStyle(b).boxShadow, opacity: getComputedStyle(b).opacity })) };
      window.__cancel();
      return out;
    });
    expect(r.swipe).toBe(dir);
    const btn = r.grades.find(x => x.g === String(g));
    expect(r.label).toBe(`${name} · ${btn.when}`);
    expect(r.pill).toBe(btn.bg);
    expect(btn.shadow).toContain(btn.bg);
    expect(btn.shadow).not.toContain('rgb(255, 255, 255)');
    expect(btn.opacity).toBe('1');
    for (const o of r.grades.filter(x => x !== btn)) expect(Number(o.opacity)).toBeCloseTo(0.35, 2);
    expect(r.shadow).toBe('none');
    expect(r.bg).toBe('rgba(0, 0, 0, 0)');
    if (dir === 'up') expect(r.top).toBeGreaterThanOrEqual(r.barBottom);
    await page.waitForTimeout(250);
  }
});
