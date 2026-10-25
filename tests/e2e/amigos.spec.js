// Amigos (modo con cuentas): invitar, aceptar, ver cómo van, animar y la clasificación de la semana
import { test, expect, nav } from './fixtures.js';
import { mockCloud, openCloud, sent } from './nube.js';

const ANA = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Ana', since: '2026-09-01T10:00:00Z', shared: true, streak: 5, today: 12, week: [20, 15, 0, 12, 0, 0, 0], langs: ['de', 'ja'] };
const CARLOS = { id: 'c0000000-0000-4000-8000-000000000003', name: 'Carlos', since: '2026-09-02T10:00:00Z', shared: false, streak: 0, today: 0, week: [], langs: [] };
const BEA = { id: 'r0000000-0000-4000-8000-000000000001', other: 'b0000000-0000-4000-8000-000000000002', name: 'Bea', dir: 'in', created_at: '2026-10-01T10:00:00Z' };
const rpcs = (srv, fn) => sent(srv, fn).map(w => w[2]);

test('amigos: esta semana, te han animado, invitar con tu código, aceptar, animar, añadir con un código y quitar @ambos', async ({ page }) => {
  const srv = await mockCloud(page);
  const DORA = { ...ANA, id: 'd0000000-0000-4000-8000-000000000004', name: 'Dora', streak: 2, today: 0, week: [30, 0, 0, 0, 0, 0, 0], since: new Date(Date.now() - 3 * 864e5).toISOString() };
  const ago = h => new Date(Date.now() - h * 36e5).toISOString();
  Object.assign(srv.social, { friends: [ANA, CARLOS, DORA], requests: [BEA], cheers: [{ id: 'h1', name: 'Ana', kind: 'go', created_at: ago(2) }],
    recent: [{ id: 'h1', name: 'Ana', kind: 'go', created_at: ago(2) }, { id: 'h0', name: 'Carlos', kind: 'bravo', created_at: ago(30) }] });
  await openCloud(page);
  await nav(page, 'Perfil');
  await expect(page.locator('#frBadge')).toHaveText('1 ánimo');
  await expect(page.locator('.pr-row', { hasText: 'Amigos' })).toContainText('Ana, Carlos y 1 más');
  await page.locator('.pr-row[data-nav="friends"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Amigos' })).toBeVisible();
  await expect(page.locator('.fr-h')).toContainText(['Te quieren añadir', 'Esta semana', 'Te han animado', 'Invita a alguien']);
  await expect(page.locator('.fr-sub')).toContainText(/se reinicia el lunes \d+/);
  // Esta semana: la clasificación entera, con quien no comparte al final
  const rows = page.locator('.fr-weeksec .frow');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('Ana · 47 preguntas');
  await expect(rows.nth(0).locator('.frow-hoy')).toHaveText('¡Bravo!');   // Ana ya ha estudiado hoy
  await expect(rows.nth(1)).toContainText('Dora · 30 preguntas');
  await expect(rows.nth(2)).toHaveClass(/me/);
  await expect(rows.nth(3).locator('.frow-st')).toHaveText('—');
  // «¡Bravo!» a Ana: el ánimo de tipo «bravo», y pasa a «enviado»
  await rows.nth(0).getByRole('button', { name: 'Decir «¡Bravo!» a Ana' }).click();
  await expect(rows.nth(0).locator('.frow-hoy')).toHaveText('enviado');
  // Te han animado: «Ana te dice: «¡Tú puedes!»» y quien se ha hecho amigo esta semana
  await expect(page.locator('.fr-news li').first()).toContainText('Ana te dice: «¡Tú puedes!»');
  await expect(page.locator('.fr-news li').first()).toContainText('hace 2 h');
  await expect(page.locator('.fr-news')).toContainText('Dora y tú ya sois amigos');
  await expect(page.locator('.fr-news')).toContainText('Carlos te dice: «¡Bravo!»');   // ya visto, pero de esta semana
  await expect(page.locator('.fr-news')).not.toContainText('te ha animado');
  // Tu código
  await expect(page.locator('#frMyCode')).toHaveText('EVA7-K2QX');
  await expect(page.locator('.fr-code small')).toHaveText('3 amigos');

  // Petición de Bea
  srv.social.requests = [];
  srv.social.friends = [ANA, CARLOS, DORA, { ...ANA, id: BEA.other, name: 'Bea', streak: 1, today: 0, week: [3, 0, 0, 0, 0, 0, 0] }];
  await page.locator(`[data-fr-accept="${BEA.id}"]`).click();
  await expect(page.locator('.fr-weeksec .frow', { hasText: 'Bea' })).toBeVisible();
  expect(rpcs(srv, 'respond_friend')).toEqual([{ p_id: BEA.id, p_accept: true }]);

  // Animar a Dora, que aún no ha estudiado: una vez al día
  await page.getByRole('button', { name: 'Animar a Dora' }).click();
  await expect(page.locator('.fr-weeksec .frow', { hasText: 'Dora' }).locator('.frow-hoy')).toHaveText('enviado');
  expect(rpcs(srv, 'send_cheer')).toEqual([{ p_to: ANA.id, p_kind: 'bravo' }, { p_to: DORA.id, p_kind: 'clap' }]);

  // Añadir con un código, escrito de cualquier manera
  await page.locator('#frCode').fill('abcd 1234');
  await page.locator('#frCode').press('Enter');
  await expect(page.locator('#toast')).toContainText('Petición enviada');
  expect(rpcs(srv, 'request_friend')).toEqual([{ p_code: 'ABCD1234' }]);
  await page.locator('#frCode').fill('abc');
  await page.locator('#frCode').press('Enter');
  await expect(page.locator('#toast')).toContainText('8 letras o números');

  // Dejar de compartir la actividad
  await page.locator('#frShare').evaluate(el => el.scrollIntoView());
  await page.locator('#frShare').locator('xpath=..').click();
  await expect.poll(() => rpcs(srv, 'set_share')).toEqual([{ p_share: false }]);

  // Quitar a Carlos (su nombre abre sus opciones)
  await page.locator(`[data-friend-menu="${CARLOS.id}"]`).click();
  await page.locator(`[data-fr-remove="${CARLOS.id}"]`).click();
  await expect.poll(() => rpcs(srv, 'remove_friend')).toEqual([{ p_other: CARLOS.id }]);
});

