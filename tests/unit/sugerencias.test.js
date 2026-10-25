// La batería de docs/rediseno/sugerencias (ver tests/sugerencias.mjs): que la cobertura no baje, el ruido no suba y
// no salgan repetidas, mal escritas ni huecos largos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medir } from '../sugerencias.mjs';

const MIN = {
  'biologia-celula': { imp: 5, all: 10, noise: 0 },
  'constitucion-titulo-preliminar': { imp: 18, all: 27, noise: 0 },
  'historia-segunda-republica': { imp: 6, all: 10, noise: 0 },
  'ley-39-2015': { imp: 6, all: 11, noise: 0 },
  'por-que-se-te-olvidan-las-cosas': { imp: 8, all: 13, noise: 0 },
};
test('batería de sugerencias: imprescindibles, total y ruido', () => {
  for (const r of medir()) {
    const m = MIN[r.name];
    assert.ok(m, r.name);
    assert.ok(r.imp.ok >= m.imp, `${r.name}: imprescindibles ${r.imp.ok}/${r.imp.of}`);
    assert.ok(r.all_.ok >= m.all, `${r.name}: total ${r.all_.ok}/${r.all_.of}`);
    assert.ok(r.noise <= m.noise, `${r.name}: ruido ${r.noise}`);
  }
});
test('batería de sugerencias: 0 repetidas visibles, 0 mal escritas, 0 huecos de más de 25 palabras y 15 marcadas como mucho', () => {
  for (const r of medir()) {
    assert.deepEqual(r.repeated.map(s => s.front), [], `${r.name}: repetidas`);
    assert.deepEqual(r.bad.map(s => s.front), [], `${r.name}: mal escritas`);
    assert.deepEqual(r.long.map(s => s.front), [], `${r.name}: huecos largos`);
    assert.ok(r.marked.n <= 15, `${r.name}: marcadas ${r.marked.n}`);
  }
});
