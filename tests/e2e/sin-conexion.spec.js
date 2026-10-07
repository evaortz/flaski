import { test, expect, answer, nav } from './fixtures.js';
import { mockCloud, openCloud, sent, UID } from './nube.js';

test('estudiar sin conexión: los cambios esperan y se envían al volver la red', async ({ page, context }) => {
  const srv = await mockCloud(page);
  await openCloud(page);
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect(page.locator('#net')).toBeHidden();

  await context.setOffline(true);
  srv.reachable = false;
  await expect(page.locator('#net')).toContainText('Sin conexión');
  await page.getByRole('button', { name: 'Empezar a estudiar' }).click();
  await answer(page, 3);
  await answer(page, 3);
  await expect(page.locator('#net')).toContainText('por enviar');
  expect(sent(srv, 'progress')).toHaveLength(0);

  srv.reachable = true;
  await context.setOffline(false);
  await expect(page.locator('#net')).toBeHidden();
  expect(sent(srv, 'progress')).toHaveLength(2);
  expect(sent(srv, 'review_events')).toHaveLength(2);
  expect(sent(srv, 'bump_review_log')).toHaveLength(2);
});

test('abrir la app sin conexión usa la copia guardada y envía lo pendiente al reconectar', async ({ page }) => {
  const srv = await mockCloud(page);
  await openCloud(page);                       // primera vez con red: se guarda la copia
  await expect(page.locator('.hero-num')).toHaveText('3');

  srv.reachable = false;
  await page.reload();
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect(page.locator('#net')).toContainText('Sin conexión');

  await page.getByRole('button', { name: 'Empezar a estudiar' }).click();
  await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await expect(page.locator('.hero-num')).toHaveText('2');
  await expect(page.locator('#net')).toContainText('3 cambios por enviar');   // respuesta, progreso y contador del día

  // Lo estudiado sin red sigue ahí aunque se vuelva a cerrar y abrir sin conexión
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.reload();
  await expect(page.locator('.hero-num')).toHaveText('2');

  srv.reachable = true;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.locator('#net')).toBeHidden();
  expect(sent(srv, 'progress')).toHaveLength(1);
  expect(sent(srv, 'review_events')).toHaveLength(1);
  expect(sent(srv, 'bump_review_log')).toHaveLength(1);
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
  await nav(page, 'Mis mazos');
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
  await page.evaluate(i => document.body.insertAdjacentHTML('beforeend', `<img id="probe" class="media" data-img="${i}">`), id);
  await expect(page.locator('#probe')).toHaveAttribute('src', /^blob:/);
});