test('Hoy: «Tus amigos» con el último ánimo recibido y la clasificación de la semana', async ({ page }) => {
  const srv = await mockCloud(page);
  const DORA = { ...ANA, id: 'd0000000-0000-4000-8000-000000000004', name: 'Dora', streak: 2, today: 0, week: [30, 0, 0, 0, 0, 0, 0] };
  Object.assign(srv.social, { friends: [ANA, CARLOS, DORA], cheers: [{ id: 'h1', name: 'Ana', kind: 'go', created_at: new Date(Date.now() - 2 * 36e5).toISOString() }] });
  await openCloud(page);
  const fr = page.locator('#homeFriends');
  await expect(fr.locator('.hoy-t')).toHaveText('Tus amigos');
  await expect(fr.locator('.hoy-cheer')).toContainText('Ana te dice: «¡Tú puedes!»');
  // Una fila por persona: por preguntas de la semana; quien no comparte su actividad, al final, sin puesto ni racha
  const rows = fr.locator('.frow');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('Ana · 47 preguntas');
  await expect(rows.nth(0).locator('.frow-pos')).toHaveText('1');
  await expect(rows.nth(0).locator('.frow-week i')).toHaveCount(7);
  await expect(rows.nth(0).locator('.frow-st')).toHaveText('5');
  await expect(rows.nth(0).locator('.frow-hoy')).toHaveText('¡Bravo!');
  await expect(rows.nth(1)).toContainText('Dora · 30 preguntas');
  await expect(rows.nth(2)).toHaveClass(/me/);
  await expect(rows.nth(2)).toContainText('Tú · 0 preguntas');
  await expect(rows.nth(2).locator('.frow-pos')).toHaveText('3');
  await expect(rows.nth(2).locator('.frow-hoy')).toHaveText('¡Te toca!');
  await expect(rows.nth(3)).toContainText('Carlos');
  await expect(rows.nth(3).locator('.frow-pos')).toHaveText('');
  await expect(rows.nth(3).locator('.frow-st')).toHaveText('—');
  await expect(rows.nth(3).locator('.frow-week')).toHaveCount(0);
  // Animar a Dora, que aún no ha estudiado hoy: pasa a «animado»
  await rows.nth(1).getByRole('button', { name: 'Animar a Dora' }).click();
  await expect(fr.locator('.frow').nth(1).locator('.frow-hoy')).toHaveText('enviado');
  expect(rpcs(srv, 'send_cheer')).toEqual([{ p_to: DORA.id, p_kind: 'clap' }]);
  // «Gracias»: el ánimo queda visto y desaparece de Hoy
  await fr.locator('[data-act="cheers-seen"]').click();
  await expect(fr.locator('.hoy-cheer')).toHaveCount(0);
  await expect.poll(() => sent(srv, 'cheers').map(w => w[0])).toEqual(['PATCH']);
  // «¡Te toca!» en tu fila empieza una tanda
  await fr.locator('.frow.me [data-act="tanda-short"]').click();
  await page.locator('#sheetBody [data-act="tanda-go"]').click();
  await expect(page.locator('.studybar')).toBeVisible();
});

test('un enlace de invitación ofrece añadir a quien lo manda', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.social.result = 'accepted';
  await page.goto('/#amigo-ZZZZ-2222');
  await expect(page.locator('#sheetBody')).toContainText('Te han invitado a Flaski');
  await page.locator('[data-act="fr-accept-invite"]').click();
  await expect(page.locator('#toast')).toContainText('¡Ya sois amigos!');
  expect(rpcs(srv, 'request_friend')).toEqual([{ p_code: 'ZZZZ2222' }]);
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('sin las funciones de amigos en Supabase, lo explica (y la app sigue funcionando)', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.social.missing = true;
  await openCloud(page);
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect(page.locator('#homeFriends .hoy-t')).toHaveCount(0);
  await nav(page, 'Perfil');
  await page.locator('[data-nav="friends"]').first().click();
  await expect(page.locator('#main')).toContainText('ejecuta otra vez supabase/schema.sql');
});
