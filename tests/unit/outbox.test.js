import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, isRetryable } from '../../js/outbox.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const NET = () => Object.assign(new TypeError('TypeError: Failed to fetch'), { status: 0 });

// Servidor de mentira: guarda lo recibido y se puede «desconectar»
function fakeServer() {
  const s = { online: true, got: [], fail: null };
  s.run = async (op, args) => {
    if (!s.online) throw NET();
    if (s.fail?.(op, args)) throw Object.assign(new Error('violates check constraint'), { status: 400, code: '23514' });
    s.got.push([op, ...args]);
    return op === 'bumpLog' ? 7 : null;
  };
  return s;
}

test('con conexión se envía en el momento y devuelve la respuesta', async () => {
  const srv = fakeServer();
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory() });
  assert.equal(await box.push('bumpLog', 'u', '2026-03-10', 1, 1), 7);
  assert.equal(box.size, 0);
  assert.deepEqual(srv.got, [['bumpLog', 'u', '2026-03-10', 1, 1]]);
});

test('sin conexión se guarda, sobrevive a «recargar» y se envía en orden al volver', async () => {
  const srv = fakeServer();
  const storage = memory();
  srv.online = false;
  let box = createOutbox({ key: 'k', run: srv.run, storage });
  assert.equal(await box.push('addEvent', { id: 'e1' }), undefined);
  await box.push('saveProgress', 'u', 'c1', { reps: 1 });
  await box.push('bumpLog', 'u', 'd', 1, 1);
  assert.equal(box.size, 3);

  box = createOutbox({ key: 'k', run: srv.run, storage });   // la app se cierra y se vuelve a abrir
  srv.online = true;
  assert.equal(await box.flush(), true);
  assert.deepEqual(srv.got.map(x => x[0]), ['addEvent', 'saveProgress', 'bumpLog']);
  assert.equal(box.size, 0);
});

test('del progreso de una tarjeta solo se envía lo último', async () => {
  const srv = fakeServer();
  srv.online = false;
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory() });
  await box.push('saveProgress', 'u', 'c1', { reps: 1 });
  await box.push('saveProgress', 'u', 'c2', { reps: 1 });
  await box.push('clearProgress', 'u', 'c1');
  await box.push('saveProgress', 'u', 'c1', { reps: 2 });
  srv.online = true;
  await box.flush();
  assert.deepEqual(srv.got, [['saveProgress', 'u', 'c2', { reps: 1 }], ['saveProgress', 'u', 'c1', { reps: 2 }]]);
});

test('deshacer una respuesta aún no enviada la quita de la cola', async () => {
  const srv = fakeServer();
  srv.online = false;
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory() });
  await box.push('addEvent', { id: 'e1' });
  await box.push('deleteEvent', 'e1');
  assert.equal(box.size, 0);
});

test('un cambio que el servidor rechaza por los datos se descarta y no bloquea a los demás', async () => {
  const srv = fakeServer();
  srv.fail = op => op === 'addEvent';
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory() });
  const warn = console.warn; console.warn = () => {};
  try {
    await box.push('addEvent', { id: 'malo' });
    await box.push('saveProgress', 'u', 'c1', {});
  } finally { console.warn = warn; }
  assert.equal(box.size, 0);
  assert.deepEqual(srv.got.map(x => x[0]), ['saveProgress']);
});

test('un envío con la cola vacía no deja la cola bloqueada', async () => {
  const srv = fakeServer();
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory() });
  assert.equal(await box.flush(), true);          // al entrar en la app: nada pendiente
  srv.online = false;
  await box.push('saveProgress', 'u', 'c1', {});
  srv.online = true;
  assert.equal(await box.flush(), true);
  assert.equal(box.size, 0);
  assert.equal(srv.got.length, 1);
});

test('varios cambios seguidos mientras se envía el primero salen todos', async () => {
  const srv = fakeServer();
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory() });
  await Promise.all([box.push('addEvent', { id: 'a' }), box.push('addEvent', { id: 'b' }), box.push('addEvent', { id: 'c' })]);
  assert.equal(box.size, 0);
  assert.deepEqual(srv.got.map(x => x[1].id), ['a', 'b', 'c']);
});

test('avisa de cuántos cambios quedan', async () => {
  const srv = fakeServer();
  srv.online = false;
  const seen = [];
  const box = createOutbox({ key: 'k', run: srv.run, storage: memory(), onChange: n => seen.push(n) });
  await box.push('addEvent', { id: 'a' });
  await box.push('addEvent', { id: 'b' });
  srv.online = true;
  await box.flush();
  assert.deepEqual(seen, [1, 2, 1, 0]);
});

test('qué errores se reintentan', () => {
  assert.equal(isRetryable(NET()), true);
  assert.equal(isRetryable({ message: 'JWT expired', code: 'PGRST301', status: 401 }), true);
  assert.equal(isRetryable({ message: 'Service Unavailable', status: 503 }), true);
  assert.equal(isRetryable({ message: 'new row violates row-level security policy', code: '42501', status: 403 }), false);
  assert.equal(isRetryable({ message: 'duplicate key', code: '23505', status: 409 }), false);
});
