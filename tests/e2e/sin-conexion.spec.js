import { test, expect, answer, nav, startTanda } from './fixtures.js';
import { mockCloud, openCloud, sent, UID } from './nube.js';

test('estudiar sin conexión: los cambios esperan y se envían al volver la red', async ({ page, context }) => {
  const srv = await mockCloud(page);
  await openCloud(page);
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect(page.locator('#net')).toBeHidden();

  await context.setOffline(true);
  srv.reachable = false;
  await expect(page.locator('#net')).toContainText('Sin conexión');
  await startTanda(page);
  await answer(page, 3);
  await answer(page, 3);
  await expect(page.locator('#net')).toContainText('por enviar');
  expect(sent(srv, 'progress')).toHaveLength(0);

  srv.reachable = true;
  await context.setOffline(false);
  await expect(page.locator('#net')).toBeHidden();
  await expect.poll(() => sent(srv, 'progress').length).toBe(2);
  await expect.poll(() => sent(srv, 'review_events').length).toBe(2);
  await expect.poll(() => sent(srv, 'bump_review_log').length).toBe(2);
});

test('abrir la app sin conexión usa la copia guardada y envía lo pendiente al reconectar', async ({ page }) => {
  const srv = await mockCloud(page);
  await openCloud(page);                       // primera vez con red: se guarda la copia
  await expect(page.locator('.hero-num')).toHaveText('3');

  srv.reachable = false;
  await page.reload();
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect(page.locator('#net')).toContainText('Sin conexión');

  await startTanda(page);
  await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await expect(page.locator('.hero-num')).toHaveText('2');
  await expect(page.locator('#net')).toContainText('4 cambios por enviar');   // respuesta, progreso, contador del día y la duración de la tanda (la primera vez)

  // Lo estudiado sin red sigue ahí aunque se vuelva a cerrar y abrir sin conexión
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.reload();
  await expect(page.locator('.hero-num')).toHaveText('2');

  srv.reachable = true;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.locator('#net')).toBeHidden();
  await expect.poll(() => sent(srv, 'progress').length).toBe(1);
  await expect.poll(() => sent(srv, 'review_events').length).toBe(1);
  await expect.poll(() => sent(srv, 'bump_review_log').length).toBe(1);
});

test('al abrir, los datos no esperan a que se envíe lo pendiente, y lo pendiente se ve encima', async ({ page }) => {
  const srv = await mockCloud(page);
  // Una respuesta que quedó sin enviar: la pregunta 1 ya no toca hoy
  const now = Date.now(), card = 'c0000001-0000-4000-8000-000000000001';
  const s = { reps: 1, interval: 5, ease: 2.5, lapses: 0, due: now + 5 * 864e5, firstSeen: now, last: now };
  await page.addInitScript(([key, item]) => { if (!sessionStorage.getItem('puesto')) { sessionStorage.setItem('puesto', '1'); localStorage.setItem(key, JSON.stringify([item])); } },
    ['flaski-outbox:' + UID, { id: 'p1', op: 'saveProgress', args: [UID, card, s] }]);
  // El servidor tarda mucho en guardar el progreso
  let release;
  const slow = new Promise(r => { release = r; });
  await page.route('https://test.supabase.co/rest/v1/progress*', async route => {
    if (route.request().method() === 'GET') return route.fallback();
    await slow;
    return route.fallback();
  });
  await openCloud(page);
  await expect(page.locator('.hero-num')).toHaveText('2');
  expect(sent(srv, 'progress')).toHaveLength(0);
  release();
  await expect.poll(() => sent(srv, 'progress').length).toBe(1);
  await expect(page.locator('#net')).toBeHidden();
});

test('cerrar sesión borra la copia sin conexión de este dispositivo', async ({ page }) => {
  await mockCloud(page);
  await openCloud(page);
  expect(await page.evaluate(() => localStorage.getItem('flaski-last-user'))).toContain('prueba@example.com');
  await page.locator('#nav').getByRole('button', { name: 'Perfil' }).click();
  await page.locator('[data-act="signout"]').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('flaski-last-user'))).toBeNull();
});

