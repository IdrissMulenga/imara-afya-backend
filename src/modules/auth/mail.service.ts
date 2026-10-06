import { GraphQLError } from 'graphql';
import { env } from '../../config/env.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import type { OtpPurpose } from './otp.model.js';
import { maskEmail } from '../../shared/validation.js';
import { exportEmail, otpEmail, type EmailLinks, type Language } from './mail.templates.js';

//Sends one-time codes and the data export by email through Resend.
const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 30_000;

type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string }[];
  //What is being sent, for the logs ("SIGNUP code", "data export").
  label: string;
  //Logged in development when no key is set.
  unsentNote: string;
  //The error thrown when it cannot be sent.
  failure: () => GraphQLError;
};

//Sends one email through Resend. Development without a key logs it instead; development
//delivery failures are logged, not thrown.
const deliver = async (mail: Mail): Promise<void> => {
  if (!env.RESEND_API_KEY) {
    if (env.IS_PRODUCTION) {
      console.error('[mail] not configured — could not send to', maskEmail(mail.to));
      throw mail.failure();
    }
    console.warn(`[mail] NOT CONFIGURED — ${mail.unsentNote}`);
    return;
  }

  //Development only: MAIL_DEV_TO receives every email.
  const recipient = !env.IS_PRODUCTION && env.MAIL_DEV_TO ? env.MAIL_DEV_TO : mail.to;
  const redirected = recipient !== mail.to;

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
        subject: redirected ? `[${maskEmail(mail.to)}] ${mail.subject}` : mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.attachments ? { attachments: mail.attachments } : {}),
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
      throw mail.failure();
    }

    console.log(
      redirected
        ? `[mail] sent ${mail.label} for ${maskEmail(mail.to)} -> ${env.MAIL_DEV_TO} (dev redirect)`
        : `[mail] sent ${mail.label} to ${maskEmail(mail.to)}`
    );
  } catch (error) {
    if (!env.IS_PRODUCTION) {
      console.warn(`[mail] delivery failed in development (${mail.label}):`, error);
      return;
    }
    if (error instanceof GraphQLError) throw error;

    console.error('[mail] request failed:', error);
    throw mail.failure();
  } finally {
    clearTimeout(timeout);
  }
};

//The site and support address the emails link to.
const emailLinks = (): EmailLinks => ({ publicUrl: env.PUBLIC_URL, support: env.MAIL_REPLY_TO });

const codeFailure = () =>
  appError(
    ErrorCode.OTP_SEND_FAILED,
    'We could not send your code right now. Please try again shortly.'
  );

//Emails a code in the user's language (logs it instead in development without a key).
export const sendOtpEmail = async (params: {
  to: string;
  code: string;
  purpose: OtpPurpose;
  language: Language;
}): Promise<void> => {
  const { subject, html, text } = otpEmail({
    code: params.code,
    purpose: params.purpose,
    language: params.language,
    minutes: env.OTP_TTL_MINUTES,
    links: emailLinks(),
  });

  //Development only: prints the code to the server log.
  if (!env.IS_PRODUCTION) {
    console.log(
      `\n  ================ ${params.purpose} CODE ================\n` +
        `   ${params.code}   for ${maskEmail(params.to)}\n` +
        `   valid ${env.OTP_TTL_MINUTES} minutes\n` +
        `  =====================================================\n`
    );
  }

  await deliver({
    to: params.to,
    subject,
    html,
    text,
    label: `${params.purpose} code`,
    unsentNote: `code for ${maskEmail(params.to)} is ${params.code}`,
    failure: codeFailure,
  });
};

//Emails the user's data as a JSON attachment.
export const sendDataExportEmail = async (params: {
  to: string;
  language: Language;
  filename: string;
  json: string;
}): Promise<void> => {
  const { subject, html, text } = exportEmail({ language: params.language, links: emailLinks() });

  await deliver({
    to: params.to,
    subject,
    html,
    text,
    attachments: [
      { filename: params.filename, content: Buffer.from(params.json, 'utf8').toString('base64') },
    ],
    label: 'data export',
    unsentNote: `data export for ${maskEmail(params.to)} not sent (${params.json.length} characters)`,
    failure: () =>
      appError(
        ErrorCode.EXPORT_SEND_FAILED,
        'We could not email your data right now. Please try again shortly.'
      ),
  });
};
