// Plan de estudio (paso D): «Para llegar» con las tres opciones del motor, después del examen, Ajustes del plan…
import { test, expect, openApp, nav } from './fixtures.js';
import { readFileSync } from 'node:fs';

const D945 = readFileSync(new URL('../fixtures/oposicion-945.json', import.meta.url), 'utf8');
// Las 945 preguntas el lunes 26 oct; change(plan) cambia su plan antes de abrir (ya migrado)
async function open945(page, change, time = '2026-10-26T10:00:00') {
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript(d => { if (!sessionStorage.getItem('d945')) { sessionStorage.setItem('d945', '1'); localStorage.setItem('flaski-local-v1', d); } }, D945);
  await openApp(page);
  if (change) {
    await page.evaluate(async src => {
      const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js');
      new Function('p', src)(editPlan2());
      await api.saveSettings(S.uid, S.newPerDay, S.prefs);
    }, `(${change})(p)`);
    await page.reload();
    await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  }
}
const toPlan = async page => { await nav(page, 'Perfil'); await page.locator('#main [data-nav="plan"]').click(); await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible(); };

test('no llegas (Auxiliar a 26 días): «Para llegar» con las tres opciones del motor, cada una con su resultado; aplicar y deshacer', async ({ page }) => {
  await open945(page, p => { p.exams[0].date = '2026-11-21'; });
  await toPlan(page);
  await expect(page.locator('#main .p2-vt')).toHaveText('Así no llegas a Auxiliar');
  await expect(page.locator('#main .p2-verdict')).toContainText(/te quedarían \d+ de 425 preguntas sin ver/);
  const fixes = page.locator('#p2Fixes .p2-fix');
  await expect(fixes).toHaveCount(3);
  await expect(fixes.nth(0)).toContainText(/Subir a \d+ nuevas al día/);
  for (const f of await fixes.all()) await expect(f.locator('.p2-tag')).toHaveText(/^Llegas( justo)?: acabas el \d+ nov$/);
  // Elegir la segunda y aplicarla; se puede deshacer
  await fixes.nth(1).click();
  await expect(page.locator('#p2Fixes [data-p2="fix-apply"]')).toHaveText('Aplicar la segunda');
  const tag = await fixes.nth(1).locator('.p2-tag').textContent();
  await page.locator('#p2Fixes [data-p2="fix-apply"]').click();
  await expect(page.locator('#main .p2-vt')).toHaveText(/^Llegas/);
  await expect(page.locator('#main .p2-verdict')).toContainText(`Acabas el temario de Auxiliar el ${tag.split('acabas el ')[1]}`);
  await expect(page.locator('#toast')).toContainText('Arreglo para llegar');
  await page.locator('#toast .ta-btn').click();
  await expect(page.locator('#main .p2-vt')).toHaveText('Así no llegas a Auxiliar');
});

test('si ningún arreglo llega, propone qué temas dejar para después del examen', async ({ page }) => {
  await open945(page, p => { p.exams[0].date = '2026-11-02'; p.exams[0].lastWeek = false; });
  await toPlan(page);
  await expect(page.locator('#main .p2-vt')).toHaveText('Así no llegas a Auxiliar');
  await expect(page.locator('#p2Fixes')).toContainText('para después del examen');
  await expect(page.locator('#p2Fixes .p2-fix')).toHaveCount(0);
  await page.locator('#p2Fixes [data-p2="drop-apply"]').click();
  const p = await page.evaluate(() => import('/js/plan2-app.js').then(m => m.plan2()));
  expect(p.exams[0].later.length).toBeGreaterThan(0);
  await expect(page.locator('#toast')).toContainText('Temas para después del examen');
});