test('una imagen añadida sin conexión se sube al volver la red y se descarga en otro dispositivo', async ({ page, context }) => {
  const PNG = { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64') };
  const srv = await mockCloud(page);
  await openCloud(page);
  await context.setOffline(true);
  srv.reachable = false;
  await nav(page, 'Biblioteca');
  await page.getByText('Turco en la nube').first().click();
  await page.locator('#main .row').first().click();
  await page.locator('#fld-q').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-fmt="image"]').click();
  await (await chooser).setFiles(PNG);
  await expect(page.locator('#pvBody img.media')).toHaveAttribute('src', /^blob:/);
  const id = /img:([a-z0-9]+)/.exec(await page.locator('#fld-q').inputValue())[1];
  expect(srv.files.size).toBe(0);

  srv.reachable = true;
  await context.setOffline(false);
  await expect.poll(() => [...srv.files.keys()]).toEqual([`media/${UID}/${id}`]);

  // Otro dispositivo (sin la imagen guardada en el navegador): la descarga de la nube
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('flaski-media'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await page.reload();
  await expect(page.locator('#nav')).toBeVisible();   // con sesión: ya sabe de dónde descargar las imágenes
  await page.evaluate(i => document.body.insertAdjacentHTML('beforeend', `<img id="probe" class="media" data-img="${i}">`), id);
  await expect(page.locator('#probe')).toHaveAttribute('src', /^blob:/);
});

test('con cuenta, cambiar la imagen de una carpeta borra la anterior también de la nube', async ({ page }) => {
  const PNG = { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64') };
  const srv = await mockCloud(page);
  await openCloud(page);
  await nav(page, 'Biblioteca');
  const pick = async () => {
    await page.locator('[data-icon-tab="img"]').click();
    const ch = page.waitForEvent('filechooser');
    await page.locator('[data-act="folder-image"]').click();
    await (await ch).setFiles(PNG);
    await expect(page.locator('#f-icon')).toHaveValue(/^i:/);
    return (await page.locator('#f-icon').inputValue()).slice(2);
  };
  await page.locator('#main [data-act="new-folder"]').first().click();
  await page.locator('#fo-name').fill('Viajes');
  const first = await pick();
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => [...srv.files.keys()]).toContain(`media/${UID}/${first}`);
  await page.locator('#main [data-act="edit-folder"]').click();
  await page.locator('[data-act="clear-icon"]').click();
  const second = await pick();
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => [...srv.files.keys()]).toEqual([`media/${UID}/${second}`]);
});

test('si la red falla al borrar la imagen anterior de una carpeta, el borrado espera en la cola y se envía al volver', async ({ page }) => {
  const PNG = { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64') };
  const srv = await mockCloud(page);
  await openCloud(page);
  await nav(page, 'Biblioteca');
  const pick = async () => {
    await page.locator('[data-icon-tab="img"]').click();
    const ch = page.waitForEvent('filechooser');
    await page.locator('[data-act="folder-image"]').click();
    await (await ch).setFiles(PNG);
    await expect(page.locator('#f-icon')).toHaveValue(/^i:/);
    return (await page.locator('#f-icon').inputValue()).slice(2);
  };
  await page.locator('#main [data-act="new-folder"]').first().click();
  await page.locator('#fo-name').fill('Viajes');
  const first = await pick();
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => [...srv.files.keys()]).toContain(`media/${UID}/${first}`);
  // Cambiar la imagen con la red cortada para el borrado
  srv.storageDown = true;
  await page.locator('#main [data-act="edit-folder"]').click();
  await page.locator('[data-act="clear-icon"]').click();
  const second = await pick();
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#net')).toContainText('1 cambio por enviar');
  expect([...srv.files.keys()]).toContain(`media/${UID}/${first}`);
  // Vuelve la red: se borra
  srv.storageDown = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.locator('#net')).toBeHidden();
  await expect.poll(() => [...srv.files.keys()]).toEqual([`media/${UID}/${second}`]);
});
