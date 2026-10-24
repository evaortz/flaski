// «Tu actividad» en Hoy: 6 meses, colores del diseño (día sin estudio en blanco con borde, hoy con anillo) y la meta
import { test, expect, openApp, nav, addBuiltinDeck, answer } from './fixtures.js';

test('tu actividad: los últimos 6 meses con los colores del diseño y la meta diaria', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await page.locator('#main [data-start]').click();
  for (let i = 0; i < 3; i++) await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Hoy');
  const act = page.locator('section[aria-labelledby="h-act"]');
  await expect(act.locator('.hoy-note')).toHaveText('últimos 6 meses');
  await expect(act.locator('.hoy-week')).toHaveText('esta semana: 1 día · 3 preguntas');
  await expect(act.locator('.hoy-streak')).toContainText('Racha de 1 día');
  await expect(act.locator('.hoy-streak .st-freeze')).toContainText('Comodín de la semana disponible');
  await expect(act.locator('.hoy-hm-foot')).toContainText('Sin meta diaria · poner una');
  expect(await page.locator('#hmHost rect.hm:not(.is-out)').count()).toBeLessThanOrEqual(26 * 7);
  // Hoy: estudiado (relleno sin borde de la escala) y con el anillo cobalto
  const today = page.locator('#hmHost rect.hm-today');
  const st = el => { const c = getComputedStyle(el); return { fill: c.fill, stroke: c.stroke, w: c.strokeWidth }; };
  expect(await today.evaluate(st)).toEqual({ fill: 'rgb(85, 96, 194)', stroke: 'rgb(47, 61, 181)', w: '1.5px' });
  // Un día sin estudio: blanco con borde
  expect(await page.locator('#hmHost rect.hm.l0:not(.is-out)').first().evaluate(st)).toEqual({ fill: 'rgb(255, 255, 255)', stroke: 'rgb(213, 215, 238)', w: '1px' });
  // Sin meta: se ofrece ponerla; con meta, el día que se llega lleva un punto
  await expect(act.locator('.hoy-hm-foot')).toContainText('Sin meta diaria');
  await expect(page.locator('#hmHost .hm-dot')).toHaveCount(0);
  await act.locator('[data-act="goal-change"]').click();
  const goal = page.locator('input[data-pref="home.goal"]');
  await goal.fill('3');
  await goal.blur();
  await nav(page, 'Hoy');
  await expect(act.locator('.hoy-hm-foot')).toContainText('Meta: 3 al día · cambiar');
  await expect(page.locator('#hmHost .hm-dot')).toHaveCount(1);
  await expect(page.locator('#hmHost rect.hm-today')).toHaveClass(/hm-goal/);
});

test.describe('en el móvil de 375 px', () => {
  test.use({ viewport: { width: 375, height: 760 } });
  test('«Cómo va lo que sabes» va antes de «Tu actividad» y ninguna etiqueta del gráfico se sale', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'solo en el móvil');
    const { mockCloud, openCloud, UID } = await import('./nube.js');
    const srv = await mockCloud(page);
    // Muchas preguntas, para que los números sean largos: 999 (la simulación no pagina), de ellas 700 consolidadas y 200 jóvenes
    const deck = srv.tables.decks[0].id, day = 864e5, now = Date.now();
    const cards = Array.from({ length: 999 }, (_, i) => ({ id: `c${String(i).padStart(7, '0')}-0000-4000-8000-000000000001`, deck_id: deck, owner: UID, front: `p${i}`, back: `r${i}`, note: '', position: i, note_id: `n${i}`, type_id: 'basic', template: 't1', fields: { q: `p${i}`, a: `r${i}` }, hint: '', tags: [] }));
    srv.tables.cards = cards;
    srv.tables.progress = cards.slice(0, 900).map((c, i) => ({ user_id: UID, card_id: c.id, reps: 5, interval: i < 700 ? 40 : 5, ease: 2.5, lapses: 0,
      due: new Date(now + 10 * day).toISOString(), first_seen: new Date(now - 60 * day).toISOString(), last: new Date(now - day).toISOString() }));
    await openCloud(page);
    const pg = page.locator('#pgHost'), act = page.locator('.hoy-act');
    await expect(pg.locator('.pg-svg')).toBeVisible();
    expect((await pg.boundingBox()).y).toBeLessThan((await act.boundingBox()).y);
    await expect(pg.locator('.pg-lab')).toHaveCount(3);
    const out = await pg.evaluate(host => {
      const svg = host.querySelector('.pg-svg'), r = svg.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      return [...svg.querySelectorAll('text')].map(t => [t.textContent, t.getBoundingClientRect()])
        .filter(([, b]) => b.right > Math.min(r.right, vw) + 0.5 || b.left < -0.5).map(([s]) => s);
    });
    expect(out).toEqual([]);
    if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT });
  });
});
