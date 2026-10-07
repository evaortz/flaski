// Lector mínimo de bases de datos SQLite (solo lectura), para abrir las colecciones de Anki
// sin cargar SQLite entero en el navegador. Recorre las tablas tal cual están en el archivo:
// no hace consultas, devuelve todas las filas de una tabla. Sin dependencias de la interfaz.
// Formato: https://www.sqlite.org/fileformat.html

export function openSqlite(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (new TextDecoder().decode(b.subarray(0, 15)) !== 'SQLite format 3') throw new Error('No es una base de datos SQLite');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pageSize = dv.getUint16(16);
  if (pageSize === 1) pageSize = 65536;
  const usable = pageSize - b[20];
  const enc = dv.getUint32(56);
  const text = new TextDecoder(enc === 2 ? 'utf-16le' : enc === 3 ? 'utf-16be' : 'utf-8');
  const pageAt = n => (n - 1) * pageSize;

  function varint(o) {
    let v = 0n;
    for (let i = 0; i < 9; i++) {
      const x = b[o + i];
      if (i === 8) return [(v << 8n) | BigInt(x), o + 9];
      v = (v << 7n) | BigInt(x & 0x7f);
      if (!(x & 0x80)) return [v, o + i + 1];
    }
  }
  const vnum = o => { const [v, n] = varint(o); return [Number(v), n]; };

  // Contenido completo de una celda (lo que no cabe en la página sigue en páginas de desbordamiento)
  function payload(o, size, index) {
    const X = index ? Math.floor(((usable - 12) * 64) / 255) - 23 : usable - 35;
    if (size <= X) return b.subarray(o, o + size);
    const M = Math.floor(((usable - 12) * 32) / 255) - 23;
    let K = M + ((size - M) % (usable - 4));
    if (K > X) K = M;
    const out = new Uint8Array(size);
    out.set(b.subarray(o, o + K));
    let got = K, next = dv.getUint32(o + K);
    while (got < size && next) {
      const p = pageAt(next), n = Math.min(usable - 4, size - got);
      out.set(b.subarray(p + 4, p + 4 + n), got);
      got += n; next = dv.getUint32(p);
    }
    return out;
  }

  // Registro → lista de valores
  function record(rec) {
    const rdv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const vint = o => {
      let v = 0;
      for (let i = 0; i < 9; i++) { const x = rec[o + i]; if (i === 8) return [v * 256 + x, o + 9]; v = v * 128 + (x & 0x7f); if (!(x & 0x80)) return [v, o + i + 1]; }
    };
    let [hs, o] = vint(0);
    const types = [];
    while (o < hs) { const [t, n] = vint(o); types.push(t); o = n; }
    let p = hs;
    return types.map(t => {
      switch (t) {
        case 0: return null;
        case 1: { const v = rdv.getInt8(p); p += 1; return v; }
        case 2: { const v = rdv.getInt16(p); p += 2; return v; }
        case 3: { const v = (rdv.getInt8(p) << 16) | rdv.getUint16(p + 1); p += 3; return v; }
        case 4: { const v = rdv.getInt32(p); p += 4; return v; }
        case 5: { const v = rdv.getInt16(p) * 2 ** 32 + rdv.getUint32(p + 2); p += 6; return v; }
        case 6: { const v = Number(rdv.getBigInt64(p)); p += 8; return v; }
        case 7: { const v = rdv.getFloat64(p); p += 8; return v; }
        case 8: return 0;
        case 9: return 1;
        default: {
          const n = (t - (t % 2 ? 13 : 12)) / 2, v = rec.subarray(p, p + n);
          p += n;
          return t % 2 ? text.decode(v) : v.slice();
        }
      }
    });
  }

  // Todas las filas de un árbol (tabla normal: [rowid, valores]; sin rowid / índice: [null, valores])
  function walk(root, out = []) {
    // Recorrido en orden (la recursión solo baja tantos niveles como tenga el árbol)
    const visit = page => {
      const h = page === 1 ? 100 : 0, p = pageAt(page), type = b[p + h];
      const n = dv.getUint16(p + h + 3);
      const interior = type === 2 || type === 5;
      const ptrs = p + h + (interior ? 12 : 8);
      for (let i = 0; i < n; i++) {
        let o = p + dv.getUint16(ptrs + i * 2);
        if (type === 13) {            // hoja de tabla
          let size, rowid;
          [size, o] = vnum(o); [rowid, o] = varint(o);
          out.push([Number(rowid), record(payload(o, size, false))]);
        } else if (type === 5) {      // interior de tabla
          visit(dv.getUint32(o));
        } else if (type === 10) {     // hoja de índice
          let size; [size, o] = vnum(o);
          out.push([null, record(payload(o, size, true))]);
        } else if (type === 2) {      // interior de índice: el hijo y luego la propia clave
          visit(dv.getUint32(o));
          let size; [size, o] = vnum(o + 4);
          out.push([null, record(payload(o, size, true))]);
        } else throw new Error('Página de SQLite no válida');
      }
      if (interior) visit(dv.getUint32(p + h + 8));
    };
    visit(root);
    return out;
  }

  // Esquema: nombre de tabla → { root, columns, withoutRowid, pkAlias }
  const tables = new Map();
  for (const [, [type, name, , root, sql]] of walk(1)) {
    if (type !== 'table' || !sql) continue;
    tables.set(name, { root, ...parseCreate(sql) });
  }

  return {
    tables: () => [...tables.keys()],
    has: name => tables.has(name),
    // Filas de una tabla como objetos { columna: valor }
    rows(name) {
      const t = tables.get(name);
      if (!t) throw new Error(`Falta la tabla ${name}`);
      return walk(t.root).map(([rowid, vals]) => {
        const row = {};
        t.order.forEach((col, i) => { row[col] = vals[i] ?? null; });
        // La columna INTEGER PRIMARY KEY no se guarda en el registro: es el rowid
        if (t.pkAlias && rowid != null) row[t.pkAlias] = rowid;
        return row;
      });
    },
  };
}

// CREATE TABLE → columnas en el orden en que se guardan
export function parseCreate(sql) {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const columns = [], pk = [];
  let pkAlias = null;
  for (const raw of parts) {
    const s = raw.trim();
    const tableConstraint = /^(primary\s+key|unique|check|foreign\s+key|constraint)\b/i.exec(s);
    if (tableConstraint) {
      if (/^primary\s+key/i.test(s)) pk.push(...s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')).split(',').map(x => unq(x.trim().split(/\s+/)[0])));
      continue;
    }
    const m = /^("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)\s*(.*)$/s.exec(s);
    if (!m) continue;
    const col = unq(m[1]);
    columns.push(col);
    if (/primary\s+key/i.test(m[2])) { pk.push(col); if (/^integer\b/i.test(m[2].trim())) pkAlias = col; }
  }
  const withoutRowid = /\)\s*without\s+rowid\s*;?\s*$/i.test(sql);
  // En las tablas sin rowid, las columnas de la clave primaria van primero
  const order = withoutRowid ? [...pk, ...columns.filter(c => !pk.includes(c))] : columns;
  return { columns, order, withoutRowid, pkAlias: withoutRowid ? null : pkAlias };
}
const unq = s => s.replace(/^["`[]|["`\]]$/g, '');
