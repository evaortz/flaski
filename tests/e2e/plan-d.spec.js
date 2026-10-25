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
