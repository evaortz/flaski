// Hoy: preguntas para hoy, «Lo dejaste aquí», lo que flojea, el examen, lo que sabes y la actividad con la meta
import { test, expect, openApp, startTanda, nav, hoyCount } from './fixtures.js';
import { makeHistory } from './historial.js';

// El historial de prueba, con una carpeta, un apunte con apartados vinculados a preguntas y un examen
function seedHoy(page) {
  const db = makeHistory();
  const iso = t => new Date(t).toISOString();
  const now = Date.now(), DAY = 864e5;
  db.profile.display_name = 'Eva';
  db.folders.push({ id: 'f-macro', owner: 'local', name: 'Macroeconomía', parent_id: null, color: null, icon: null, position: 0, created_at: iso(now - 90 * DAY) });
  db.decks.forEach(d => { d.folder_id = 'f-macro'; });
  db.pages.push(
    { id: 'p-t4', owner: 'local', title: 'Tema 4', folder_id: 'f-macro', created_at: iso(now - 30 * DAY), updated_at: iso(now - 2 * DAY),
      blocks: [{ id: 'h-gr', type: 'h2', text: 'Leer el gráfico DA–OA' }, { id: 'b-gr', type: 'p', text: 'La demanda agregada…' },
        { id: 'h-inv', type: 'h2', text: 'Efecto en la inversión' }, { id: 'b-inv', type: 'p', text: 'Si sube el tipo de interés…' }] },
    { id: 'p-last', owner: 'local', title: 'Política monetaria', folder_id: 'f-macro', created_at: iso(now - 3 * DAY), updated_at: iso(now - 3600e3), blocks: [{ id: 'b1', type: 'p', text: 'El BCE…' }] },
  );
  // Una pregunta que te cuesta (fallada: intervalo 0) en el primer apartado y otra que toca repasar en el segundo
  const prog = id => db.progress.find(p => p.card_id === id);
  const weak = db.progress.find(p => p.interval === 0), due = db.progress.find(p => p.interval >= 3 && p !== weak);
  Object.assign(db.cards.find(c => c.id === weak.card_id), { page_id: 'p-t4', block_id: 'b-gr' });
  Object.assign(db.cards.find(c => c.id === due.card_id), { page_id: 'p-t4', block_id: 'b-inv' });
  Object.assign(prog(due.card_id), { due: iso(now - DAY) });
  const exam = new Date(now); exam.setDate(exam.getDate() + 50);
  const examKey = `${exam.getFullYear()}-${String(exam.getMonth() + 1).padStart(2, '0')}-${String(exam.getDate()).padStart(2, '0')}`;
  db.settings.prefs = { home: { goal: 30 }, plan: { nodes: { 'f:f-macro': { exam: examKey } } } };
  return page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
}

