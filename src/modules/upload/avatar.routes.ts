import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { getUserFromRequest } from '../../shared/middleware/auth.js';
import { ErrorCode, appError } from '../../shared/errors.js';
import { env } from '../../config/env.js';
import { translate } from '../../shared/messages.js';
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

const authed = async (req: Request) => {
  const caller = await getUserFromRequest(req);
  if (!caller.user) {
    throw appError(ErrorCode.UNAUTHENTICATED, 'You need to be signed in to do that.');
  }
  return caller.user;
};

type Extensions = { code: string } & Record<string, unknown>;

//Sends a translated error in the same shape as a GraphQL error.
const fail = (
  req: Request,
  res: Response,
  status: number,
  extensions: Extensions,
  message: string
): void => {
  const localized = translate(message, extensions, req.headers['accept-language']);
  res.status(status).json({ errors: [{ message: localized, extensions }] });
};

const statusFor = (code: string): number => {
  if (code === ErrorCode.UNAUTHENTICATED || code === ErrorCode.TOKEN_REVOKED) return 401;
  if (code === ErrorCode.BAD_USER_INPUT) return 400;
  if (code === ErrorCode.RATE_LIMITED) return 429;
  return 500;
};

const send = (req: Request, res: Response, error: unknown): void => {
  const shaped = error as { message?: string; extensions?: Record<string, unknown> };
  const code = shaped?.extensions?.code;

  if (typeof code === 'string') {
    fail(
      req,
      res,
      statusFor(code),
      { ...shaped.extensions, code },
      shaped.message ?? 'Something went wrong.'
    );
    return;
  }

  const multerError = error as { code?: string };
  if (multerError?.code === 'LIMIT_FILE_SIZE') {
    fail(
      req,
      res,
      400,
      { code: ErrorCode.BAD_USER_INPUT, reason: 'IMAGE_TOO_LARGE', max: env.MAX_UPLOAD_MB },
      `That image is too large. The limit is ${env.MAX_UPLOAD_MB}MB.`
    );
    return;
  }
  if (multerError?.code?.startsWith('LIMIT_')) {
    fail(
      req,
      res,
      400,
      { code: ErrorCode.BAD_USER_INPUT, reason: 'UPLOAD_REJECTED' },
      'That upload was not accepted.'
    );
    return;
  }

  console.error('[upload] unexpected failure:', error);
  fail(req, res, 500, { code: ErrorCode.INTERNAL }, 'Something went wrong. Please try again.');
};

export const uploadRouter = (): Router => {
  const router = Router();

  //POST /upload/avatar, multipart field `photo` -> { photoUrl }
  router.post('/avatar', (req, res) => {
    void (async () => {
      let user: Awaited<ReturnType<typeof authed>>;
      try {
        user = await authed(req);
      } catch (error) {
        send(req, res, error);
        return;
      }

      upload.single('photo')(req, res, (uploadError) => {
        if (uploadError) {
          send(req, res, uploadError);
          return;
        }

        void (async () => {
          try {
            const file = (req as Request & { file?: { buffer: Buffer } }).file;
            if (!file?.buffer) {
              throw appError(ErrorCode.BAD_USER_INPUT, 'No image was received.', {
                reason: 'NO_IMAGE',
              });
            }

            const photoUrl = await saveAvatar(user, file.buffer);
            res.status(200).json({ photoUrl });
          } catch (error) {
            send(req, res, error);
          }
        })();
      });
    })();
  });

  //DELETE /upload/avatar -> { photoUrl: '' }
  router.delete('/avatar', (req, res) => {
    void (async () => {
      try {
        const user = await authed(req);
        await clearAvatar(user);
        res.status(200).json({ photoUrl: '' });
      } catch (error) {
        send(req, res, error);
      }
    })();
  });

  return router;
};
