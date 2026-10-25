// Simulacro de examen: preparar, responder sin corregir, «¿Entregas ya?», la nota, «Las respuestas», los fallos
// a mañana sin tocar el intervalo, el simulacro a medias y el teclado
import { test, expect, openApp, nav } from './fixtures.js';

// El tema de ejemplo de la Constitución (35 preguntas de varios tipos), todas empezadas, con examen en 20 días
async function setup(page) {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click();
  await page.locator('[data-ex="add-tema"]').first().click();
  await expect(page.locator('#pgTitle')).toBeVisible();   // al añadirlo se abre el apunte
  return page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const deck = [...S.decks.values()][0], now = Date.now();
    for (const c of S.cards.values()) S.progress.set(c.id, { reps: 2, interval: 10, ease: 2.5, lapses: 0, due: now + 9 * 864e5, last: now - 864e5, first_seen: now - 5 * 864e5 });
    S.prefs.plan.nodes[deck.id] = { exam: addDays(dayKey(), 20), lastWeek: true, after: 'reviews' };
    return deck.id;
  });
}
async function openExam(page) {
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('.pe-row').first().click();
  await expect(page.locator('.sm-block')).toBeVisible();
}

test('preparar, responder, «¿Entregas ya?», nota y respuestas; los fallos pasan a mañana sin tocar el intervalo', async ({ page }) => {
  await setup(page);
  await openExam(page);
  await page.locator('[data-sim="prep"]').click();
  await expect(page.locator('#sheetBody')).toContainText('preguntas de test');
  await page.locator('[data-sim="prep-set"][data-k="time"][data-v="30"]').click();
  await page.locator('[data-sim="prep-set"][data-k="pen"][data-v="3"]').click();
  const n = Number(/Empezar · (\d+) preguntas/.exec(await page.locator('[data-sim="start"]').textContent())[1]);
  expect(n).toBeGreaterThanOrEqual(5);
  await page.locator('[data-sim="start"]').click();
  await expect(page.locator('.sm-head')).toContainText(`pregunta 1 de ${n}`);
  await expect(page.locator('.sm-clock [data-clock]')).toHaveText(/^(30:00|29:5\d)$/);
  // Responder sin corregir: la opción queda marcada y no pasa nada más
  const qs = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.sim.qs.map(q => ({ kind: q.kind, right: q.opts ? q.opts.indexOf(q.correct) : -1 }))));
  for (let i = 0; i < n; i++) {
    const q = qs[i];
    if (i === 0) await page.locator('[data-sim="flag"]').click();
    if (q.kind === 'choice') {
      // Las dos primeras de elegir, mal; el resto, bien
      const wrong = qs.slice(0, i + 1).filter(x => x.kind === 'choice').length <= 2;
      const pick = wrong ? (q.right + 1) % (await page.locator('.sm-choices .choice').count()) : q.right;
      await page.locator('.sm-choices .choice').nth(pick).click();
      await expect(page.locator('.sm-choices .choice.picked')).toHaveCount(1);
      await expect(page.locator('.verdict')).toHaveCount(0);
    }
    await page.locator(i === n - 1 ? '[data-sim="review"].sm-next' : '[data-sim="next"]').click();
  }
  await expect(page.locator('.sm-h')).toHaveText('¿Entregas ya?');
  await expect(page.locator('.sm-kpis .flag b')).toHaveText('1');
  await expect(page.locator('.sm-grid .sm-n')).toHaveCount(n);
  await expect(page.locator('[data-sim="goto-flag"]')).toHaveText('Seguir · ir a la 1 para revisar');
  await page.locator('[data-sim="submit"]').click();
  // Nota
  await expect(page.locator('.sm-score b')).toBeVisible();
  const rec = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.sims[0]));
  expect(rec.n).toBe(n);
  expect(rec.bad).toBe(2);
  expect(rec.score).toBe(Math.max(0, Math.round(((rec.ok - rec.bad / 3) / n) * 1000) / 100));
  await expect(page.locator('.sm-pen')).toContainText(`${rec.ok} − 2 ÷ 3`);
  await expect(page.locator('.sm-note')).toContainText('Los 2 fallos ya están en tu tanda de mañana');
  // Los fallos: mañana, con el mismo intervalo
  const fails = await page.evaluate(async ids => { const { S } = await import('/js/comun.js'); return ids.map(id => S.progress.get(id)); }, rec.qs.filter(q => q[3] === 'x').map(q => q[0]));
  for (const p of fails) { expect(p.interval).toBe(10); expect(p.due - Date.now()).toBeLessThan(864e5 + 1); }
  // Las respuestas, con filtros
  await page.locator('[data-sim="answers"]').click();
  await expect(page.locator('.sm-h')).toHaveText('Las respuestas');
  await expect(page.locator('.sm-a')).toHaveCount(n);
  await page.locator('[data-sim="filter"][data-f="x"]').click();
  await expect(page.locator('.sm-a')).toHaveCount(2);
  await expect(page.locator('.sm-a s')).toHaveCount(2);
  await expect(page.locator('.sm-a [data-open-page]').first()).toBeVisible();
  // En la ficha del examen: «Los últimos» y la gráfica
  await page.locator('[data-sim="result"]').click();
  await page.locator('[data-sim="close"]').click();
  await expect(page.locator('.sm-last li')).toHaveCount(1);
  await expect(page.locator('.sm-chart')).toBeVisible();
  // Una fila de «Los últimos» abre «Las respuestas»
  await page.locator('.sm-last button').first().click();
  await expect(page.locator('.sm-h')).toHaveText('Las respuestas');
  await expect(page.locator('.sm-a')).toHaveCount(n);
});

