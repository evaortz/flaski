// Contraste: el texto pequeño de la cabecera de la tanda («pregunta N de M · repaso») pasa 4,5:1 sobre el azul
// (o el color) de la tanda con los 9 acentos, en claro y en oscuro
import { test, expect, openApp, startTanda, openDeck, newCard } from './fixtures.js';

const ACCENTS = ['cobalto', 'violeta', 'ciruela', 'frambuesa', 'teja', 'oliva', 'bosque', 'laguna', 'tinta'];

// Contraste WCAG de un elemento con su fondo (el color se pasa por un lienzo para resolver color-mix y la transparencia)
const ratio = el => {
  const rgba = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  const bg = rgba(getComputedStyle(document.body).backgroundColor), fg = rgba(getComputedStyle(el).color);
  const a = fg[3] / 255, mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [l1, l2] = [lum(mix), lum(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test('cabecera de la tanda: «pregunta N de M» con 4,5:1 o más con los 9 acentos, en claro y en oscuro @ambos', async ({ page, seed }) => {
  await seed({ builtin: ['Turco · Armonía vocálica'] });
  await openApp(page);
  await startTanda(page);
  const left = page.locator('.studybar .sb-info .left');
  await expect(left).toContainText('pregunta 1 de');
  const bad = [];
  for (const theme of ['light', 'dark']) for (const accent of ACCENTS) {
    await page.evaluate(async ([accent, theme]) => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.accent = accent; S.prefs.look.theme = theme; applyLook(S.prefs.look); }, [accent, theme]);
    const r = await left.evaluate(ratio);
    if (r < 4.5) bad.push(`${accent} (${theme}): ${r.toFixed(2)}`);
    // y el pie de atajos («Espacio: mostrar · 1-4: valorar»), en el ordenador
    const keys = page.locator('.studyfoot .keys:visible');
    if (await keys.count()) { const k = await keys.evaluate(ratio); if (k < 4.5) bad.push(`atajos ${accent} (${theme}): ${k.toFixed(2)}`); }
  }
  expect(bad).toEqual([]);
});

// Contraste con el fondo de verdad (el primero que no es transparente hacia arriba)
const ratioBg = (el, page = false) => {
  const rgba = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  let p = page ? null : el, bg = null;
  while (p && p !== document.documentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c[3] > 200 && getComputedStyle(p).backgroundColor !== 'rgba(0, 0, 0, 0)') { bg = c; break; } p = p.parentElement; }
  bg = bg || rgba(getComputedStyle(document.body).backgroundColor);
  const fg = rgba(getComputedStyle(el).color), a = fg[3] / 255, mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [l1, l2] = [lum(mix), lum(bg)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};

test('Plan, Estadísticas y Ajustes: día especial, «Normal» en las barras, «↑ N» y «Borrar mi cuenta…» con 4,5:1, en claro y en oscuro @ambos', async ({ page, seed }, info) => {
  await seed({ builtin: ['Turco · Armonía vocálica'] });
  await openApp(page);
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const d = [...S.decks.values()][0], t = dayKey();
    const { editPlan2 } = await import('/js/plan2-app.js'), p = editPlan2();
    p.time.special = [{ id: 'p1', label: 'Puente', from: addDays(t, 3), to: addDays(t, 5), minutes: 0, at: 1 }];
    p.exams.push({ id: 'ex-d', name: 'Turco', scope: { folders: [], decks: [d.id], pages: [] }, date: addDays(t, 40), lastWeek: true, after: null });
    // Respuestas de hace unas semanas para que «Tu progreso» tenga «↑ N»
    const now = Date.now(), ids = [...S.cards.keys()];
    const ev = (id, days, ivl) => ({ card_id: id, deck_id: d.id, t: now - days * 864e5, ts: new Date(now - days * 864e5).toISOString(), grade: 3, state: 'review', ivl, last_ivl: 0, ease: 2.5, ms: 9000 });
    S.events = ids.slice(0, 8).flatMap(id => [ev(id, 60, 1), ev(id, 20, 30)]);
    ids.slice(0, 8).forEach(id => S.progress.set(id, { reps: 4, interval: 30, ease: 2.5, lapses: 0, due: now + 20 * 864e5, last: now - 864e5, first_seen: now - 30 * 864e5 }));
  });
  const bad = [];
  // onPage: el texto se ve sobre la página aunque en el DOM vaya dentro de otro (la etiqueta bajo la barrita)
  const check = async (sel, name, onPage = false) => {
    for (const el of await page.locator(sel).all()) {
      if (!(await el.isVisible())) continue;
      const r = await el.evaluate(ratioBg, onPage);
      if (r < 4.5) bad.push(`${name}: ${r}`);
    }
  };
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async th => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.theme = th; applyLook(S.prefs.look); }, theme);
    await page.evaluate(() => import('/js/app.js').then(({ go }) => go('plan')));
    await expect(page.getByRole('heading', { level: 1, name: 'Plan', exact: true })).toBeVisible();
    await check('.p2-pill', `veredicto del examen (${theme})`);
    await check('.p2-day small, .p2-day b, .p2-wnote b', `la semana (${theme})`);
    await page.evaluate(() => import('/js/app.js').then(({ go }) => go('planTime')));
    await expect(page.getByRole('heading', { level: 1, name: 'Tu tiempo' })).toBeVisible();
    await check('.p2-sp b, .p2-sp small', `día especial (${theme})`);
    await page.evaluate(() => import('/js/app.js').then(({ go }) => go('stats')));
    await expect(page.locator('#main .lv-up').first()).toBeVisible();
    await check('#main .lv-up, #main .lv-dn', `↑ en Estadísticas (${theme})`);
    await page.evaluate(() => import('/js/app.js').then(({ go }) => go('settings')));
    await check('[data-nav="bye"]', `Borrar mi cuenta (${theme})`);
  }
  expect(bad).toEqual([]);
});

