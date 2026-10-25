// Remates del repaso del 25 oct (docs/rediseno/REPASO-25oct.md): maquetación, Novedades y accesibilidad
import { test, expect, openApp, nav } from './fixtures.js';

const box = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: r.top + r.height / 2 }; });

test('Biblioteca en el móvil: 16 px entre el título y los botones, y el «+» centrado con el título', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  const [head, quick, h1, plus] = await Promise.all(['.lib-head', '.lib-quick', '.lib-head h1', '.lib-head .add-round'].map(s => box(page, s)));
  expect(Math.round(quick.top - head.bottom)).toBe(16);
  // El «+» con su sombra (4 px) queda centrado con la letra del título, que llena la parte alta de su caja
  expect(Math.abs(plus.mid + 2 - (h1.mid - 3))).toBeLessThanOrEqual(3);
});

test('apunte: la insignia de preguntas no toca el texto y «Estudiar N» del apartado es un botón separado de ella @ambos', async ({ page, seed }) => {
  const long = 'La Constitución se aprobó en referéndum el 6 de diciembre y se publicó en el BOE el 29 de diciembre de 1978, el 31 de octubre';
  await seed({ decks: [{ name: 'Const' }], pages: [{ md: `# Constitución\n\n## Aprobación\n\n${long}`, deck: 'Const' }] });
  await openApp(page);
  // Dos preguntas unidas al párrafo (insignia en el párrafo y «Estudiar 2» en el apartado)
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const p = [...S.pages.values()][0], b = p.blocks.find(x => x.type === 'p'), d = [...S.decks.values()][0];
    for (const c of await api.createCards(['a', 'b'].map(q => ({ deck_id: d.id, owner: S.uid, front: q, back: 'r', type_id: 'basic', template: 't1', fields: { q, a: 'r' }, page_id: p.id, block_id: b.id })))) S.cards.set(c.id, c);
  });
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-page]').filter({ hasText: 'Constitución' }).click();
  const para = page.locator('#pgBlocks .nb-p').filter({ has: page.locator('.nb-cards') });
  const [text, badge] = await Promise.all([box(page, '#pgBlocks .nb-p:has(.nb-cards) .nb-text'), box(page, '#pgBlocks .nb-p .nb-cards')]);
  expect(text.right).toBeLessThanOrEqual(badge.left - 6);
  await expect(para.locator('.nb-cards')).toBeVisible();
  const sec = page.locator('#pgBlocks .nb-sec');
  await expect(sec).toHaveText('Estudiar 2');
  // Botón secundario: con borde, fondo de la página y texto normal (no gris de desactivado)
  const [border, color, fg] = await sec.evaluate(el => [getComputedStyle(el).borderTopWidth, getComputedStyle(el).color, getComputedStyle(document.body).color]);
  expect(border).toBe('1px');
  expect(color).toBe(fg);
  // Y lejos de la insignia del título, si la tiene, y del texto del título
  const [h, s] = await Promise.all([box(page, '#pgBlocks .nb-h2 .nb-text'), box(page, '#pgBlocks .nb-sec')]);
  expect(h.right).toBeLessThanOrEqual(s.left);
});

test('Estadísticas: el botón atrás y el título en la misma fila, como en Ajustes y el Plan @ambos', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('#main .pr-stats').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Estadísticas' })).toBeVisible();
  const [back, h1] = await Promise.all([box(page, '#main .back-round'), box(page, '#main .st-head h1')]);
  expect(back.right).toBeLessThan(h1.left);
  expect(Math.abs(back.mid - h1.mid)).toBeLessThanOrEqual(6);
});


// Contraste WCAG de un texto con el fondo que tiene detrás (el primero no transparente subiendo por sus padres)
const contrast = el => {
  const rgba = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  let p = el, bg = null;
  while (p && !bg) { const c = rgba(getComputedStyle(p).backgroundColor); if (c[3] > 200) bg = c; p = p.parentElement; }
  bg ||= rgba(getComputedStyle(document.body).backgroundColor);
  const fg = rgba(getComputedStyle(el).color), a = (fg[3] / 255) * Number(getComputedStyle(el).opacity), mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [l1, l2] = [lum(mix), lum(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const theme = (page, t) => page.evaluate(async t => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.theme = t; applyLook(S.prefs.look); }, t);

test('accesibilidad: nombres con rol (gráfico de Hoy, barra de carpeta, barra de la tanda) y el mapa de calor con el teclado', async ({ page, seed }) => {
  await seed({ folders: ['Opo'], decks: [{ name: 'Tema 1', folder: 'Opo', cards: [['a', '1'], ['b', '2'], ['c', '3']], studied: { due: 1, interval: 30 } }], builtin: ['Alemán · A2'] });
  await openApp(page);
  await expect(page.locator('.pg-hit')).toHaveAttribute('role', 'img');
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').filter({ hasText: 'Opo' }).first().click();
  await expect(page.locator('.lbar')).toHaveAttribute('role', 'img');
  await nav(page, 'Hoy');
  await page.locator('#main :is(.hero-go, .p2-go)').click();
  const go = page.locator('#sheetBody [data-act="tanda-go"]');
  if (await go.isVisible().catch(() => false)) await go.click();
  await expect(page.locator('.bar').first()).toHaveAttribute('role', 'progressbar');
  await expect(page.locator('.bar').first()).toHaveAttribute('aria-label', 'Progreso de la tanda');
  // La etiqueta del reverso, 4,5:1 en claro y en oscuro
  await page.locator('[data-act="reveal"]').click();
  const label = page.locator('.fld-l:visible').first();
  await expect(label).toBeVisible();
  for (const t of ['light', 'dark']) { await theme(page, t); expect(await label.evaluate(contrast), `reverso (${t})`).toBeGreaterThanOrEqual(4.5); }
  await theme(page, 'light');
  await page.locator('[data-grade="3"]').click();   // una respuesta: Estadísticas ya tiene días estudiados
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Perfil');
  await page.locator('#main .pr-stats').click();
  await expect(page.locator('.hm-scroll').first()).toHaveAttribute('tabindex', '0');
  await page.locator('.hm-scroll').first().focus();
  await expect(page.locator('.hm-scroll').first()).toBeFocused();
});

test('contraste: los números pequeños del mapa y el título rojo de «Con cuidado» en oscuro', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Const' }], pages: [{ md: '# Constitución\n\nEl 6 de diciembre de 1978.\n\nSe publicó el 29 de diciembre.', deck: 'Const' }] });
  await openApp(page);
  // Dos preguntas en cada párrafo: casillas con el número pequeño de preguntas
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const p = [...S.pages.values()][0], d = [...S.decks.values()][0];
    for (const b of p.blocks.filter(x => x.type === 'p')) for (const c of await api.createCards(['a', 'b'].map(q => ({ deck_id: d.id, owner: S.uid, front: q + b.id, back: 'r', type_id: 'basic', template: 't1', fields: { q: q + b.id, a: 'r' }, page_id: p.id, block_id: b.id })))) S.cards.set(c.id, c);
  });
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-page]').filter({ hasText: 'Constitución' }).click();
  await page.locator('#main .mp-seg .seg-b', { hasText: 'Mapa' }).click();
  const small = page.locator('.mp-cell small').first();
  await expect(small).toBeVisible();
  for (const t of ['light', 'dark']) { await theme(page, t); expect(await small.evaluate(contrast), `mapa (${t})`).toBeGreaterThanOrEqual(4.5); }
  await theme(page, 'dark');
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="settings"]').first().click();
  expect(await page.locator('.set-care h3').evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
});

