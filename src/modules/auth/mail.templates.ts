import type { OtpPurpose } from './otp.model.js';

export type Language = 'en' | 'fr' | 'sw' | 'rn';

//A finished email: subject, HTML body and plain-text alternative.
export type EmailContent = { subject: string; html: string; text: string };

//Where links and the logo point, and who users can write to.
export type EmailLinks = {
  //Public site origin, e.g. https://afya.imaracompany.com; without it the email has no logo or links.
  publicUrl?: string;
  //Support address shown in the footer.
  support?: string;
};

const BRAND = 'Imara Afya';
const COMPANY = 'Imara Company · Bujumbura, Burundi';

//Colours from the app's theme.
const C = {
  page: '#F6F7F9',
  card: '#FFFFFF',
  border: '#E3E8EF',
  navy: '#0F3A72',
  blue: '#1B5AAE',
  text: '#13233A',
  muted: '#5C6B7F',
  codeBg: '#EEF4FC',
  codeBorder: '#C9DAF2',
  noteBg: '#FFF8E6',
  noteBorder: '#E5A100',
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',Menlo,Consolas,'Courier New',monospace";

//Code email copy per purpose and language.
const OTP_COPY: Record<
  OtpPurpose,
  Record<Language, { subject: string; heading: string; line: string }>
> = {
  SIGNUP: {
    en: {
      subject: 'is your Imara Afya code',
      heading: 'Confirm your email',
      line: 'Welcome to Imara Afya. Enter this code in the app to confirm your email address.',
    },
    fr: {
      subject: 'est votre code Imara Afya',
      heading: 'Confirmez votre e-mail',
      line: 'Bienvenue sur Imara Afya. Saisissez ce code dans l’application pour confirmer votre adresse e-mail.',
    },
    sw: {
      subject: 'ni namba yako ya Imara Afya',
      heading: 'Thibitisha barua pepe yako',
      line: 'Karibu Imara Afya. Weka namba hii kwenye programu ili kuthibitisha barua pepe yako.',
    },
    rn: {
      subject: 'ni zo nomero zawe za Imara Afya',
      heading: 'Emeza imeyili yawe',
      line: 'Kaze muri Imara Afya. Andika izi nomero muri porogaramu kugira wemeze imeyili yawe.',
    },
  },
  LOGIN: {
    en: {
      subject: '— new sign-in to Imara Afya',
      heading: 'New sign-in',
      line: 'Someone is signing in to your Imara Afya account on a new phone. Enter this code in the app to finish signing in.',
    },
    fr: {
      subject: '— nouvelle connexion Imara Afya',
      heading: 'Nouvelle connexion',
      line: 'Une connexion à votre compte Imara Afya est en cours sur un nouveau téléphone. Saisissez ce code dans l’application pour la terminer.',
    },
    sw: {
      subject: '— kuingia kupya Imara Afya',
      heading: 'Kuingia kupya',
      line: 'Mtu anaingia kwenye akaunti yako ya Imara Afya kwa simu mpya. Weka namba hii kwenye programu kumaliza kuingia.',
    },
    rn: {
      subject: '— kwinjira gushasha muri Imara Afya',
      heading: 'Kwinjira gushasha',
      line: 'Hari uriko arinjira kuri konti yawe ya Imara Afya kuri telefone nshasha. Andika izi nomero muri porogaramu kugira uheze kwinjira.',
    },
  },
  RESET: {
    en: {
      subject: '— reset your Imara Afya password',
      heading: 'Reset your password',
      line: 'Enter this code in the app to choose a new password for your Imara Afya account.',
    },
    fr: {
      subject: '— réinitialiser votre mot de passe',
      heading: 'Réinitialisez votre mot de passe',
      line: 'Saisissez ce code dans l’application pour choisir un nouveau mot de passe pour votre compte Imara Afya.',
    },
    sw: {
      subject: '— badilisha nywila yako',
      heading: 'Badilisha nywila yako',
      line: 'Weka namba hii kwenye programu ili kuchagua nywila mpya ya akaunti yako ya Imara Afya.',
    },
    rn: {
      subject: '— hindura ijambo ryibanga ryawe',
      heading: 'Hindura ijambo ryibanga ryawe',
      line: 'Andika izi nomero muri porogaramu kugira uhitemwo ijambo ryibanga rishasha rya konti yawe ya Imara Afya.',
    },
  },
};

//Words shared by every email, per language.
const COMMON: Record<
  Language,
  {
    codeLabel: string;
    expires: (minutes: number) => string;
    neverShare: string;
    notYou: string;
    ignore: string;
    why: string;
    help: string;
    privacy: string;
    terms: string;
  }
> = {
  en: {
    codeLabel: 'Your code',
    expires: (m) => `This code expires in ${m} minutes and can be used once.`,
    neverShare:
      'Never share this code. Imara Afya will never ask you for it by phone, SMS or email.',
    notYou: 'If this wasn’t you, change your password in the app.',
    ignore: 'If you didn’t request this code, you can ignore this email.',
    why: 'You received this email because this address was used on Imara Afya.',
    help: 'Questions? Write to',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  fr: {
    codeLabel: 'Votre code',
    expires: (m) => `Ce code expire dans ${m} minutes et ne peut servir qu’une fois.`,
    neverShare:
      'Ne partagez jamais ce code. Imara Afya ne vous le demandera jamais par téléphone, SMS ou e-mail.',
    notYou: 'Si ce n’était pas vous, changez votre mot de passe dans l’application.',
    ignore: 'Si vous n’avez pas demandé ce code, vous pouvez ignorer cet e-mail.',
    why: 'Vous recevez cet e-mail car cette adresse a été utilisée sur Imara Afya.',
    help: 'Des questions ? Écrivez à',
    privacy: 'Confidentialité',
    terms: 'Conditions',
  },
  sw: {
    codeLabel: 'Namba yako',
    expires: (m) => `Namba hii itaisha muda baada ya dakika ${m} na inatumika mara moja tu.`,
    neverShare:
      'Usimpe mtu yeyote namba hii. Imara Afya haitakuuliza kamwe kwa simu, SMS au barua pepe.',
    notYou: 'Kama hukuwa wewe, badilisha nywila yako kwenye programu.',
    ignore: 'Kama hukuomba namba hii, unaweza kupuuza barua pepe hii.',
    why: 'Umepokea barua pepe hii kwa sababu anwani hii ilitumika kwenye Imara Afya.',
    help: 'Maswali? Andika kwa',
    privacy: 'Faragha',
    terms: 'Masharti',
  },
  rn: {
    codeLabel: 'Inomero zawe',
    expires: (m) => `Izi nomero zizorangira mu minota ${m}, kandi zikoreshwa rimwe gusa.`,
    neverShare:
      'Ntihagire uwo uha izi nomero. Imara Afya ntizokwigera izigusaba kuri telefone, SMS canke imeyili.',
    notYou: 'Nimba atari wewe, hindura ijambo ryibanga ryawe muri porogaramu.',
    ignore: 'Nimba utasavye izi nomero, ushobora kwirengagiza iyi imeyili.',
    why: 'Uronse iyi imeyili kubera ko iyi aderese yakoreshejwe kuri Imara Afya.',
    help: 'Ufise ibibazo? Andikira',
    privacy: 'Ibanga',
    terms: 'Amategeko',
  },
};

//The data export email, per language.
const EXPORT_COPY: Record<
  Language,
  { subject: string; heading: string; line: string; care: string }
> = {
  en: {
    subject: 'Your Imara Afya data',
    heading: 'Your data is attached',
    line: 'Here is a copy of everything Imara Afya holds about you, attached as a file you can open with any text editor.',
    care: 'It includes your health records. Keep it somewhere private, and do not forward it to anyone you do not trust.',
  },
  fr: {
    subject: 'Vos données Imara Afya',
    heading: 'Vos données sont en pièce jointe',
    line: 'Voici une copie de tout ce qu’Imara Afya conserve sur vous, en pièce jointe, lisible avec n’importe quel éditeur de texte.',
    care: 'Elle contient vos données de santé. Gardez-la en lieu sûr et ne la transférez qu’à des personnes de confiance.',
  },
  sw: {
    subject: 'Data yako ya Imara Afya',
    heading: 'Data yako imeambatishwa',
    line: 'Hii ni nakala ya kila kitu Imara Afya inachohifadhi kukuhusu, kama faili iliyoambatishwa unayoweza kufungua kwa programu yoyote ya maandishi.',
    care: 'Ina kumbukumbu zako za afya. Ihifadhi mahali pa faragha, na usiitume kwa mtu usiyemwamini.',
  },
  rn: {
    subject: 'Amakuru yawe ya Imara Afya',
    heading: 'Amakuru yawe ari ku mugereka',
    line: 'Iyi ni kopi y’ivyo Imara Afya ibika vyose ku bikwerekeye, nk’idosiye ifatanijwe ushobora kwugurura n’iporogaramu iyo ari yo yose y’inyandiko.',
    care: 'Irimwo amakuru y’amagara yawe. Yibike ahantu h’ibanga, ntuyirungikire uwo utizigira.',
  },
};

//Escapes text for HTML.
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

//A public site origin without a trailing slash, or undefined when unset or not http(s).
const originOf = (url?: string): string | undefined => {
  const trimmed = url?.trim().replace(/\/+$/, '');
  return trimmed && /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) ? trimmed : undefined;
};

//The shared email frame: logo header, white card with `content`, and the footer.
const layout = (params: {
  language: Language;
  preheader: string;
  content: string;
  links: EmailLinks;
}): string => {
  const words = COMMON[params.language];
  const origin = originOf(params.links.publicUrl);
  const support = params.links.support ? escapeHtml(params.links.support) : '';
  const link = (href: string, label: string) =>
    `<a href="${href}" style="color:${C.muted};text-decoration:underline">${label}</a>`;

  const logo = origin
    ? `<img src="${origin}/email/logo.png" width="48" height="48" alt="" style="display:block;border:0;width:48px;height:48px;border-radius:12px">`
    : '';
  const footerLinks = origin
    ? `${link(`${origin}/privacy`, words.privacy)} &nbsp;·&nbsp; ${link(`${origin}/terms`, words.terms)}`
    : '';

  return `<!doctype html>
<html lang="${params.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td style="padding:0 4px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${logo ? `<td style="padding-right:12px;vertical-align:middle">${logo}</td>` : ''}
        <td style="vertical-align:middle;font-family:${FONT};font-size:20px;font-weight:700;color:${C.navy};letter-spacing:-0.2px">${BRAND}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:5px;line-height:5px;font-size:0;background:${C.blue}">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 28px;font-family:${FONT};color:${C.text}">${params.content}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
      ${words.why}<br>
      ${support ? `${words.help} <a href="mailto:${support}" style="color:${C.blue};text-decoration:none">${support}</a><br>` : ''}
      ${footerLinks ? `${footerLinks}<br>` : ''}
      ${COMPANY}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
};

//A highlighted note, used for safety messages.
const note = (lines: string[]): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
<tr><td style="background:${C.noteBg};border-left:4px solid ${C.noteBorder};border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.55;color:${C.text}">
${lines.join('<br>')}
</td></tr></table>`;

//The one-time code email for a purpose, in the user's language.
export const otpEmail = (params: {
  code: string;
  purpose: OtpPurpose;
  language: Language;
  minutes: number;
  links: EmailLinks;
}): EmailContent => {
  const copy = OTP_COPY[params.purpose][params.language];
  const words = COMMON[params.language];
  const code = escapeHtml(params.code);
  const expires = words.expires(params.minutes);
  //Sign-in and reset codes can mean someone else has the password.
  const safety = params.purpose === 'SIGNUP' ? words.ignore : words.notYou;

  const content = `
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${C.text}">${copy.heading}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${C.muted}">${copy.line}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:${C.codeBg};border:1px solid ${C.codeBorder};border-radius:12px;padding:20px 12px">
  <div style="font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};margin-bottom:8px">${words.codeLabel}</div>
  <div style="font-family:${MONO};font-size:36px;line-height:1.2;font-weight:700;letter-spacing:10px;color:${C.navy};padding-left:10px">${code}</div>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${C.muted};text-align:center">${expires}</p>
${note([words.neverShare, safety])}`;

  return {
    subject: `${params.code} ${copy.subject}`,
    html: layout({
      language: params.language,
      preheader: `${words.codeLabel}: ${params.code} · ${expires}`,
      content,
      links: params.links,
    }),
    text: [
      copy.heading,
      '',
      copy.line,
      '',
      `${words.codeLabel}: ${params.code}`,
      expires,
      '',
      words.neverShare,
      safety,
      '',
      '—',
      `${BRAND} · ${COMPANY}`,
      ...(params.links.support ? [`${words.help} ${params.links.support}`] : []),
    ].join('\n'),
  };
};

//The data export email, in the user's language.
export const exportEmail = (params: { language: Language; links: EmailLinks }): EmailContent => {
  const copy = EXPORT_COPY[params.language];
  const content = `
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${C.text}">${copy.heading}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.muted}">${copy.line}</p>
${note([copy.care])}`;

  return {
    subject: copy.subject,
    html: layout({ language: params.language, preheader: copy.line, content, links: params.links }),
    text: [
      copy.heading,
      '',
      copy.line,
      '',
      copy.care,
      '',
      '—',
      `${BRAND} · ${COMPANY}`,
      ...(params.links.support ? [`${COMMON[params.language].help} ${params.links.support}`] : []),
    ].join('\n'),
  };
};
