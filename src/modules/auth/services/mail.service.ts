import { env } from '../../../config/env.js';
import { logger, redact } from '../../../core/logger.js';
import { AppError } from '../../../core/errors/AppError.js';
import { ErrorCode } from '../../../core/errors/codes.js';
import type { OtpPurpose } from '../models/otp.model.js';

//EMAIL VIA RESEND.
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
//
//SENDING BEFORE YOU OWN A DOMAIN: Resend's shared sender delivers ONLY to the
//address the Resend account was registered with. Every other recipient is
//refused. Fine for testing, useless for real users — which is why the domain
//is a launch blocker, not a nice-to-have.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

//A hung request would hold a resolver open and tie up the instance. Give up
//and report rather than wait.
const SEND_TIMEOUT_MS = 10_000;

type Language = 'en' | 'fr' | 'sw' | 'rn';

//Kirundi is deliberately absent: the app's Kirundi strings are machine-drafted
//and unreviewed, and a mistranslated security email is worse than an English
//one the user can puzzle out. `rn` falls back to English here.
const COPY: Record<OtpPurpose, Record<'en' | 'fr' | 'sw', { subject: string; line: string }>> = {
  SIGNUP: {
    en: { subject: 'is your Imara Afya code', line: 'Confirm your email address with this code.' },
    fr: { subject: 'est votre code Imara Afya', line: 'Confirmez votre adresse e-mail avec ce code.' },
    sw: { subject: 'ni namba yako ya Imara Afya', line: 'Thibitisha barua pepe yako kwa namba hii.' },
  },
  LOGIN: {
    en: { subject: '— new sign-in to Imara Afya', line: 'Use this code to finish signing in.' },
    fr: { subject: '— nouvelle connexion Imara Afya', line: 'Utilisez ce code pour terminer la connexion.' },
    sw: { subject: '— kuingia kupya Imara Afya', line: 'Tumia namba hii kumaliza kuingia.' },
  },
  RESET: {
    en: { subject: '— reset your Imara Afya password', line: 'Use this code to set a new password.' },
    fr: { subject: '— réinitialiser votre mot de passe', line: 'Utilisez ce code pour changer votre mot de passe.' },
    sw: { subject: '— badilisha nywila yako', line: 'Tumia namba hii kuweka nywila mpya.' },
  },
};

const WARNING: Record<'en' | 'fr' | 'sw', string> = {
  en: "If this wasn't you, change your password.",
  fr: "Si ce n'était pas vous, changez votre mot de passe.",
  sw: 'Kama hukuwa wewe, badilisha nywila yako.',
};

const pick = (language: Language): 'en' | 'fr' | 'sw' =>
  language === 'fr' || language === 'sw' ? language : 'en';

const htmlBody = (code: string, line: string, expiryMinutes: number, warning?: string): string => `
<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f7f6;font-family:Helvetica,Arial,sans-serif;color:#14281f">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">${line}</p>
    <p style="margin:0 0 20px;font-size:38px;letter-spacing:8px;font-weight:700;color:#1e5e45">${code}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#4a6b5c">This code expires in ${expiryMinutes} minutes.</p>
    ${warning ? `<p style="margin:16px 0 0;font-size:13px;color:#4a6b5c">${warning}</p>` : ''}
  </div>
  <p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#8ba396;text-align:center">Imara Afya</p>
</body></html>`;

//A plain-text alternative always goes alongside the HTML. Entry-level Android
//mail clients handle it better, and it renders on a slow connection.
const textBody = (code: string, line: string, expiryMinutes: number, warning?: string): string =>
  [line, '', code, '', `This code expires in ${expiryMinutes} minutes.`, warning ?? '']
    .filter(Boolean)
    .join('\n');

export const sendOtpEmail = async (params: {
  to: string;
  code: string;
  purpose: OtpPurpose;
  language: Language;
}): Promise<void> => {
  const locale = pick(params.language);
  const copy = COPY[params.purpose][locale];
  const warning = params.purpose === 'SIGNUP' ? undefined : WARNING[locale];

  //The code leads the subject line. On a notification preview or a feature
  //phone that is often all the user will ever see.
  const subject = `${params.code} ${copy.subject}`;

  if (!env.RESEND_API_KEY) {
    if (env.IS_PRODUCTION) {
      logger.error('Mail is not configured and a code could not be sent', {
        to: redact(params.to),
        purpose: params.purpose,
      });
      throw new AppError(
        ErrorCode.OTP_SEND_FAILED,
        'We could not send your code right now. Please try again shortly.'
      );
    }

    logger.warn('MAIL NOT CONFIGURED — code printed instead of sent', {
      to: redact(params.to),
      purpose: params.purpose,
      code: params.code,
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [params.to],
        subject,
        html: htmlBody(params.code, copy.line, env.OTP_TTL_MINUTES, warning),
        text: textBody(params.code, copy.line, env.OTP_TTL_MINUTES, warning),
        ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('Resend refused the message', {
        status: response.status,
        detail: detail.slice(0, 300),
        to: redact(params.to),
      });
      throw new AppError(
        ErrorCode.OTP_SEND_FAILED,
        'We could not send your code right now. Please try again shortly.'
      );
    }

    logger.info('Code sent', { to: redact(params.to), purpose: params.purpose });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Mail request failed', {
      error: error instanceof Error ? error.message : String(error),
      to: redact(params.to),
    });
    throw new AppError(
      ErrorCode.OTP_SEND_FAILED,
      'We could not send your code right now. Please try again shortly.'
    );
  } finally {
    clearTimeout(timeout);
  }
};