// «Normal» elegido en «Cuánto de cada cosa» de una etapa (.lvb-normal): 4,5:1 con los 9 colores, en claro y en oscuro
test('«Normal» elegido en «Cuánto de cada cosa»: 4,5:1 con los 9 colores, en claro y en oscuro', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { document.querySelector('#main').insertAdjacentHTML('beforeend', '<div class="seg lv-seg" id="lvTest"><button type="button" class="seg-b lvb-normal" aria-pressed="true">Normal</button></div>'); });
  const btn = page.locator('#lvTest .lvb-normal');
  const bad = [];
  for (const theme of ['light', 'dark']) for (const accent of ACCENTS) {
    await page.evaluate(async ([accent, theme]) => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.accent = accent; S.prefs.look.theme = theme; applyLook(S.prefs.look); }, [accent, theme]);
    const r = await btn.evaluate(ratioBg);
    if (r < 4.5) bad.push(`${accent} (${theme}): ${r}`);
  }
  expect(bad).toEqual([]);
});

// «Rellena los campos…» de la vista previa de una pregunta nueva: 4,5:1 con los 9 colores, en claro y en oscuro
test('vista previa del editor vacía («Rellena los campos…»): 4,5:1 con los 9 colores, en claro y en oscuro', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Historia' }] });
  await openApp(page);
  await openDeck(page, 'Historia');
  await newCard(page);
  const empty = page.locator('.pv-empty:visible').first();
  await expect(empty).toBeVisible();
  const bad = [];
  for (const theme of ['light', 'dark']) for (const accent of ACCENTS) {
    await page.evaluate(async ([accent, theme]) => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.accent = accent; S.prefs.look.theme = theme; applyLook(S.prefs.look); }, [accent, theme]);
    const r = await empty.evaluate(ratioBg);
    if (r < 4.5) bad.push(`${accent} (${theme}): ${r}`);
  }
  expect(bad).toEqual([]);
});
