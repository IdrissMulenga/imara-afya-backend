import { createHash } from 'node:crypto';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { env, appleKeyConfigured } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { seal, open } from '../../shared/secretbox.js';
import { User, type IUser, type Provider } from '../user/index.js';

//What a checked Google or Apple ID token says about the person.
export interface ProviderClaims {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  issuedAt: Date;
}

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';
//The app id Expo Go signs Apple tokens for; accepted outside production only.
const EXPO_GO_AUDIENCE = 'host.exp.Exponent';
//How old a provider token may be when it confirms an account deletion.
const REAUTH_MAX_AGE_MS = 10 * 60_000;

//The providers' public keys, fetched once and cached; tests replace them with local keys.
export const providerKeys: { google?: JWTVerifyGetKey; apple?: JWTVerifyGetKey } = {};

const googleKeys = () =>
  (providerKeys.google ??= createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs')
  ));
const appleKeys = () =>
  (providerKeys.apple ??= createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')));

const invalidToken = (reason?: string) =>
  appError(
    ErrorCode.PROVIDER_TOKEN_INVALID,
    reason === 'EXPIRED'
      ? 'That sign-in took too long. Please try again.'
      : 'That sign-in did not work. Please try again.',
    reason ? { reason } : undefined
  );

//Audiences Apple tokens may carry: the app, plus Expo Go outside production.
export const appleAudiences = (production = env.IS_PRODUCTION): string[] =>
  production ? [env.APPLE_BUNDLE_ID] : [env.APPLE_BUNDLE_ID, EXPO_GO_AUDIENCE];

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

//Checks signature, issuer, audience and expiry; maps every failure to PROVIDER_TOKEN_INVALID.
const verify = async (
  token: string,
  keys: JWTVerifyGetKey,
  issuer: string | string[],
  audience: string[]
): Promise<JWTPayload> => {
  if (!token || audience.length === 0) throw invalidToken();
  try {
    const { payload } = await jwtVerify(token, keys, { issuer, audience, clockTolerance: 60 });
    if (typeof payload.sub !== 'string' || !payload.sub) throw invalidToken();
    return payload;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) throw invalidToken('EXPIRED');
    if (error instanceof joseErrors.JOSEError) {
      console.warn('[identity] token refused:', error.code);
      throw invalidToken();
    }
    throw error;
  }
};

const claimsOf = (payload: JWTPayload, emailVerified: boolean): ProviderClaims => ({
  subject: String(payload.sub),
  email: typeof payload.email === 'string' ? payload.email : '',
  emailVerified,
  name: typeof payload.name === 'string' ? payload.name : '',
  issuedAt: new Date((payload.iat ?? 0) * 1000),
});

//Checks a Google ID token issued for one of our client ids.
export const verifyGoogleToken = async (
  idToken: string,
  audiences: string[] = [env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID].filter(Boolean)
): Promise<ProviderClaims> => {
  const payload = await verify(idToken, googleKeys(), GOOGLE_ISSUERS, audiences);
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  return claimsOf(payload, verified);
};

//Checks an Apple identity token; its nonce must be the SHA-256 of the raw nonce the app sent.
export const verifyAppleToken = async (
  identityToken: string,
  rawNonce: string,
  audiences: string[] = appleAudiences()
): Promise<ProviderClaims> => {
  const payload = await verify(identityToken, appleKeys(), APPLE_ISSUER, audiences);
  if (!rawNonce || payload.nonce !== sha256(rawNonce)) throw invalidToken('NONCE');
  //Apple only gives out confirmed addresses or its own relay addresses.
  return claimsOf(payload, true);
};

//An existing account with the same email is linked only when both sides have proven it.
export const linkDecision = (providerEmailVerified: boolean, accountEmailVerified: boolean) =>
  providerEmailVerified && accountEmailVerified ? 'link' : 'refuse';

//True when the token was issued recently enough to confirm a deletion.
export const isFresh = (claims: ProviderClaims, now = Date.now()): boolean =>
  now - claims.issuedAt.getTime() <= REAUTH_MAX_AGE_MS;

//Proves the person deleting a Google / Apple-only account is its owner.
export const confirmProviderReauth = async (
  user: IUser,
  input: { googleIdToken?: string | null; apple?: { identityToken: string; nonce: string } | null }
): Promise<void> => {
  let provider: Provider;
  let claims: ProviderClaims;
  if (input.googleIdToken) {
    provider = 'google';
    claims = await verifyGoogleToken(input.googleIdToken);
  } else if (input.apple) {
    provider = 'apple';
    claims = await verifyAppleToken(input.apple.identityToken, input.apple.nonce);
  } else {
    throw appError(ErrorCode.WRONG_ACCOUNT, 'Please sign in with Google or Apple to confirm.');
  }

  if (!isFresh(claims)) throw invalidToken('EXPIRED');
  const linked = user.identities.some(
    (identity) => identity.provider === provider && identity.subject === claims.subject
  );
  if (!linked) {
    throw appError(
      ErrorCode.WRONG_ACCOUNT,
      'That is not the account linked to Imara Afya. Please use the same one you signed in with.'
    );
  }
};

//The signed client secret Apple's token endpoints ask for.
const appleClientSecret = async (): Promise<string> =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_BUNDLE_ID)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(await importPKCS8(env.APPLE_PRIVATE_KEY, 'ES256'));

const applePost = async (path: string, form: Record<string, string>): Promise<Response> =>
  fetch(`${APPLE_ISSUER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_BUNDLE_ID,
      client_secret: await appleClientSecret(),
      ...form,
    }),
  });

//Swaps an Apple authorization code for a refresh token, sealed for storage. Null when the key
//is not configured or Apple refuses; sign-in goes ahead either way.
export const sealedAppleRefreshToken = async (code?: string | null): Promise<string | null> => {
  if (!code || !appleKeyConfigured()) return null;
  try {
    const response = await applePost('/auth/token', { code, grant_type: 'authorization_code' });
    if (!response.ok) {
      console.warn('[identity] Apple code exchange refused:', response.status);
      return null;
    }
    const data = (await response.json()) as { refresh_token?: string };
    return data.refresh_token ? seal(data.refresh_token, env.TOKEN_ENCRYPTION_KEY) : null;
  } catch (error) {
    console.warn('[identity] Apple code exchange failed:', error);
    return null;
  }
};

//Revokes every stored Apple sign-in of a user. Failures are logged, never thrown.
export const revokeAppleSignIns = async (userId: IUser['_id']): Promise<void> => {
  if (!appleKeyConfigured()) return;
  const row = await User.findById(userId).select('+identities.appleRefreshToken');
  for (const identity of row?.identities ?? []) {
    if (identity.provider !== 'apple' || !identity.appleRefreshToken) continue;
    try {
      const token = open(identity.appleRefreshToken, env.TOKEN_ENCRYPTION_KEY);
      const response = await applePost('/auth/revoke', {
        token,
        token_type_hint: 'refresh_token',
      });
      if (!response.ok) console.warn('[identity] Apple revoke refused:', response.status);
    } catch (error) {
      console.warn('[identity] Apple revoke failed:', error);
    }
  }
};
