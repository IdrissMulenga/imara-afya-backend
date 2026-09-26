import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { getUserFromRequest } from '../../shared/middleware/auth.js';
import { requireUser } from '../../shared/auth-guard.js';
import { ErrorCode, appError } from '../../shared/errors.js';
import { sendError } from '../../shared/http.js';
import { env } from '../../config/env.js';
import { saveAvatar, clearAvatar } from './avatar.service.js';

//Avatar upload endpoints (multipart, held in memory until re-encoded).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 0,
  },
  fileFilter: (_req, file, done) => {
    if (!/^image\//.test(file.mimetype)) {
      done(
        appError(ErrorCode.BAD_USER_INPUT, 'That file is not an image we can read.', {
          reason: 'NOT_IMAGE',
        })
      );
      return;
    }
    done(null, true);
  },
});

const UNAUTHORIZED = new Set<string>([
  ErrorCode.UNAUTHENTICATED,
  ErrorCode.TOKEN_REVOKED,
  ErrorCode.SESSION_EXPIRED,
]);

const statusFor = (code: string): number => {
  if (UNAUTHORIZED.has(code)) return 401;
  if (code === ErrorCode.BAD_USER_INPUT) return 400;
  if (code === ErrorCode.RATE_LIMITED) return 429;
  return 500;
};

//Turns a coded error, a multer limit, or anything else into a JSON error response.
const send = (req: Request, res: Response, error: unknown): void => {
  const shaped = error as { message?: string; extensions?: Record<string, unknown> };
  const code = shaped?.extensions?.code;
  if (typeof code === 'string') {
    sendError(req, res, statusFor(code), { ...shaped.extensions, code }, shaped.message ?? '');
    return;
  }

  const limit = (error as { code?: string })?.code;
  if (limit === 'LIMIT_FILE_SIZE') {
    sendError(
      req,
      res,
      400,
      { code: ErrorCode.BAD_USER_INPUT, reason: 'IMAGE_TOO_LARGE', max: env.MAX_UPLOAD_MB },
      `That image is too large. The limit is ${env.MAX_UPLOAD_MB}MB.`
    );
    return;
  }
  if (limit?.startsWith('LIMIT_')) {
    sendError(
      req,
      res,
      400,
      { code: ErrorCode.BAD_USER_INPUT, reason: 'UPLOAD_REJECTED' },
      'That upload was not accepted.'
    );
    return;
  }

  console.error('[upload] unexpected failure:', error);
  sendError(req, res, 500, { code: ErrorCode.INTERNAL }, 'Something went wrong. Please try again.');
};

//Runs a route and sends any error it throws as a JSON error response.
const route =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error: unknown) => send(req, res, error));
  };

const signedIn = async (req: Request) => requireUser((await getUserFromRequest(req)).user);

//Reads the multipart field `photo`; resolves with its bytes, if any.
const readPhoto = (req: Request, res: Response): Promise<Buffer | undefined> =>
  new Promise((resolve, reject) => {
    upload.single('photo')(req, res, (error: unknown) => {
      if (error) reject(error);
      else resolve((req as Request & { file?: { buffer: Buffer } }).file?.buffer);
    });
  });

//The /upload routes.
export const uploadRouter = (): Router => {
  const router = Router();

  //POST /upload/avatar, multipart field `photo` -> { photoUrl }
  router.post(
    '/avatar',
    route(async (req, res) => {
      const user = await signedIn(req);
      const photoUrl = await saveAvatar(user, await readPhoto(req, res));
      res.status(200).json({ photoUrl });
    })
  );

  //DELETE /upload/avatar -> { photoUrl: '' }
  router.delete(
    '/avatar',
    route(async (req, res) => {
      await clearAvatar(await signedIn(req));
      res.status(200).json({ photoUrl: '' });
    })
  );

  return router;
};
