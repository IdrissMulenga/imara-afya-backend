import { env } from '../config/env.js';
import { logger, redact } from '../logging/logger.js';
import { DomainError } from '../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../domain/shared/errors/error-codes.js';
import type { MailService } from '../../application/auth/ports/mail.port.js';
import { renderOtpEmail } from './otp.templates.js';

//THE MAIL PORT, IMPLEMENTED WITH RESEND.
//
//Called over plain fetch rather than through the `resend` SDK. The whole API
//we need is one POST, Node has fetch built in, and a dependency that exists to
//wrap a single HTTP call is a dependency to keep patched for no benefit.
//
//WHEN MAIL IS NOT CONFIGURED:
//  development — the code is printed to the server console, so the whole flow
//                can be tested end to end without a provider
//  production  — sending fails loudly. A code the user never receives is worse
//                than an honest error, because they will sit waiting for it
//                instead of asking for help.

const ENDPOINT = 'https://api.resend.com/emails';

//A hung request would hold a use case open and tie up the instance.
const TIMEOUT_MS = 10_000;

const sendFailed = () =>
  new DomainError(
    ErrorCode.OTP_SEND_FAILED,
    'We could not send your code right now. Please try again shortly.'
  );

export const resendMailService: MailService = {
  sendOtp: async (message) => {
    const rendered = renderOtpEmail({
      code: message.code,
      purpose: message.purpose,
      language: message.language,
      expiryMinutes: message.expiryMinutes,
    });

    if (!env.RESEND_API_KEY) {
      if (env.IS_PRODUCTION) {
        logger.error('Mail is not configured and a code could not be sent', {
          to: redact(message.to),
          purpose: message.purpose,
        });
        throw sendFailed();
      }

      logger.warn('MAIL NOT CONFIGURED — code printed instead of sent', {
        to: redact(message.to),
        purpose: message.purpose,
        code: message.code,
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: [message.to],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        logger.error('Resend refused the message', {
          status: response.status,
          detail: detail.slice(0, 300),
          to: redact(message.to),
        });
        throw sendFailed();
      }

      logger.info('Code sent', { to: redact(message.to), purpose: message.purpose });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      logger.error('Mail request failed', {
        error: error instanceof Error ? error.message : String(error),
        to: redact(message.to),
      });
      throw sendFailed();
    } finally {
      clearTimeout(timeout);
    }
  },
};
