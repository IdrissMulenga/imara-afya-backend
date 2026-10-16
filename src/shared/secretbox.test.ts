import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open } from './secretbox.js';

const KEY = 'a'.repeat(64);

test('a sealed value opens back to the original', () => {
  const sealed = seal('apple-refresh-token', KEY);
  assert.notEqual(sealed, 'apple-refresh-token');
  assert.equal(open(sealed, KEY), 'apple-refresh-token');
});

test('the same value seals differently each time', () => {
  assert.notEqual(seal('x', KEY), seal('x', KEY));
});

test('a wrong key or an altered value does not open', () => {
  const sealed = seal('secret', KEY);
  assert.throws(() => open(sealed, 'b'.repeat(64)));
  const raw = Buffer.from(sealed, 'base64');
  raw[raw.length - 1] ^= 1;
  assert.throws(() => open(raw.toString('base64'), KEY));
});