test('Hoy: cada bloque con sus datos reales @ambos', async ({ page }, info) => {
  await seedHoy(page);
  await openApp(page);
  // La tanda de hoy (del plan): cuántas de cada examen y los repasos, y «Empezar · N min»
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy');
  expect((await hoyCount(page)).total).toBeGreaterThan(0);
  await expect(page.locator('#main .p2-go')).toContainText(/^Empezar · \d+ min$/);
  // Lo dejaste aquí: el último apunte editado
  await expect(page.locator('.hoy-last')).toContainText('Política monetaria');
  // Lo que flojea: primero lo que te cuesta, con su ruta y su estado
  const rows = page.locator('.hoy-weak');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Leer el gráfico DA–OA');
  await expect(rows.nth(0)).toContainText('Macroeconomía › Tema 4');
  await expect(rows.nth(0).locator('.hoy-pill')).toHaveText(/^\d+ te cuestan?$/);
  await expect(rows.nth(1).locator('.hoy-pill')).toHaveText(/^\d+ por repasar$/);
  // El botón suma lo que dicen las píldoras
  const pills = (await rows.locator('.hoy-pill').allTextContents()).reduce((n, t) => n + parseInt(t, 10), 0);
  await expect(page.locator('.hoy-weak-go')).toHaveText(`Repasar solo lo que flojea · ${pills}`);
  // Examen de la carpeta
  await expect(page.locator('#main .p2-exam')).toContainText('Macroeconomía');
  await expect(page.locator('#main .p2-exam')).toContainText('faltan 50 días');
  // Cómo va lo que sabes: sin «Aprendiendo» (cuenta como por aprender)
  await expect(page.locator('#pgHost .lv-k')).toContainText('Cómo va lo que sabes');
  await expect(page.locator('#pgHost .pg-lab-m1')).toHaveCount(0);
  await expect(page.locator('#pgHost .pg-lab-rest')).toContainText(/por aprender/i);
  // Tu actividad: 6 meses, hoy con anillo y la meta
  await expect(page.locator('.hoy-week')).toContainText('esta semana:');
  const today = page.locator('#hmHost rect.hm-today');
  await expect(today).toHaveCount(1);
  expect(await page.locator('#hmHost rect.hm:not(.is-out)').count()).toBeLessThanOrEqual(26 * 7);
  await expect(page.locator('.hoy-hm-foot')).toContainText('Meta: 30 al día');
  expect(await page.locator('#hmHost .hm-dot').count()).toBeGreaterThan(0);
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/hoy-${info.project.name}.png`, fullPage: true });
  // Abrir un apartado y repasar solo lo que flojea
  await page.locator('.hoy-weak-go').click();
  await expect(page.locator('.studybar .where')).toHaveText('Lo que flojea');
  await expect(page.locator('.studybar')).toContainText(`de ${pills}`);
  await page.locator('.studybar [data-act="exit"]').click();
  await rows.nth(0).click();
  await expect(page.locator('[data-block="h-gr"]')).toBeVisible();
});

test('Hoy: «cambiar» la meta lleva a Ajustes', async ({ page }) => {
  await seedHoy(page);
  await openApp(page);
  await page.locator('[data-act="goal-change"]').click();
  await expect(page.locator('#s-home')).toBeVisible();
});

test('Lo que flojea: también las listas con preguntas sueltas que te cuestan', async ({ page }) => {
  const db = makeHistory(), now = Date.now();
  // Ninguna te cuesta salvo tres de la primera lista (sin apunte): falladas hace poco o muchas veces
  for (const p of db.progress) Object.assign(p, { interval: Math.max(p.interval, 5), lapses: 0, due: new Date(now + 5 * 864e5).toISOString() });
  const deck = db.decks[0], mine = db.cards.filter(c => c.deck_id === deck.id).slice(0, 3);
  mine.forEach((c, i) => Object.assign(db.progress.find(p => p.card_id === c.id), i < 2 ? { interval: 0, last: new Date(now - i * 3600e3).toISOString(), due: new Date(now - 60e3).toISOString() } : { lapses: 4, interval: 6 }));
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
  await openApp(page);
  const row = page.locator('.hoy-weak');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(deck.name);
  await expect(row.locator('.hoy-pill')).toHaveText('3 te cuestan');
  // Las tres, aunque una no toque repasarla hoy
  await expect(page.locator('.hoy-weak-go')).toHaveText('Repasar solo lo que flojea · 3');
  await row.click();
  await expect(page.locator('#main h1').first()).toContainText(deck.name);
});

// Fecha AAAA-MM-DD dentro de d días
// Días de calendario (el día del cambio de hora no tiene 24 h)
const dayKey = d => { const t = new Date(); t.setDate(t.getDate() + d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function seedDb(page, db) {
  return page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
}

test('al volver tras unos días: lo atrasado no cabe, Hoy dice cuántos repasos caben y no entran nuevas', async ({ page }) => {
  // El historial acaba hace 20 días: lo que tocaba desde entonces está atrasado
  const db = makeHistory({ now: Date.now() - 20 * 864e5 });
  db.profile.display_name = 'Eva';
  for (let k = 0; k < 10; k++) db.cards.push({ ...db.cards[0], id: `nueva-${k}`, front: `Nueva ${k}`, position: 1000 + k });
  const t0 = new Date().setHours(0, 0, 0, 0), late = db.progress.filter(p => Date.parse(p.due) < t0).length;
  expect(late).toBeGreaterThanOrEqual(30);
  await seedDb(page, db);
  await openApp(page);
  await expect(page.locator('#main .p2-tanda small')).toContainText('Hola de nuevo, Eva');
  // Sin racha no se habla del comodín
  await expect(page.locator('.hoy-streak')).toContainText('Racha de 0 días');
  await expect(page.locator('.hoy-streak .st-freeze')).toHaveCount(0);
  // Todos los repasos que tocan hoy (hasta medianoche)
  const dueToday = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const end = new Date(); end.setHours(24, 0, 0, 0); return [...S.progress.values()].filter(p => p.due < end.getTime()).length; });
  expect(dueToday).toBeGreaterThanOrEqual(late);
  expect((await hoyCount(page)).reviews).toBe(dueToday);
  // Con 2 min al día no caben: Hoy lo dice, no entran nuevas y lo que quede pasa a mañana
  await page.evaluate(async () => {
    const { editPlan2 } = await import('/js/plan2-app.js'); const { go } = await import('/js/app.js');
    editPlan2().time.week = { mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 2, sun: 2 };
    go('home');
  });
  const c = await hoyCount(page);
  expect(c.new).toBe(0);
  expect(c.reviews).toBe(dueToday);
  await expect(page.locator('#main .p2-short')).toHaveText(new RegExp(String.raw`^Hoy tienes ${dueToday} repasos y 2 min: caben \d+\. Lo que quede pasa a mañana\.$`));
  // La tanda, sin nuevas
  await startTanda(page);
  await expect(page.locator('.studybar')).not.toContainText('nueva');
});

test('Examen cerca: Hoy lo dice y sus preguntas van primero', async ({ page }) => {
  const db = makeHistory();
  db.profile.display_name = 'Eva';
  db.folders.push({ id: 'f-macro', owner: 'local', name: 'Macroeconomía', parent_id: null, color: null, icon: null, position: 0, created_at: new Date().toISOString() });
  db.decks.find(d => d.id === 'd-bio').folder_id = 'f-macro';
  // Repasos de las dos listas para hoy
  for (const p of db.progress.filter((_, i) => i % 9 === 0)) p.due = new Date(Date.now() - 3600e3).toISOString();
  // Nuevas en las dos listas
  for (const deck of ['d-bio', 'd-hist']) for (let k = 0; k < 10; k++) db.cards.push({ ...db.cards.find(c => c.deck_id === deck), id: `${deck}-n${k}`, front: `Nueva ${k}`, position: 1000 + k });
  db.settings.prefs = { plan: { nodes: { 'f:f-macro': { exam: dayKey(9) } } } };
  await seedDb(page, db);
  await openApp(page);
  // El plan de antes se migra al entrar: la carpeta pasa a ser un examen
  const exam = page.locator('#main .p2-exam');
  await expect(exam).toContainText('Macroeconomía');
  await expect(exam).toContainText('faltan 9 días');
  await expect(exam).toContainText(/llegas|no llegas/);
  // Va justo después de «Lo que flojea» (o de lo de arriba, si no hay)
  expect(await exam.evaluate(el => el.previousElementSibling?.className)).toMatch(/hoy-flojea|hero/);
  // Las nuevas del examen: las de la tarjeta de la tanda, como en el plan
  const line = await page.locator('#main .p2-legend').textContent();
  expect(line).toMatch(/\d+ nuevas? de Macroeconomía/);
  // La tanda empieza por las preguntas del examen (Biología)
  await startTanda(page);
  await expect(page.locator('.studybar .where')).toHaveText('Biología');
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#main .p2-now').first()).toContainText('Macroeconomía');
});
