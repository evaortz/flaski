// Hoy: preguntas para hoy, «Lo dejaste aquí», lo que flojea, el examen, lo que sabes y la actividad con la meta
import { test, expect, openApp } from './fixtures.js';
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
  const exam = new Date(now + 50 * DAY);
  const examKey = `${exam.getFullYear()}-${String(exam.getMonth() + 1).padStart(2, '0')}-${String(exam.getDate()).padStart(2, '0')}`;
  db.settings.prefs = { home: { goal: 30 }, plan: { nodes: { 'f:f-macro': { exam: examKey } } } };
  return page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('flaski-local-v1', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(db));
}

test('Hoy: cada bloque con sus datos reales', async ({ page }, info) => {
  await seedHoy(page);
  await openApp(page);
  await expect(page.locator('.hero-hi')).toHaveText('Hola Eva, hoy tienes');
  const n = Number(await page.locator('.hero-num').textContent());
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('.hero-side')).toContainText('1 carpeta');
  await expect(page.locator('.hero-go')).toHaveText('Empezar una tanda');
  // Lo dejaste aquí: el último apunte editado
  await expect(page.locator('.hoy-last')).toContainText('Política monetaria');
  // Lo que flojea: primero lo que te cuesta, con su ruta y su estado
  const rows = page.locator('.hoy-weak');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Leer el gráfico DA–OA');
  await expect(rows.nth(0)).toContainText('Macroeconomía › Tema 4');
  await expect(rows.nth(0).locator('.hoy-pill')).toHaveText('te cuesta');
  await expect(rows.nth(1).locator('.hoy-pill')).toHaveText('toca repasar');
  await expect(page.locator('.hoy-weak-go')).toContainText('Repasar solo lo que flojea · ');
  // Examen de la carpeta
  await expect(page.locator('.hoy-exam')).toContainText('Examen de Macroeconomía');
  await expect(page.locator('.hoy-exam')).toContainText('faltan 50 días');
  // Cómo va lo que sabes: sin «Aprendiendo» (cuenta como por aprender)
  await expect(page.locator('#pgHost .lv-k')).toContainText('Cómo va lo que sabes');
  await expect(page.locator('#pgHost .pg-lab-m1')).toHaveCount(0);
  await expect(page.locator('#pgHost .pg-lab-rest')).toContainText('Por aprender');
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
  await page.locator('.studybar [data-act="exit"]').click();
  await rows.nth(0).click();
  await expect(page.locator('[data-block="h-gr"]')).toBeVisible();
});

test('Hoy: «cambiar» la meta lleva a Ajustes', async ({ page }) => {
  await seedHoy(page);
  await openApp(page);
  await page.locator('[data-act="goal-change"]').click();
  await expect(page.locator('#s-study')).toBeVisible();
});
