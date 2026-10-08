// Amigos: utilidades sin interfaz (códigos, enlaces de invitación, semana y clasificación).
// Los datos de los demás llegan ya resumidos desde Supabase (friend_summary en supabase/schema.sql).

// «EVA7K2QX» → «EVA7-K2QX» (más fácil de dictar)
export const formatCode = c => (String(c || '').length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : String(c || ''));
// Lo que alguien escribe («eva7 k2qx», «EVA7-K2QX») → «EVA7K2QX» (o '' si no puede ser un código)
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 ? c : '';
}
// Enlace de invitación: …/#amigo-EVA7K2QX
export const inviteLink = (code, base = location.origin + location.pathname) => `${base}#amigo-${code}`;
export function parseInvite(hash) {
  const m = /^#amigo-([A-Za-z0-9-]{8,9})$/.exec(String(hash || ''));
  return m ? cleanCode(m[1]) : '';
}

// Días de esta semana (lunes a domingo) en formato 'YYYY-MM-DD', en la hora del dispositivo
export function weekDays(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  });
}
export const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const weekTotal = week => (week || []).reduce((s, n) => s + (Number(n) || 0), 0);

// Clasificación de la semana: tú y los amigos que comparten su actividad, por repasos
// (a igualdad, la racha más larga y luego el nombre). → [{ ...persona, total, pos }]
export function ranking(me, friends) {
  const all = [me, ...friends.filter(f => f.shared)].map(p => ({ ...p, total: weekTotal(p.week) }));
  all.sort((a, b) => b.total - a.total || (b.streak || 0) - (a.streak || 0) || String(a.name).localeCompare(String(b.name), 'es'));
  let pos = 0, prev = null;
  return all.map((p, i) => { if (p.total !== prev) { pos = i + 1; prev = p.total; } return { ...p, pos }; });
}

// Inicial para el avatar
export const initial = name => (String(name || '').trim()[0] || '?').toLocaleUpperCase();