test('después del examen: una pregunta (pausar, archivar, mantener u otra convocatoria); mientras, solo repasos', async ({ page, seed }) => {
  await seed({ folders: ['Opo'], decks: [{ name: 'T1', folder: 'Opo', cards: Array.from({ length: 20 }, (_, i) => [`q${i}`, `a${i}`]) }, { name: 'T2', folder: 'Opo', cards: [['x', 'y']], studied: { due: 0, interval: 5 } }] });
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const f = [...S.folders.values()][0].id, p = editPlan2();
    p.time.week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
    p.exams.push({ id: 'ex-opo', name: 'Opo', scope: { folders: [f], decks: [], pages: [] }, date: addDays(dayKey(), -1), lastWeek: false, after: null });
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  // Hoy pregunta; mientras tanto, solo el repaso
  const q = page.locator('#main .p2-after');
  await expect(q).toContainText('El examen de Opo ya pasó');
  await expect(q.locator('[data-p2="after-set"]')).toHaveText([/Pausarlo/, /Archivarlo/, /Mantenerlo con repasos/, /Preparar otra convocatoria/]);
  await expect(page.locator('#main .p2-legend')).toHaveText('1 repaso');
  // El Plan pregunta lo mismo
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#main .p2-after')).toContainText('El examen de Opo ya pasó');
  // «Pausarlo»: ya no sale nada suyo, ni la pregunta
  await page.locator('#main [data-p2="after-set"][data-v="pause"]').click();
  await expect(page.locator('#main .p2-after')).toHaveCount(0);
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-after')).toHaveCount(0);
  await expect(page.locator('#main .p2-tanda')).toHaveCount(0);
  // Deshacer y «Preparar otra convocatoria»: lo que queda vuelve a entrar y se pide la fecha nueva
  await page.evaluate(async () => { const { plan2 } = await import('/js/plan2-app.js'); const { undoTo } = await import('/js/pantallas/plan-guardar.js'); undoTo(plan2().history[0].at); });
  await page.locator('#main [data-p2="after-set"][data-v="next"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Cambiar el examen');
  await page.keyboard.press('Escape');
  await expect(page.locator('#main .p2-legend span').first()).toHaveText(/nuevas? de T1/);
});

test('Ajustes del plan: tope de repasos, lo que quieres recordar (90 o 95 %, y la última semana) y el Repaso de la semana', async ({ page }) => {
  await open945(page);
  await toPlan(page);
  await page.locator('#main [data-nav="planSettings"]').last().click();
  await expect(page.getByRole('heading', { name: 'Ajustes del plan' })).toBeVisible();
  const plan = () => page.evaluate(() => import('/js/plan2-app.js').then(m => m.plan2()));
  // Tope de repasos
  await page.locator('#main [data-p2="set-revcap"]').click();
  await page.locator('#p2revc').fill('60');
  await page.locator('#sheetBody [data-p2="revcap-save"]').click();
  await expect(page.locator('#p2revcap')).toContainText('60');
  expect((await plan()).caps.reviewsPerDay).toBe(60);
  // Hoy: como mucho 60 repasos, aunque toquen más (100 el lunes)
  const fit = await page.evaluate(() => import('/js/plan2-app.js').then(m => m.forecastNow().days[0].reviews));
  expect(fit).toBe(60);
  // El 95 % el día del examen; la última semana ya iba al 95 %
  await expect(page.locator('#main [data-p2="set-retlast"]')).toBeChecked();
  await page.locator('#main [data-p2="set-ret"][data-v="0.95"]').click();
  expect((await plan()).exams.map(e => e.retention)).toEqual([0.95, 0.95]);
  expect(await page.evaluate(() => import('/js/plan2-app.js').then(m => m.forecastNow().retention))).toBe(0.95);
  // La última semana como las demás
  await page.locator('#main [data-p2="set-ret"][data-v="0.9"]').click();
  await page.locator('#main [data-p2="set-retlast"]').uncheck();
  expect((await plan()).exams.map(e => e.retentionLast)).toEqual([0.9, 0.9]);
  // Avisos: el Repaso de la semana se apaga
  await page.locator('#main [data-p2="set-weekly"]').uncheck();
  expect((await plan()).weekly.on).toBe(false);
  await expect(page.locator('#main #remindOn')).toBeVisible();
});

// Una oposición con un tema de 12 preguntas sin ver y su examen
async function opoT5(page, seed) {
  await seed({ folders: ['Opo'], decks: [{ name: 'T1 · Constitución', folder: 'Opo', cards: Array.from({ length: 20 }, (_, i) => [`c${i}`, `r${i}`]) }, { name: 'T5 · Ley 39/2015', folder: 'Opo', cards: Array.from({ length: 12 }, (_, i) => [`ley${i}`, `art${i}`]) }] });
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const p = editPlan2();
    p.time.week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
    p.exams.push({ id: 'ex-opo', name: 'Opo', scope: { folders: [[...S.folders.values()][0].id], decks: [], pages: [] }, date: addDays(dayKey(), 60), lastWeek: true, after: null });
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main .p2-step', { hasText: 'T5 · Ley 39/2015' }).locator('[data-p2="topic"]').click();
}
const noWords = async page => { const t = (await page.locator('#main').textContent()).toLowerCase(); expect(t).not.toContain('simulacro'); expect(t).not.toContain('prueba'); };
// Las 10 preguntas (de dar la vuelta): pensarlas, entregar y decir cuántas sabías
async function answerCheck(page, yes) {
  for (let i = 0; i < 10; i++) {
    await page.locator('[data-sim="think"]').click();
    await page.locator(i < 9 ? '[data-sim="next"]' : '.sm-next[data-sim="review"]').click();
  }
  await noWords(page);
  await page.locator('[data-sim="submit"]').click();
  for (let i = 0; i < 10; i++) await page.locator(`[data-sim="self"][data-i="${i}"][data-v="${i < yes ? 'yes' : 'no'}"]`).click();
  await page.locator('[data-sim="finish"]').click();
}
const progressOf = page => page.evaluate(async () => { const { S } = await import('/js/comun.js'); const d = [...S.decks.values()].find(x => x.name.startsWith('T5')).id; const cs = [...S.cards.values()].filter(c => c.deck_id === d); return { seen: cs.filter(c => S.progress.has(c.id)).length, fresh: cs.filter(c => !S.progress.has(c.id)).length }; });

