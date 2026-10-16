import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

//AES-256-GCM with a 12-byte IV; the output is base64 of iv + tag + ciphertext.
const IV_BYTES = 12;
const TAG_BYTES = 16;

//Encrypts text with a 32-byte key given as 64 hex characters.
export const seal = (plain: string, hexKey: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
};

//Decrypts what seal produced; throws if it was altered or the key is wrong.
export const open = (sealed: string, hexKey: string): string => {
  const raw = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(hexKey, 'hex'),
    raw.subarray(0, IV_BYTES)
  );
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
};
