import type { OtpPurpose } from '../../domain/auth/entities/otp.entity.js';
import type { Language } from '../../domain/auth/entities/user.entity.js';

//THE COPY, AND THE RULES ABOUT IT.
//
//Kirundi is deliberately absent: the app's Kirundi strings are machine-drafted
//and unreviewed, and a mistranslated security email is worse than an English
//one the user can puzzle out. `rn` falls back to English here.

type Locale = 'en' | 'fr' | 'sw';

const COPY: Record<OtpPurpose, Record<Locale, { subject: string; line: string }>> = {
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

const WARNING: Record<Locale, string> = {
  en: "If this wasn't you, change your password.",
  fr: "Si ce n'était pas vous, changez votre mot de passe.",
  sw: 'Kama hukuwa wewe, badilisha nywila yako.',
};

const localeFor = (language: Language): Locale =>
  language === 'fr' || language === 'sw' ? language : 'en';

export interface RenderedOtpEmail {
  subject: string;
  html: string;
  text: string;
}

export const renderOtpEmail = (params: {
  code: string;
  purpose: OtpPurpose;
  language: Language;
  expiryMinutes: number;
}): RenderedOtpEmail => {
  const locale = localeFor(params.language);
  const copy = COPY[params.purpose][locale];

  //SIGNUP carries no warning line, because nothing has been compromised yet.
  const warning = params.purpose === 'SIGNUP' ? undefined : WARNING[locale];

  //The code leads the subject. On a notification preview or a feature phone
  //that is often all the user will ever see.
  const subject = `${params.code} ${copy.subject}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f7f6;font-family:Helvetica,Arial,sans-serif;color:#14281f">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">${copy.line}</p>
    <p style="margin:0 0 20px;font-size:38px;letter-spacing:8px;font-weight:700;color:#1e5e45">${params.code}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#4a6b5c">This code expires in ${params.expiryMinutes} minutes.</p>
    ${warning ? `<p style="margin:16px 0 0;font-size:13px;color:#4a6b5c">${warning}</p>` : ''}
  </div>
  <p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#8ba396;text-align:center">Imara Afya</p>
</body></html>`;

  //A plain-text alternative always goes alongside the HTML. Entry-level
  //Android mail clients handle it better, and it renders on a slow connection.
  const text = [
    copy.line,
    '',
    params.code,
    '',
    `This code expires in ${params.expiryMinutes} minutes.`,
    warning ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
};
