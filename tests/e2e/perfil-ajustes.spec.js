// Perfil (cabecera con el lápiz, «Tu estudio», «Flaski», cuenta y créditos en una hoja) y Ajustes (7 secciones,
// buscador con lo que se ha ido a otro sitio, «Con cuidado» en Datos)
import { test, expect, openApp, nav } from './fixtures.js';

test('Perfil: filas en su orden, nombre con el lápiz, créditos en una hoja y «Ver tus estadísticas»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await expect(page.locator('.pr-cap')).toHaveText(['Tu estudio', 'Flaski']);
  await expect(page.locator('.pr-row .pr-t b')).toHaveText(['Plan de estudio', 'Estadísticas', 'Amigos', 'Ajustes', 'Novedades', 'Ver la presentación']);
  await expect(page.locator('.pr-row', { hasText: 'Novedades' })).toContainText(/Lo nuevo de \w+ de \d{4}/);
  // Sin examen, el plan no lleva etiqueta
  await expect(page.locator('.pr-row', { hasText: 'Plan de estudio' }).locator('.pr-tag')).toHaveCount(0);
  // Ya no está el bloque «Tu nombre»: se cambia con el lápiz
  await expect(page.locator('#main #p-name')).toHaveCount(0);
  await page.locator('[data-act="edit-name"]').click();
  await page.locator('#sheetBody #p-name').fill('Eva');
  await page.locator('#sheetBody [type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('.pr-name b')).toHaveText('Eva');
  // Créditos, en una hoja
  await expect(page.locator('#main')).not.toContainText('Hanzi Writer');
  await page.locator('[data-act="credits"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Hanzi Writer');
  await page.locator('#sheetBody [data-act="close-sheet"]').click();
  await page.locator('.pr-stats').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'stats');
});

test('Perfil: con un examen por delante, el plan dice «vas bien» o «no llegas»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('[data-ex="add-builtin"][data-file="aleman-a2.json"]').click();
  await expect(page.locator('#main [data-builtin="aleman-a2.json"] .go')).toHaveText('La tienes');
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    S.prefs.plan.nodes[[...S.decks.values()][0].id] = { exam: addDays(dayKey(), 3) };
  });
  await nav(page, 'Perfil');
  await expect(page.locator('.pr-row', { hasText: 'Plan de estudio' }).locator('.pr-tag')).toHaveText('no llegas');
});

test('Ajustes: 7 secciones, «Con cuidado» en Datos y el texto de Biblioteca › Importar › Pegar', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('.pr-row', { hasText: 'Ajustes' }).click();
  await expect(page.locator('.set-toc a')).toHaveText(['Apariencia', 'Tanda', 'Avisos', 'Idioma y voz', 'Hoy', 'Repaso', 'Datos']);
  await expect(page.locator('.set-sec > h2')).toHaveText(['Apariencia', 'Tanda', 'Avisos', 'Idioma y voz', 'Hoy', 'Repaso', 'Datos']);
  // Lo que se ha movido
  await expect(page.locator('#s-session')).toContainText('Orden de las nuevas');
  await expect(page.locator('#s-session')).toContainText('Mezcla');
  await expect(page.locator('#s-session')).not.toContainText('Duración de la tanda');
  await expect(page.locator('#s-home')).toContainText('Meta diaria');
  await expect(page.locator('#s-voice')).toContainText('Tu idioma');
  await expect(page.locator('#s-algo')).toContainText('Topes de seguridad');
  await expect(page.locator('#s-algo #set-new')).toBeVisible();
  await expect(page.locator('#main')).not.toContainText('Ver las últimas novedades');
  await expect(page.locator('#main')).not.toContainText('Abrir el plan');
  await expect(page.locator('#s-data')).toContainText('Biblioteca › Importar › Pegar');
  await expect(page.locator('.set-care:not(.set-bye)')).toContainText('Reiniciar el progreso');
  await expect(page.locator('.set-care:not(.set-bye)')).toContainText('Ajustes por defecto');
  // Botón de volver a Perfil (en el móvil)
  if (page.viewportSize().width < 960) {
    await page.locator('.set-head .back-round').click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'profile');
  }
});

test('Ajustes: el buscador enseña los ajustes usables con su pestaña, lo que se ha ido y nada si no hay', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('.pr-row', { hasText: 'Ajustes' }).click();
  const find = page.locator('#setFind');
  await find.fill('tanda');
  await expect(page.locator('#setFound')).toHaveText(/^\d+ ajustes en Tanda$/);
  const rows = page.locator('.set-row:visible');
  await expect(rows.first().locator('.set-tab')).toHaveText('Tanda');
  await expect(page.locator('.set-row:visible', { hasText: 'Algoritmo' })).toHaveCount(0);   // «estándar» no casa
  await expect(page.locator('.set-row:visible mark.set-hl').first()).toBeVisible();
  // El ajuste se puede cambiar desde el resultado
  const intervals = page.locator('.set-row:visible', { hasText: 'Mostrar intervalos' }).locator('input');
  const before = await intervals.isChecked();
  await page.locator('.set-row:visible', { hasText: 'Mostrar intervalos' }).locator('.switch').click();
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.study.showIntervals))).toBe(!before);
  // Lo que se ha ido a otro sitio
  await expect(page.locator('#setMoved')).toContainText('Ya no está en Ajustes');
  await expect(page.locator('#setMoved')).toContainText('Duración de la tanda');
  // Sin tildes
  await find.fill('vibracion');
  await expect(page.locator('#setFound')).toHaveText(/1 ajuste en Tanda|Ningún ajuste/);
  await find.fill('zzzz');
  await expect(page.locator('#setFound')).toHaveText('Ningún ajuste con «zzzz»');
  await expect(page.locator('.set-row:visible')).toHaveCount(0);
  // Esc lo borra y vuelve todo
  await find.press('Escape');
  await expect(find).toHaveValue('');
  await expect(page.locator('.set-sec > h2:visible')).toHaveCount(7);
  await find.fill('duracion');
  await page.locator('#setMoved [data-nav="plan"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'plan');
});
