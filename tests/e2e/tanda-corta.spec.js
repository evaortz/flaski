// Tandas cortas: duración (la primera vez se pregunta), preguntas según tu ritmo, «Otra vez» dentro de la tanda y el final
import { test, expect, nav } from './fixtures.js';

const DAY = 864e5, T0 = Date.now() - 30 * DAY;
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// `due` repasos atrasados (r00 el que más) y `fresh` nuevas; `events`: respuestas anteriores con su tiempo en segundos
async function seed(page, { due = 40, fresh = 10, study = {}, events = [] } = {}) {
  const iso = t => new Date(t).toISOString(), now = iso(Date.now());
  const pad = k => String(k).padStart(2, '0');
  const cards = [
    ...Array.from({ length: due }, (_, k) => ({ id: `r${pad(k)}`, front: `r${pad(k)}` })),
    ...Array.from({ length: fresh }, (_, k) => ({ id: `n${pad(k)}`, front: `n${pad(k)}` })),
  ].map((c, k) => ({ ...c, deck_id: 'd', owner: 'local', type_id: 'basic', template: 't1', fields: { q: c.front, a: 'x', n: '' }, back: 'x', note: '', hint: '', tags: [], position: k, created_at: now }));
  const db = {
    profile: { id: 'local', display_name: '' }, settings: { new_per_day: 15, prefs: { study } },
    decks: [{ id: 'd', owner: 'local', name: 'Turco', created_at: now, folder_id: null, icon: '', color: '', tags: [], pinned: false, archived: false, options: {} }],
    cards,
    progress: Array.from({ length: due }, (_, k) => ({ user_id: 'local', card_id: `r${pad(k)}`, reps: 3, interval: 4, ease: 2.5, lapses: 0, stability: 4, difficulty: 5,
      due: iso(T0 + k * 60e3), first_seen: iso(T0 - DAY), last: iso(T0 - 4 * DAY) })),
    // Estudiaste ayer: lo atrasado no se reparte (ver atrasos.js)
    log: [{ user_id: 'local', day: ymd(Date.now() - DAY), count: 5 }], folders: [], tags: [], types: [], pages: [],
    events: events.map((s, k) => ({ id: `e${k}`, user_id: 'local', card_id: 'r00', deck_id: 'd', ts: iso(T0 - DAY + k * 1000), grade: 3, state: 'review', ivl: 4, last_ivl: 2, ease: 2.5, ms: s * 1000 })),
  };
  await page.addInitScript(data => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', data); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
  await page.goto('/');
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
}
const left = page => page.locator('.studybar .left');

test('la primera tanda pregunta la duración; los atrasados primero (sin nuevas si no caben) y «Otra vez» vuelve antes de acabar', async ({ page }) => {
  await seed(page);
  // Sin respuestas anteriores: 12 s por repaso y 40 s por nueva. 10 min: los 40 repasos y 3 nuevas
  await expect(page.locator('#main .p2-legend span')).toHaveText(['3 nuevas', '40 repasos']);
  await expect(page.locator('#main .p2-go')).toHaveText('Empezar · 10 min');

  await page.locator('#main .p2-go').click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet).toContainText('¿Cuánto suele durar tu rato de estudio?');
  await expect(sheet.locator('.tanda-opt')).toHaveCount(4);
  await expect(sheet.locator('.tanda-opt[aria-pressed="true"]')).toContainText('10 min');
  // 5 min: 25 repasos (los repasos primero)
  await expect(sheet.locator('[data-tanda-min="5"]')).toContainText('unas 25 preguntas');
  await sheet.locator('[data-tanda-min="5"]').click();
  await expect(sheet.locator('[data-act="tanda-go"]')).toHaveText('Empezar · 5 min');
  await sheet.locator('[data-act="tanda-go"]').click();

  await expect(left(page)).toHaveText('pregunta 1 de 25 · repaso');
  await expect(page.locator('.card .front')).toContainText('r00');
  // r00 con «Otra vez»: vuelve a salir dentro de esta tanda
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="1"]').click();
  const seen = [];
  for (let i = 0; i < 60 && !(await page.locator('.done').count()); i++) {
    seen.push(`${(await page.locator('.card .front').textContent()).trim()} ${(await left(page).textContent()).split(' · ')[1]}`);
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="3"]').click();
  }
  expect(seen.slice(0, 2)).toEqual(['r01 repaso', 'r02 repaso']);
  expect(seen).toContain('r00 repaso');                    // la fallada vuelve en esta misma tanda
  // En 5 min no caben ni los 40 repasos: sin nuevas (el plan las deja para cuando quepan)
  expect(seen.filter(s => s.endsWith('nueva'))).toEqual([]);
  expect(seen).toHaveLength(25);

  // Final: recuento por botón, lo que queda para hoy y otra tanda igual
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  await expect(page.locator('.tally .g1')).toHaveText(/1\s*Otra vez/);
  await expect(page.locator('.tally .g3')).toHaveText(/25\s*Bien/);
  await expect(page.locator('.done-left')).toContainText('te quedan');
  await expect(page.getByRole('button', { name: 'Por hoy vale' })).toBeVisible();
  await page.getByRole('button', { name: 'Otra tanda · 5 min' }).click();
  await expect(left(page)).toContainText('pregunta 1 de');

  // Con los 5 min de hoy hechos, Hoy dice «Hecho por hoy» y lo que queda es un enlace; no vuelve a preguntar
  await nav(page, 'Hoy');
  await expect(page.locator('#main .hero h1')).toHaveText('Hecho por hoy');
  await expect(page.locator('#main .p2-go')).toHaveCount(0);
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.study.tandaMin))).toBe(5);
  await page.locator('#main .day-rest').click();
  await expect(left(page)).toContainText('pregunta 1 de');
});