test('Ya me lo sé · Comprobar con 9 de 10: el tema pasa a repaso y la fallada entra como nueva («Así queda el plan» antes)', async ({ page, seed }) => {
  await opoT5(page, seed);
  await page.locator('#sheetBody [data-p2="topic-yalose"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Ya me lo sé');
  await page.locator('#sheetBody [data-p2="check-go"]').click();
  await expect(page.locator('.sm-ht b')).toHaveText('Comprobar · T5 · Ley 39/2015');
  await expect(page.locator('.sm-ht small')).toHaveText('pregunta 1 de 10');
  await noWords(page);
  await answerCheck(page, 9);
  await expect(page.locator('.p2-check-res b')).toHaveText('9 de 10');
  await expect(page.locator('.p2-check-res h1')).toHaveText('Te lo sabes');
  await expect(page.locator('.p2-check-res p')).toContainText('La que has fallado entra como nueva');
  await expect(page.locator('.p2-check .p2-asi')).toContainText('Así queda el plan');
  await noWords(page);
  // Antes de seguir no ha cambiado nada
  expect(await progressOf(page)).toEqual({ seen: 0, fresh: 12 });
  await page.locator('[data-sim="check-ok"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Opo' })).toBeVisible();
  // 9 acertadas, vistas; 2 que no salieron, como repasos; 1 fallada, nueva
  expect(await progressOf(page)).toEqual({ seen: 11, fresh: 1 });
});

test('Ya me lo sé · Comprobar con 5 de 10: el tema sigue en el plan y las acertadas cuentan como vistas', async ({ page, seed }) => {
  await opoT5(page, seed);
  await page.locator('#sheetBody [data-p2="topic-yalose"]').click();
  await page.locator('#sheetBody [data-p2="check-go"]').click();
  await answerCheck(page, 5);
  await expect(page.locator('.p2-check-res b')).toHaveText('5 de 10');
  await expect(page.locator('.p2-check-res h1')).toHaveText('Aún no del todo');
  await page.locator('[data-sim="check-ok"]').click();
  expect(await progressOf(page)).toEqual({ seen: 5, fresh: 7 });
});

test('Refuerza este tema: 7 días con más repasos de lo que te cuesta; Hoy y la tanda dicen lo mismo', async ({ page, seed }) => {
  await seed({ folders: ['Opo'], decks: [{ name: 'T1 · Constitución', folder: 'Opo', cards: Array.from({ length: 10 }, (_, i) => [`c${i}`, `r${i}`]), studied: { due: 3, interval: 3 } }] });
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const p = editPlan2();
    p.time.week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
    p.exams.push({ id: 'ex-opo', name: 'Opo', scope: { folders: [[...S.folders.values()][0].id], decks: [], pages: [] }, date: addDays(dayKey(), 60), lastWeek: true, after: null });
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  // Hoy no toca nada
  await expect(page.locator('#main .hero-done')).toContainText('estás al día');
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main .p2-step', { hasText: 'T1 · Constitución' }).locator('[data-p2="topic"]').click();
  await page.locator('#sheetBody [data-p2="topic-boost"]').click();
  await expect(page.locator('#toast')).toContainText('Refuerzas T1 hasta el');
  // Hoy: la mitad de las que te cuestan, y la tanda las saca
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-legend')).toHaveText('5 repasos');
  await page.locator('#main .p2-go').click();
  const go = page.locator('#sheetBody [data-act="tanda-go"]');
  if (await go.isVisible().catch(() => false)) await go.click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 5 · repaso');
  for (let i = 0; i < 5; i++) { await page.locator('[data-act="reveal"]').click(); await page.locator('[data-grade="3"]').click(); }
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-legend')).toHaveCount(0);
  // La hoja del tema lo dice, y se puede quitar
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main .p2-step', { hasText: 'T1 · Constitución' }).locator('[data-p2="topic"]').click();
  await expect(page.locator('#sheetBody [data-p2="topic-boost-off"]')).toContainText('Reforzando hasta el');
});