test('simulacro a medias: al volver, «te quedan N min · Seguir / Descartar», y el reloj sigue desde donde estaba', async ({ page }) => {
  await setup(page);
  await openExam(page);
  await page.locator('[data-sim="prep"]').click();
  await page.locator('[data-sim="prep-set"][data-k="time"][data-v="30"]').click();
  await page.locator('[data-sim="start"]').click();
  await page.locator('[data-sim="next"]').click();
  // Han pasado 12 minutos con la app abierta
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { S.sim.since -= 12 * 60e3; }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.reload();
  await expect(page.locator('#sheetBody')).toContainText('Tienes un simulacro a medias');
  await expect(page.locator('#sheetBody')).toContainText('te quedan 17 min');
  await page.locator('#sheetBody [data-sim="continue"]').click();
  await expect(page.locator('.sm-head')).toContainText('pregunta 2 de');
  await expect(page.locator('.sm-clock [data-clock]')).toHaveText(/^1[78]:\d\d$/);
  // Salir avisa de que se pierde
  await page.locator('.sm-x').click();
  await expect(page.locator('#sheetBody')).toContainText('Si sales, se pierde este simulacro.');
  await page.locator('[data-sim="quit"]').click();
  expect(await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('flaski-simulacro:'))))).toBeNull();
});

test('ordenador: teclado 1-4, R, B, flechas y Esc', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'el teclado es del ordenador');
  await setup(page);
  await openExam(page);
  await page.locator('[data-sim="prep"]').click();
  await page.locator('[data-sim="start"]').click();
  await expect(page.locator('.sm-side .sm-grid')).toBeVisible();
  const first = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.sim.qs.findIndex(q => q.kind === 'choice')));
  for (let i = 0; i < first; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('2');
  await expect(page.locator('.sm-choices .choice').nth(1)).toHaveClass(/picked/);
  await page.keyboard.press('r');
  await expect(page.locator('.sm-flag')).toHaveClass(/on/);
  await page.keyboard.press('b');
  await expect(page.locator('.sm-head')).toContainText(`pregunta ${first + 2} de`);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sm-choices .choice.picked')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sm-h')).toHaveText('¿Entregas ya?');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sm-head')).toContainText('pregunta');
});

test('Hoy: con un examen a menos de un mes, «Simulacro de la semana» abre «Preparar»', async ({ page }) => {
  await setup(page);
  await nav(page, 'Hoy');
  await page.locator('#main [data-sim="prep"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Preparar simulacro');
});