test('si la tanda acaba con lo de hoy: «¡Todo hecho por hoy!» y solo «Volver»', async ({ page }) => {
  await seed(page, { due: 3, fresh: 0, study: { tandaAsked: true } });
  await expect(page.locator('#main .p2-legend')).toHaveText('3 repasos');
  await page.locator('#main .p2-go').click();
  for (let i = 0; i < 3; i++) { await page.locator('[data-act="reveal"]').click(); await page.locator('[data-grade="3"]').click(); }
  await expect(page.getByRole('heading', { name: '¡Todo hecho por hoy!' })).toBeVisible();
  await expect(page.locator('.done-left')).toHaveCount(0);
  await expect(page.locator('.done-go button')).toHaveText(['Volver']);
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.locator('.hero-done')).toContainText('estás al día');
});

test('el ritmo sale de tus respuestas (la mediana, sin las pausas) y «Hoy solo tengo…» cambia lo de hoy', async ({ page }) => {
  // 60 repasos de 10 s y unos ratos de dejar el móvil (más de 5 min) que no cuentan
  await seed(page, { study: { tandaAsked: true }, events: [...Array(60).fill(10), ...Array(8).fill(400)] });
  // 10 min: los 40 repasos (400 s) y 5 nuevas (200 s)
  await expect(page.locator('#main .p2-legend span')).toHaveText(['5 nuevas', '40 repasos']);
  await expect(page.locator('#main .p2-go')).toHaveText('Empezar · 10 min');
  // Hoy solo 5 min: caben 30 repasos y ninguna nueva; lo que quede, mañana
  await page.locator('#main [data-p2="today-min"]').click();
  await page.locator('#sheetBody [data-p2="today-set"][data-min="5"]').click();
  await expect(page.locator('#main .p2-legend span')).toHaveText(['40 repasos']);
  await expect(page.locator('#main .p2-short')).toHaveText('Hoy tienes 40 repasos y 5 min: caben 30. Lo que quede pasa a mañana.');
  // Tu tiempo lo cuenta: medido
  await page.evaluate(() => import('/js/app.js').then(({ go }) => go('planTime')));
  await expect(page.locator('#main .p2-cunde')).toContainText('10 s');
  await expect(page.locator('#main .sec-note').filter({ hasText: 'medido' })).toBeVisible();
});
