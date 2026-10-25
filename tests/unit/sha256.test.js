// SHA-256 en JavaScript (sin crypto.subtle): da lo mismo que el de Node, también con textos largos y vacíos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, digest } from '../../js/sha256.js';

const hex = b => Buffer.from(b).toString('hex');
test('sha256 coincide con node:crypto', () => {
  for (const s of ['', 'abc', '11111111-1111-4111-8111-111111111111:d0000000-0000-4000-8000-000000000001', 'ñ€漢字'.repeat(40), 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)]) {
    const b = new TextEncoder().encode(s);
    assert.equal(hex(sha256(b)), createHash('sha256').update(b).digest('hex'), s.slice(0, 20));
  }
});
test('digest da lo mismo con y sin crypto.subtle', async () => {
  const b = new TextEncoder().encode('uid:id');
  const withSubtle = hex(await digest(b));
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try { assert.equal(hex(await digest(b)), withSubtle); } finally { Object.defineProperty(globalThis, 'crypto', saved); }
});