/* ---------------- remates ---------------- */
// Un simulacro guardado con los números que se pidan, y su nota abierta
async function showRec(page, deckId, rec) {
  await page.evaluate(async ([deckId, rec]) => {
    const { S } = await import('/js/comun.js'); const { go } = await import('/js/app.js');
    const ids = [...S.cards.values()].map(c => c.id);
    const res = [...Array(rec.ok).fill('o'), ...Array(rec.bad).fill('x'), ...Array(rec.blank).fill('b')];
    const r = { id: 'r' + Math.random(), exam: deckId, at: Date.now(), done: Date.now(), date: '2026-10-20', name: 'Tema', settings: { pen: rec.pen }, n: res.length, min: 5, topics: [{ name: 'Tema', o: rec.ok, x: rec.bad, b: rec.blank }],
      qs: res.map((v, i) => [ids[i], '', 0, v, null]), ...rec };
    S.prefs.sims = [...(S.prefs.sims || []), r];
    go('sim', { simShow: { id: r.id, mode: 'result' } });
  }, [deckId, rec]);
  await expect(page.locator('.sm-score b')).toBeVisible();
}

test('remates: penalización solo con fallos y en blanco, netas negativas y vuelta a la nota tras repasar los fallos', async ({ page }) => {
  const deck = await setup(page);
  await showRec(page, deck, { pen: 3, ok: 6, bad: 3, blank: 3, score: 5 });
  await expect(page.locator('.sm-pen')).toHaveText('Los fallos restan ⅓: 6 − 3 ÷ 3 = 5 netas de 12. Dejaste 3 en blanco: si hubieras fallado esas, restarían 1 más.');
  // Sin fallos no hay aviso
  await showRec(page, deck, { pen: 3, ok: 6, bad: 0, blank: 3, score: 6.67 });
  await expect(page.locator('.sm-pen')).not.toContainText('Dejaste');
  // Netas negativas, nota 0: sin aviso
  await showRec(page, deck, { pen: 4, ok: 1, bad: 9, blank: 2, score: 0 });
  await expect(page.locator('.sm-pen')).toHaveText('Los fallos restan ¼: 1 − 9 ÷ 4 = −1,25 netas · la nota no baja de 0.');
  // «Repasar los fallos» y, al salir, otra vez la nota
  await page.locator('.sm-res [data-sim="fails"]').click();
  await expect(page.locator('.studybar')).toBeVisible();
  await page.locator('[data-act="exit"]').click();
  await expect(page.locator('.sm-score b')).toHaveText('0');
});

test('remates: la gráfica con notas de 0 deja todos los puntos y el objetivo dentro, separados de las fechas', async ({ page }) => {
  const deck = await setup(page);
  await showRec(page, deck, { pen: 3, ok: 0, bad: 9, blank: 3, score: 0 });
  await showRec(page, deck, { pen: 3, ok: 0, bad: 9, blank: 3, score: 0 });
  const box = await page.evaluate(() => {
    const svg = document.querySelector('.sm-chart svg'), [, , , H] = svg.getAttribute('viewBox').split(' ').map(Number);
    return { H, cy: [...svg.querySelectorAll('circle')].map(c => Number(c.getAttribute('cy'))), goal: Number(svg.querySelector('.goal').getAttribute('y1')), d: Number(svg.querySelector('.d').getAttribute('y')) };
  });
  for (const cy of box.cy) { expect(cy).toBeGreaterThan(10); expect(cy).toBeLessThan(box.d - 16); }
  expect(box.goal).toBeGreaterThan(10);
  expect(box.goal).toBeLessThan(box.d - 16);
});

test('remates: la opción elegida se rellena de blanco y «te queda menos de 1 min»', async ({ page }) => {
  await setup(page);
  await openExam(page);
  await page.locator('[data-sim="prep"]').click();
  await page.locator('[data-sim="prep-set"][data-k="time"][data-v="30"]').click();
  await page.locator('[data-sim="start"]').click();
  const first = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.sim.qs.findIndex(q => q.kind === 'choice')));
  for (let i = 0; i < first; i++) await page.locator('[data-sim="next"]').click();
  const opt = page.locator('.sm-choices .choice').first();
  await opt.click();
  await expect(opt).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await opt.locator('.ckey').evaluate(e => getComputedStyle(e).borderRadius)).toBe('50%');
  // Quedan 40 s: «te queda menos de 1 min»; 90 s: «te queda 1 min»
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { S.sim.since -= (30 * 60 - 40) * 1e3; }));
  await page.locator('.sm-clock').click();
  await expect(page.locator('.sm-note')).toContainText('Te queda menos de 1 min.');
  await page.locator('[data-sim="back"]').first().click();
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { S.sim.since += 50e3; }));
  await page.locator('.sm-clock').click();
  await expect(page.locator('.sm-note')).toContainText('Te queda 1 min.');
});
