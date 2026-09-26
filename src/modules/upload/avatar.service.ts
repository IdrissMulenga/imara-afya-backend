import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { IUser } from '../user/index.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { env } from '../../config/env.js';

//Stores avatars as 512px JPEGs (re-encoded, EXIF stripped) under random filenames.

const SIDE = 512;
const QUALITY = 82;

//Public URL prefix; stored URLs are relative to the API origin.
const PUBLIC_PREFIX = '/uploads/avatars';

//Folder the avatar files are saved in.
export const avatarDir = (): string => path.resolve(process.cwd(), env.UPLOAD_DIR, 'avatars');

//Disk path for one of our avatar URLs, or null for anything else.
const localPathFor = (photoUrl: string): string | null => {
  if (!photoUrl.startsWith(`${PUBLIC_PREFIX}/`)) return null;

  const name = path.basename(photoUrl);
  if (!/^[a-f0-9]{32}\.(jpg|webp)$/.test(name)) return null;

  return path.join(avatarDir(), name);
};

//Re-encodes and saves a new avatar, then deletes the previous one.
export const saveAvatar = async (user: IUser, bytes: Buffer | undefined): Promise<string> => {
  if (!bytes?.length) {
    throw appError(ErrorCode.BAD_USER_INPUT, 'No image was received.', { reason: 'NO_IMAGE' });
  }

  let processed: Buffer;
  try {
    processed = await sharp(bytes, { failOn: 'error' })
      //Applies EXIF orientation before metadata is stripped.
      .rotate()
      .resize(SIDE, SIDE, { fit: 'cover', position: 'centre', withoutEnlargement: false })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    throw appError(ErrorCode.BAD_USER_INPUT, 'That file is not an image we can read.', {
      reason: 'NOT_IMAGE',
    });
  }

  const name = `${randomBytes(16).toString('hex')}.jpg`;
  const dir = avatarDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), processed);

  const previous = user.photoUrl;
  user.photoUrl = `${PUBLIC_PREFIX}/${name}`;
  await user.save();

  if (previous && previous !== user.photoUrl) {
    const stale = localPathFor(previous);
    if (stale) await unlink(stale).catch(() => {});
  }

  return user.photoUrl;
};

//Removes the user's avatar; succeeds even if the file is already gone.
export const clearAvatar = async (user: IUser): Promise<void> => {
  const previous = user.photoUrl;
  if (!previous) return;

  user.photoUrl = '';
  await user.save();

  const stale = localPathFor(previous);
  if (stale) await unlink(stale).catch(() => {});
};
