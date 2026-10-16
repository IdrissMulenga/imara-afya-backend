import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  providerKeys,
  verifyGoogleToken,
  verifyAppleToken,
  appleAudiences,
  linkDecision,
  isFresh,
} from './identity.service.js';

const GOOGLE_CLIENT = 'test-client.apps.googleusercontent.com';
const APPLE_APP = 'bi.imaraco.imaraafya';

//Signing keys standing in for Google's and Apple's, plus a stranger's.
const google = await generateKeyPair('RS256');
const apple = await generateKeyPair('RS256');
const stranger = await generateKeyPair('RS256');

const keySet = async (key: CryptoKey, kid: string) =>
  createLocalJWKSet({ keys: [{ ...(await exportJWK(key)), kid, alg: 'RS256' }] });
providerKeys.google = await keySet(google.publicKey, 'g1');
providerKeys.apple = await keySet(apple.publicKey, 'a1');

const sign = (
  claims: Record<string, unknown>,
  options: { key?: CryptoKey; kid: string; iss: string; aud: string; exp?: string | number }
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: options.kid })
    .setSubject('person-123')
    .setIssuer(options.iss)
    .setAudience(options.aud)
    .setIssuedAt()
    .setExpirationTime(options.exp ?? '10m')
    .sign(options.key!);

const googleToken = (
  claims: Record<string, unknown> = {},
  over: Partial<{ aud: string; iss: string; exp: string | number; key: CryptoKey }> = {}
) =>
  sign(
    { email: 'Neza@Example.com', email_verified: true, name: 'Neza', ...claims },
    {
      key: over.key ?? google.privateKey,
      kid: 'g1',
      iss: over.iss ?? 'https://accounts.google.com',
      aud: over.aud ?? GOOGLE_CLIENT,
      exp: over.exp,
    }
  );

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const refused = (reason?: string) => (error: { extensions?: { code?: string; reason?: string } }) =>
  error.extensions?.code === 'PROVIDER_TOKEN_INVALID' && error.extensions?.reason === reason;

test('a good Google token gives the subject, email and name', async () => {
  const claims = await verifyGoogleToken(await googleToken(), [GOOGLE_CLIENT]);
  assert.equal(claims.subject, 'person-123');
  assert.equal(claims.email, 'Neza@Example.com');
  assert.equal(claims.emailVerified, true);
  assert.equal(claims.name, 'Neza');
});

test('Google email_verified false is passed on, not assumed', async () => {
  const claims = await verifyGoogleToken(await googleToken({ email_verified: false }), [
    GOOGLE_CLIENT,
  ]);
  assert.equal(claims.emailVerified, false);
});

test('a Google token for another app, issuer or signer is refused', async () => {
  for (const token of [
    await googleToken({}, { aud: 'someone-else' }),
    await googleToken({}, { iss: 'https://evil.example' }),
    await googleToken({}, { key: stranger.privateKey }),
  ]) {
    await assert.rejects(verifyGoogleToken(token, [GOOGLE_CLIENT]), refused(undefined));
  }
});

test('an expired Google token is refused as EXPIRED', async () => {
  const token = await googleToken({}, { exp: Math.floor(Date.now() / 1000) - 3600 });
  await assert.rejects(verifyGoogleToken(token, [GOOGLE_CLIENT]), refused('EXPIRED'));
});

test('without configured client ids no Google token is accepted', async () => {
  await assert.rejects(verifyGoogleToken(await googleToken(), []), refused(undefined));
});

test('an Apple token needs the SHA-256 of the raw nonce', async () => {
  const token = await sign(
    { email: 'abc@privaterelay.appleid.com', nonce: sha256('raw-nonce') },
    { key: apple.privateKey, kid: 'a1', iss: 'https://appleid.apple.com', aud: APPLE_APP }
  );
  const claims = await verifyAppleToken(token, 'raw-nonce', [APPLE_APP]);
  assert.equal(claims.emailVerified, true);
  await assert.rejects(verifyAppleToken(token, 'other-nonce', [APPLE_APP]), refused('NONCE'));
});

test('the Expo Go audience is accepted only outside production', () => {
  assert.ok(appleAudiences(false).includes('host.exp.Exponent'));
  assert.ok(!appleAudiences(true).includes('host.exp.Exponent'));
});

test('an existing account is linked only when both emails are verified', () => {
  assert.equal(linkDecision(true, true), 'link');
  assert.equal(linkDecision(true, false), 'refuse');
  assert.equal(linkDecision(false, true), 'refuse');
});

test('a deletion needs a token issued in the last 10 minutes', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const claims = (minutesAgo: number) => ({
    subject: 's',
    email: '',
    emailVerified: true,
    name: '',
    issuedAt: new Date(now - minutesAgo * 60_000),
  });
  assert.equal(isFresh(claims(9), now), true);
  assert.equal(isFresh(claims(11), now), false);
});
