// Cola de envíos pendientes: lo que se escribe mientras no hay conexión (o falla la red) se guarda
// en este navegador y se manda en orden cuando vuelve. Sin dependencias, así que se puede probar aparte.
//
// Cada operación es { op, args }. run(op, args) la envía y devuelve lo que diga el servidor.
// Si falla por algo que puede arreglarse solo (sin red, sesión caducada, servidor caído) se queda en la
// cola y se reintenta; si el servidor la rechaza por los datos, se descarta para no bloquear las demás.

export function isRetryable(e) {
  if (!e) return false;
  const status = e.status ?? e.statusCode;
  // 403 no: suele ser un rechazo de las reglas de seguridad, que no se arregla reintentando
  if (status === 401 || status === 408 || status === 429 || status >= 500) return true;
  if (e.code === 'PGRST301' || e.code === 'PGRST303') return true;          // token caducado
  const m = String(e.message || e.details || e);
  return /fetch|network|load failed|timeout|offline|JWT|jwt/i.test(m) || status === 0;
}

export function createOutbox({ key, run, storage = globalThis.localStorage, retryable = isRetryable, onChange = () => {} }) {
  const read = () => { try { return JSON.parse(storage.getItem(key) || '[]'); } catch { return []; } };
  const write = q => { try { if (q.length) storage.setItem(key, JSON.stringify(q)); else storage.removeItem(key); } catch {} onChange(q.length); };
  let flushing = null, running = null;
  const waiting = new Set();   // ids cuyo push() sigue esperando
  const results = new Map();   // id → respuesta del servidor, para quien la está esperando
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Antes de añadir, quita lo que la nueva operación deja sin efecto
  function compact(q, item) {
    const { op, args } = item;
    // saveProgress(uid, cardId, s) y clearProgress(uid, cardId): solo cuenta la última de cada tarjeta
    if (op === 'saveProgress' || op === 'clearProgress') {
      return q.filter(x => !((x.op === 'saveProgress' || x.op === 'clearProgress') && x.args[1] === args[1]));
    }
    if (op === 'saveSettings') return q.filter(x => x.op !== 'saveSettings');
    // savePage(página entera): solo cuenta la última versión de cada página
    if (op === 'savePage') return q.filter(x => !(x.op === 'savePage' && x.args[0]?.id === args[0]?.id));
    return q;
  }

  return {
    get size() { return read().length; },
    get items() { return read().map(({ op, args }) => ({ op, args })); },
    // Guarda la operación y la intenta enviar. Nunca falla por la red: en ese caso queda pendiente.
    // Devuelve la respuesta del servidor si se ha podido enviar ya; si queda pendiente, undefined.
    async push(op, ...args) {
      const item = { id: newId(), op, args };
      // Deshacer una respuesta que aún no se había enviado: se quitan las dos
      if (op === 'deleteEvent') {
        const q = read();
        const i = q.findIndex(x => x.op === 'addEvent' && x.args[0]?.id === args[0]);
        if (i >= 0) { q.splice(i, 1); write(q); return; }
      }
      write([...compact(read(), item), item]);
      waiting.add(item.id);
      try {
        await this.flush();
        return results.get(item.id);
      } finally { waiting.delete(item.id); results.delete(item.id); }
    },
    // Envía todo lo pendiente, en orden. Para en el primer fallo de red.
    flush() {
      if (flushing) return flushing;
      // La marca de «enviando» se quita en el mismo paso en que se ve la cola vacía: así, lo que llegue
      // justo después arranca un envío nuevo en vez de colgarse de uno que ya ha terminado.
      const token = {};
      running = token;
      const p = (async () => {
        try {
          for (;;) {
            const q = read();
            if (!q.length) return true;
            const item = q[0];
            try {
              const res = await run(item.op, item.args);
              if (waiting.has(item.id)) results.set(item.id, res);
            } catch (e) {
              if (retryable(e)) return false;
              console.warn('Flaski: el servidor rechazó un cambio pendiente y se descarta', item, e);
            }
            // Se quita por id: mientras se enviaba pudo entrar otra operación que la dejara sin efecto
            write(read().filter(x => x.id !== item.id));
          }
        } finally {
          if (running === token) { running = null; flushing = null; }
        }
      })();
      if (running === token) flushing = p;   // si terminó en el acto (cola vacía), no queda marcado
      return p;
    },
    clear() { write([]); },
  };
}
