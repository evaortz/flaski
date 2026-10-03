// Conversión entre el estado de repaso que usa la app (fechas en milisegundos)
// y las filas que se guardan (fechas en texto ISO). La usan los dos backends.

export function toRow(uid, cardId, s) {
  return {
    user_id: uid, card_id: cardId,
    reps: s.reps, interval: s.interval, ease: s.ease, lapses: s.lapses || 0,
    due: new Date(s.due).toISOString(),
    first_seen: new Date(s.firstSeen).toISOString(),
    last: new Date(s.last).toISOString(),
  };
}

export function fromRow(r) {
  return {
    reps: r.reps, interval: r.interval, ease: r.ease, lapses: r.lapses,
    due: Date.parse(r.due), firstSeen: Date.parse(r.first_seen), last: Date.parse(r.last),
  };
}
