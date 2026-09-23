import { GraphQLError } from 'graphql';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import type { OtpPurpose } from './otp.model.js';
import { maskEmail } from '../../shared/validation.js';

//Sends one-time codes by email through Resend.
const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

type Language = 'en' | 'fr' | 'sw' | 'rn';
type Locale = 'en' | 'fr' | 'sw';

//Email copy per purpose and language. 'rn' falls back to English.
const COPY: Record<OtpPurpose, Record<Locale, { subject: string; line: string }>> = {
  SIGNUP: {
    en: { subject: 'is your Imara Afya code', line: 'Confirm your email address with this code.' },
    fr: {
      subject: 'est votre code Imara Afya',
      line: 'Confirmez votre adresse e-mail avec ce code.',
    },
    sw: {
      subject: 'ni namba yako ya Imara Afya',
      line: 'Thibitisha barua pepe yako kwa namba hii.',
    },
  },
  LOGIN: {
    en: { subject: '— new sign-in to Imara Afya', line: 'Use this code to finish signing in.' },
    fr: {
      subject: '— nouvelle connexion Imara Afya',
      line: 'Utilisez ce code pour terminer la connexion.',
    },
    sw: { subject: '— kuingia kupya Imara Afya', line: 'Tumia namba hii kumaliza kuingia.' },
  },
  RESET: {
    en: {
      subject: '— reset your Imara Afya password',
      line: 'Use this code to set a new password.',
    },
    fr: {
      subject: '— réinitialiser votre mot de passe',
      line: 'Utilisez ce code pour changer votre mot de passe.',
    },
    sw: { subject: '— badilisha nywila yako', line: 'Tumia namba hii kuweka nywila mpya.' },
  },
};

const WARNING: Record<Locale, string> = {
  en: "If this wasn't you, change your password.",
  fr: "Si ce n'était pas vous, changez votre mot de passe.",
  sw: 'Kama hukuwa wewe, badilisha nywila yako.',
};

const pickLocale = (language: Language): Locale =>
  language === 'fr' || language === 'sw' ? language : 'en';

export const sendOtpEmail = async (params: {
  to: string;
  code: string;
  purpose: OtpPurpose;
  language: Language;
}): Promise<void> => {
  const locale = pickLocale(params.language);
  const copy = COPY[params.purpose][locale];
  const warning = params.purpose === 'SIGNUP' ? '' : WARNING[locale];

  const subject = `${params.code} ${copy.subject}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f7f6;font-family:Helvetica,Arial,sans-serif;color:#14281f">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">${copy.line}</p>
    <p style="margin:0 0 20px;font-size:38px;letter-spacing:8px;font-weight:700;color:#1e5e45">${params.code}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#4a6b5c">This code expires in ${env.OTP_TTL_MINUTES} minutes.</p>
    ${warning ? `<p style="margin:16px 0 0;font-size:13px;color:#4a6b5c">${warning}</p>` : ''}
  </div>
</body></html>`;

  const text = [
    copy.line,
    '',
    params.code,
    '',
    `This code expires in ${env.OTP_TTL_MINUTES} minutes.`,
    warning,
  ]
    .filter(Boolean)
    .join('\n');

  //Development only: prints the code to the server log.
  if (!env.IS_PRODUCTION) {
    console.log(
      `\n  ================ ${params.purpose} CODE ================\n` +
        `   ${params.code}   for ${maskEmail(params.to)}\n` +
        `   valid ${env.OTP_TTL_MINUTES} minutes\n` +
        `  =====================================================\n`
    );
  }

  if (!env.RESEND_API_KEY) {
    if (env.IS_PRODUCTION) {
      console.error('[mail] not configured — could not send to', maskEmail(params.to));
      throw appError(
        ErrorCode.OTP_SEND_FAILED,
        'We could not send your code right now. Please try again shortly.'
      );
    }
    console.warn(`[mail] NOT CONFIGURED — code for ${maskEmail(params.to)} is ${params.code}`);
    return;
  }

  //Development only: MAIL_DEV_TO receives every code.
  const recipient = !env.IS_PRODUCTION && env.MAIL_DEV_TO ? env.MAIL_DEV_TO : params.to;
  const redirected = recipient !== params.to;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [recipient],
        subject: redirected ? `[${maskEmail(params.to)}] ${subject}` : subject,
        html,
        text,
        ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[mail] Resend refused:', response.status, detail.slice(0, 200));

      if (env.MAIL_FROM.endsWith('@resend.dev')) {
        console.error(
          '[mail] MAIL_FROM is the Resend TEST sender. It can only deliver to\n' +
            '       the address on your own Resend account. To reach anyone else,\n' +
            '       verify a domain at resend.com/domains and set MAIL_FROM to an\n' +
            '       address on it, e.g. MAIL_FROM="Imara Afya <codes@imaraco.ltd>".'
        );
      }
      throw appError(
        ErrorCode.OTP_SEND_FAILED,
        'We could not send your code right now. Please try again shortly.'
      );
    }

    console.log(
      redirected
        ? `[mail] sent ${params.purpose} code for ${maskEmail(params.to)} -> ${env.MAIL_DEV_TO} (dev redirect)`
        : `[mail] sent ${params.purpose} code to ${maskEmail(params.to)}`
    );
  } catch (error) {
    if (error instanceof GraphQLError) throw error;

    console.error('[mail] request failed:', error);
    throw appError(
      ErrorCode.OTP_SEND_FAILED,
      'We could not send your code right now. Please try again shortly.'
    );
  } finally {
    clearTimeout(timeout);
  }
};
