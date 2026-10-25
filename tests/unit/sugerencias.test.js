// La batería de docs/rediseno/sugerencias (ver tests/sugerencias.mjs): que la cobertura no baje y el ruido no suba
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medir } from '../sugerencias.mjs';

const MIN = {
  'constitucion-titulo-preliminar': { imp: 17, all: 21, noise: 3 },
  'por-que-se-te-olvidan-las-cosas': { imp: 8, all: 11, noise: 0 },
};
test('batería de sugerencias: imprescindibles, total y ruido', () => {
  for (const r of medir()) {
    const m = MIN[r.name];
    assert.ok(m, r.name);
    assert.ok(r.imp.ok >= m.imp, `${r.name}: imprescindibles ${r.imp.ok}/${r.imp.of}`);
    assert.ok(r.all_.ok >= m.all, `${r.name}: total ${r.all.ok}/${r.all_.of}`);
    assert.ok(r.noise <= m.noise, `${r.name}: ruido ${r.noise}`);
  }
});
