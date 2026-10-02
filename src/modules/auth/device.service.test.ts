import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceSecret, hashDeviceSecret, verifyDeviceSecret } from './device.service.js';

test('device secrets require proof of possession, not just a matching public ID', async () => {
  const secret = createDeviceSecret();
  const hash = await hashDeviceSecret(secret);

  assert.equal(await verifyDeviceSecret(secret, hash), true);
  assert.equal(await verifyDeviceSecret(`${secret}x`, hash), false);
  assert.equal(await verifyDeviceSecret('', hash), false);
  assert.equal(await verifyDeviceSecret(secret, undefined), false);
});
