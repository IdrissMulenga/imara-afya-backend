//Error messages in en/fr/sw/rn, keyed by CODE or CODE.REASON.
//{name} is filled from the error's extensions; {field} is a FIELDS key.
import { ErrorCode, type ErrorCodeValue } from './errors.js';

export const LOCALES = ['en', 'fr', 'sw', 'rn'] as const;
export type Locale = (typeof LOCALES)[number];

type Key = ErrorCodeValue | `${ErrorCodeValue}.${string}`;
type Table = Partial<Record<Key, string>>;

const en: Table = {
  [ErrorCode.EMAIL_TAKEN]: 'That email address is already registered.',
  [ErrorCode.INVALID_EMAIL]: 'That email address does not look right.',
  [ErrorCode.WEAK_PASSWORD]: 'Your password needs at least {min} characters.',
  'WEAK_PASSWORD.TOO_LONG': 'That password is too long.',
  'WEAK_PASSWORD.BLANK': 'Your password cannot be only spaces.',
  [ErrorCode.INVALID_CREDENTIALS]: 'That email or password is not right.',
  [ErrorCode.EMAIL_NOT_VERIFIED]:
    'Please confirm your email address from the device you signed up on first.',
  [ErrorCode.ACCOUNT_NOT_FOUND]: 'That account no longer exists.',

  [ErrorCode.OTP_NOT_FOUND]: 'That code is no longer valid. Please ask for a new one.',
  'OTP_NOT_FOUND.OTHER_DEVICE': 'That code was for a different device. Please sign in again.',
  [ErrorCode.OTP_EXPIRED]: 'That code has expired. Please ask for a new one.',
  [ErrorCode.OTP_INCORRECT]: 'That code is not right.',
  [ErrorCode.OTP_ATTEMPTS_EXCEEDED]: 'Too many incorrect attempts. Please ask for a new code.',
  [ErrorCode.OTP_COOLDOWN]: 'Please wait a moment before asking for another code.',
  [ErrorCode.OTP_RESEND_LIMIT]: 'You have asked for too many codes. Please try again in an hour.',
  [ErrorCode.OTP_SEND_FAILED]: 'We could not send your code right now. Please try again shortly.',

  [ErrorCode.INVALID_RESET_TOKEN]: 'That reset request has expired. Please start again.',
  'INVALID_RESET_TOKEN.USED': 'That reset request has already been used. Please start again.',
  'INVALID_RESET_TOKEN.INVALID': 'That reset link is not valid.',
  [ErrorCode.WRONG_PASSWORD]: 'That is not your current password.',
  [ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED]:
    'Too many incorrect attempts. Please reset your password by email instead.',
  [ErrorCode.PASSWORD_UNCHANGED]: 'That is already your password. Please choose a different one.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please sign in.',
  [ErrorCode.TOKEN_REVOKED]: 'You have been signed out. Please sign in again.',
  [ErrorCode.UNAUTHENTICATED]: 'You need to be signed in.',
  'UNAUTHENTICATED.ACCOUNT_GONE': 'That account no longer exists.',
  [ErrorCode.FORBIDDEN]: 'You cannot do that.',

  [ErrorCode.DEVICE_NOT_FOUND]: 'That device is no longer on the list.',
  [ErrorCode.INVALID_DEVICE_ID]: 'That device identifier is not valid.',
  'INVALID_DEVICE_ID.MISSING': 'This request is missing its device identifier.',

  [ErrorCode.BAD_USER_INPUT]: 'Some of that is not valid. Please check and try again.',
  'BAD_USER_INPUT.NOT_IMAGE': 'That file is not an image we can read.',
  'BAD_USER_INPUT.NO_IMAGE': 'No image was received.',
  'BAD_USER_INPUT.IMAGE_TOO_LARGE': 'That image is too large. The limit is {max}MB.',
  'BAD_USER_INPUT.UPLOAD_REJECTED': 'That upload was not accepted.',
  'BAD_USER_INPUT.OUT_OF_RANGE': '{field} is out of range.',
  'BAD_USER_INPUT.TOO_LONG': '{field} is too long.',
  'BAD_USER_INPUT.INVALID_BIRTH_DATE': 'That date of birth is not valid.',
  'BAD_USER_INPUT.INVALID_TIMEZONE': 'That timezone is not recognised.',
  'BAD_USER_INPUT.INVALID_DAY': 'That date is not valid.',
  'BAD_USER_INPUT.FUTURE_DAY': 'You cannot log a day that has not happened yet.',
  'BAD_USER_INPUT.DAY_TOO_OLD': 'You can only log the last {maxDays} days.',
  [ErrorCode.NOT_FOUND]: 'We could not find that.',
  [ErrorCode.RATE_LIMITED]: 'Too many attempts. Please wait a moment and try again.',
  [ErrorCode.INTERNAL]: 'Something went wrong. Please try again.',
};

const fr: Table = {
  [ErrorCode.EMAIL_TAKEN]: 'Cette adresse e-mail est déjà utilisée.',
  [ErrorCode.INVALID_EMAIL]: 'Cette adresse e-mail ne semble pas valide.',
  [ErrorCode.WEAK_PASSWORD]: 'Votre mot de passe doit contenir au moins {min} caractères.',
  'WEAK_PASSWORD.TOO_LONG': 'Ce mot de passe est trop long.',
  'WEAK_PASSWORD.BLANK': 'Votre mot de passe ne peut pas contenir uniquement des espaces.',
  [ErrorCode.INVALID_CREDENTIALS]: 'Cet e-mail ou ce mot de passe est incorrect.',
  [ErrorCode.EMAIL_NOT_VERIFIED]:
    'Confirmez d’abord votre adresse e-mail depuis l’appareil utilisé pour l’inscription.',
  [ErrorCode.ACCOUNT_NOT_FOUND]: 'Ce compte n’existe plus.',

  [ErrorCode.OTP_NOT_FOUND]: 'Ce code n’est plus valable. Demandez-en un nouveau.',
  'OTP_NOT_FOUND.OTHER_DEVICE':
    'Ce code a été demandé depuis un autre appareil. Veuillez vous reconnecter.',
  [ErrorCode.OTP_EXPIRED]: 'Ce code a expiré. Demandez-en un nouveau.',
  [ErrorCode.OTP_INCORRECT]: 'Ce code est incorrect.',
  [ErrorCode.OTP_ATTEMPTS_EXCEEDED]: 'Trop de tentatives. Demandez un nouveau code.',
  [ErrorCode.OTP_COOLDOWN]: 'Patientez un instant avant de demander un autre code.',
  [ErrorCode.OTP_RESEND_LIMIT]: 'Vous avez demandé trop de codes. Réessayez dans une heure.',
  [ErrorCode.OTP_SEND_FAILED]: 'Impossible d’envoyer votre code pour le moment. Réessayez.',

  [ErrorCode.INVALID_RESET_TOKEN]: 'Cette demande a expiré. Veuillez recommencer.',
  'INVALID_RESET_TOKEN.USED': 'Cette demande a déjà été utilisée. Veuillez recommencer.',
  'INVALID_RESET_TOKEN.INVALID': 'Ce lien de réinitialisation n’est pas valide.',
  [ErrorCode.WRONG_PASSWORD]: 'Ce n’est pas votre mot de passe actuel.',
  [ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED]:
    'Trop de tentatives. Réinitialisez plutôt votre mot de passe par e-mail.',
  [ErrorCode.PASSWORD_UNCHANGED]: 'C’est déjà votre mot de passe. Choisissez-en un autre.',
  [ErrorCode.SESSION_EXPIRED]: 'Votre session a expiré. Veuillez vous reconnecter.',
  [ErrorCode.TOKEN_REVOKED]: 'Vous avez été déconnecté. Veuillez vous reconnecter.',
  [ErrorCode.UNAUTHENTICATED]: 'Vous devez être connecté.',
  'UNAUTHENTICATED.ACCOUNT_GONE': 'Ce compte n’existe plus.',
  [ErrorCode.FORBIDDEN]: 'Vous ne pouvez pas faire cela.',

  [ErrorCode.DEVICE_NOT_FOUND]: 'Cet appareil n’est plus dans la liste.',
  [ErrorCode.INVALID_DEVICE_ID]: 'Cet identifiant d’appareil n’est pas valide.',
  'INVALID_DEVICE_ID.MISSING': 'L’identifiant de l’appareil manque dans cette requête.',

  [ErrorCode.BAD_USER_INPUT]: 'Certaines informations ne sont pas valides. Vérifiez et réessayez.',
  'BAD_USER_INPUT.NOT_IMAGE': 'Ce fichier n’est pas une image lisible.',
  'BAD_USER_INPUT.NO_IMAGE': 'Aucune image n’a été reçue.',
  'BAD_USER_INPUT.IMAGE_TOO_LARGE': 'Cette image est trop lourde. La limite est de {max} Mo.',
  'BAD_USER_INPUT.UPLOAD_REJECTED': 'Cet envoi n’a pas été accepté.',
  'BAD_USER_INPUT.OUT_OF_RANGE': '{field} : valeur hors limites.',
  'BAD_USER_INPUT.TOO_LONG': '{field} : texte trop long.',
  'BAD_USER_INPUT.INVALID_BIRTH_DATE': 'Cette date de naissance n’est pas valide.',
  'BAD_USER_INPUT.INVALID_TIMEZONE': 'Ce fuseau horaire n’est pas reconnu.',
  'BAD_USER_INPUT.INVALID_DAY': 'Cette date n’est pas valide.',
  'BAD_USER_INPUT.FUTURE_DAY': 'Vous ne pouvez pas enregistrer un jour qui n’est pas encore passé.',
  'BAD_USER_INPUT.DAY_TOO_OLD': 'Vous ne pouvez enregistrer que les {maxDays} derniers jours.',
  [ErrorCode.NOT_FOUND]: 'Introuvable.',
  [ErrorCode.RATE_LIMITED]: 'Trop de tentatives. Patientez un instant puis réessayez.',
  [ErrorCode.INTERNAL]: 'Une erreur est survenue. Veuillez réessayer.',
};

const sw: Table = {
  [ErrorCode.EMAIL_TAKEN]: 'Barua pepe hiyo tayari imesajiliwa.',
  [ErrorCode.INVALID_EMAIL]: 'Barua pepe hiyo haionekani sahihi.',
  [ErrorCode.WEAK_PASSWORD]: 'Nywila yako inahitaji angalau herufi {min}.',
  'WEAK_PASSWORD.TOO_LONG': 'Nywila hiyo ni ndefu mno.',
  'WEAK_PASSWORD.BLANK': 'Nywila yako haiwezi kuwa nafasi tupu pekee.',
  [ErrorCode.INVALID_CREDENTIALS]: 'Barua pepe au nywila si sahihi.',
  [ErrorCode.EMAIL_NOT_VERIFIED]:
    'Tafadhali thibitisha barua pepe yako kwanza kwenye kifaa ulichojisajili.',
  [ErrorCode.ACCOUNT_NOT_FOUND]: 'Akaunti hiyo haipo tena.',

  [ErrorCode.OTP_NOT_FOUND]: 'Namba hiyo haifai tena. Tafadhali omba mpya.',
  'OTP_NOT_FOUND.OTHER_DEVICE': 'Namba hiyo iliombwa kwenye kifaa kingine. Tafadhali ingia tena.',
  [ErrorCode.OTP_EXPIRED]: 'Namba hiyo imeisha muda. Tafadhali omba mpya.',
  [ErrorCode.OTP_INCORRECT]: 'Namba hiyo si sahihi.',
  [ErrorCode.OTP_ATTEMPTS_EXCEEDED]: 'Majaribio mengi yasiyo sahihi. Omba namba mpya.',
  [ErrorCode.OTP_COOLDOWN]: 'Subiri kidogo kabla ya kuomba namba nyingine.',
  [ErrorCode.OTP_RESEND_LIMIT]: 'Umeomba namba nyingi mno. Jaribu tena baada ya saa moja.',
  [ErrorCode.OTP_SEND_FAILED]: 'Hatukuweza kutuma namba yako sasa. Jaribu tena punde.',

  [ErrorCode.INVALID_RESET_TOKEN]: 'Ombi hilo limeisha muda. Tafadhali anza upya.',
  'INVALID_RESET_TOKEN.USED': 'Ombi hilo tayari limetumika. Tafadhali anza upya.',
  'INVALID_RESET_TOKEN.INVALID': 'Kiungo hicho cha kuweka upya si sahihi.',
  [ErrorCode.WRONG_PASSWORD]: 'Hiyo si nywila yako ya sasa.',
  [ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED]:
    'Majaribio mengi mno. Tafadhali weka upya nywila kwa barua pepe.',
  [ErrorCode.PASSWORD_UNCHANGED]: 'Hiyo tayari ni nywila yako. Chagua nyingine.',
  [ErrorCode.SESSION_EXPIRED]: 'Kipindi chako kimeisha. Tafadhali ingia tena.',
  [ErrorCode.TOKEN_REVOKED]: 'Umetolewa. Tafadhali ingia tena.',
  [ErrorCode.UNAUTHENTICATED]: 'Unahitaji kuingia.',
  'UNAUTHENTICATED.ACCOUNT_GONE': 'Akaunti hiyo haipo tena.',
  [ErrorCode.FORBIDDEN]: 'Huwezi kufanya hivyo.',

  [ErrorCode.DEVICE_NOT_FOUND]: 'Kifaa hicho hakipo tena kwenye orodha.',
  [ErrorCode.INVALID_DEVICE_ID]: 'Kitambulisho cha kifaa si sahihi.',
  'INVALID_DEVICE_ID.MISSING': 'Ombi hili halina kitambulisho cha kifaa.',

  [ErrorCode.BAD_USER_INPUT]: 'Baadhi ya taarifa si sahihi. Angalia kisha ujaribu tena.',
  'BAD_USER_INPUT.NOT_IMAGE': 'Faili hilo si picha tunayoweza kusoma.',
  'BAD_USER_INPUT.NO_IMAGE': 'Hakuna picha iliyopokelewa.',
  'BAD_USER_INPUT.IMAGE_TOO_LARGE': 'Picha hiyo ni kubwa mno. Kikomo ni MB {max}.',
  'BAD_USER_INPUT.UPLOAD_REJECTED': 'Upakiaji huo haukukubaliwa.',
  'BAD_USER_INPUT.OUT_OF_RANGE': '{field}: thamani iko nje ya kiwango.',
  'BAD_USER_INPUT.TOO_LONG': '{field}: maandishi ni marefu mno.',
  'BAD_USER_INPUT.INVALID_BIRTH_DATE': 'Tarehe hiyo ya kuzaliwa si sahihi.',
  'BAD_USER_INPUT.INVALID_TIMEZONE': 'Saa za eneo hilo hazitambuliki.',
  'BAD_USER_INPUT.INVALID_DAY': 'Tarehe hiyo si sahihi.',
  'BAD_USER_INPUT.FUTURE_DAY': 'Huwezi kuandika siku ambayo bado haijafika.',
  'BAD_USER_INPUT.DAY_TOO_OLD': 'Unaweza kuandika siku {maxDays} zilizopita tu.',
  [ErrorCode.NOT_FOUND]: 'Hatukuipata.',
  [ErrorCode.RATE_LIMITED]: 'Majaribio mengi mno. Subiri kidogo kisha ujaribu tena.',
  [ErrorCode.INTERNAL]: 'Kuna hitilafu. Tafadhali jaribu tena.',
};

const rn: Table = {
  [ErrorCode.EMAIL_TAKEN]: 'Iyo meyili isanzwe yanditswe.',
  [ErrorCode.INVALID_EMAIL]: 'Iyo meyili ntisa n’iyemewe.',
  [ErrorCode.WEAK_PASSWORD]: 'Ijambo ryibanga rikeneye nibura inyuguti {min}.',
  'WEAK_PASSWORD.TOO_LONG': 'Iryo jambo ryibanga ni rirerire cane.',
  'WEAK_PASSWORD.BLANK': 'Ijambo ryibanga ntirishobora kuba ibibanza gusa.',
  [ErrorCode.INVALID_CREDENTIALS]: 'Iyo meyili canke iryo jambo ryibanga si vyo.',
  [ErrorCode.EMAIL_NOT_VERIFIED]:
    'Banza wemeze imeyili yawe ukoresheje igikoresho wiyandikishijeko.',
  [ErrorCode.ACCOUNT_NOT_FOUND]: 'Iyo konte ntikiriho.',

  [ErrorCode.OTP_NOT_FOUND]: 'Izo nomero ntizigikora. Saba izindi.',
  'OTP_NOT_FOUND.OTHER_DEVICE': 'Izo nomero zasabwe ku kindi gikoresho. Injira bushasha.',
  [ErrorCode.OTP_EXPIRED]: 'Izo nomero zararangiye. Saba izindi.',
  [ErrorCode.OTP_INCORRECT]: 'Izo nomero si zo.',
  [ErrorCode.OTP_ATTEMPTS_EXCEEDED]: 'Waragerageje kenshi. Saba izindi nomero.',
  [ErrorCode.OTP_COOLDOWN]: 'Rindira gato imbere yo gusaba izindi nomero.',
  [ErrorCode.OTP_RESEND_LIMIT]: 'Wasavye nomero nyinshi cane. Gerageza mu isaha imwe.',
  [ErrorCode.OTP_SEND_FAILED]: 'Ntitwashoboye kurungika nomero zawe ubu. Gerageza bukebuke.',

  [ErrorCode.INVALID_RESET_TOKEN]: 'Ico gisabisho carangiye. Tangura bushasha.',
  'INVALID_RESET_TOKEN.USED': 'Ico gisabisho carakoreshejwe. Tangura bushasha.',
  'INVALID_RESET_TOKEN.INVALID': 'Ico gisabisho si co.',
  [ErrorCode.WRONG_PASSWORD]: 'Iryo si ryo jambo ryibanga usanzwe ufise.',
  [ErrorCode.PASSWORD_ATTEMPTS_EXCEEDED]:
    'Waragerageje kenshi cane. Hindura ijambo ryibanga ukoresheje imeyili.',
  [ErrorCode.PASSWORD_UNCHANGED]: 'Iryo ni ryo usanzwe ufise. Hitamwo irindi.',
  [ErrorCode.SESSION_EXPIRED]: 'Igihe cawe carangiye. Injira bushasha.',
  [ErrorCode.TOKEN_REVOKED]: 'Warasohowe. Injira bushasha.',
  [ErrorCode.UNAUTHENTICATED]: 'Utegerezwa kwinjira.',
  'UNAUTHENTICATED.ACCOUNT_GONE': 'Iyo konte ntikiriho.',
  [ErrorCode.FORBIDDEN]: 'Ntushobora gukora ivyo.',

  [ErrorCode.DEVICE_NOT_FOUND]: 'Ico gikoresho ntikiri ku rutonde.',
  [ErrorCode.INVALID_DEVICE_ID]: 'Ico kiranga igikoresho si co.',
  'INVALID_DEVICE_ID.MISSING': 'Iki gisabisho ntikirimwo ikiranga igikoresho.',

  [ErrorCode.BAD_USER_INPUT]: 'Bimwe muri ivyo si vyo. Raba hanyuma ugerageze.',
  'BAD_USER_INPUT.NOT_IMAGE': 'Iyo dosiye si ifoto dushobora gusoma.',
  'BAD_USER_INPUT.NO_IMAGE': 'Nta foto yashitse.',
  'BAD_USER_INPUT.IMAGE_TOO_LARGE': 'Iyo foto ni nini cane. Urugero ni MB {max}.',
  'BAD_USER_INPUT.UPLOAD_REJECTED': 'Ivyo warungitse ntivyemewe.',
  'BAD_USER_INPUT.OUT_OF_RANGE': '{field}: igitigiri kiri hanze y’urugero.',
  'BAD_USER_INPUT.TOO_LONG': '{field}: ni kirekire cane.',
  'BAD_USER_INPUT.INVALID_BIRTH_DATE': 'Iyo tarike y’ivuka si yo.',
  'BAD_USER_INPUT.INVALID_TIMEZONE': 'Iyo saha y’akarere ntiyamenyekanye.',
  'BAD_USER_INPUT.INVALID_DAY': 'Iyo tarike si yo.',
  'BAD_USER_INPUT.FUTURE_DAY': 'Ntushobora kwandika umusi utarashika.',
  'BAD_USER_INPUT.DAY_TOO_OLD': 'Ushobora kwandika imisi {maxDays} iheze gusa.',
  [ErrorCode.NOT_FOUND]: 'Ntitwabironse.',
  [ErrorCode.RATE_LIMITED]: 'Wagerageje kenshi cane. Rindira gato hanyuma ugerageze.',
  [ErrorCode.INTERNAL]: 'Hari ikitagenze neza. Gerageza bushasha.',
};

const TABLES: Record<Locale, Table> = { en, fr, sw, rn };

//Field labels for {field} placeholders.
export const FIELDS = {
  name: { en: 'Name', fr: 'Nom', sw: 'Jina', rn: 'Izina' },
  height: { en: 'Height', fr: 'Taille', sw: 'Urefu', rn: 'Uburebure' },
  weight: { en: 'Weight', fr: 'Poids', sw: 'Uzito', rn: 'Uburemere' },
  waterGoal: {
    en: 'Water goal',
    fr: 'Objectif d’eau',
    sw: 'Lengo la maji',
    rn: 'Intumbero y’amazi',
  },
  stepGoal: {
    en: 'Step goal',
    fr: 'Objectif de pas',
    sw: 'Lengo la hatua',
    rn: 'Intumbero y’intambwe',
  },
  sleepGoal: {
    en: 'Sleep goal',
    fr: 'Objectif de sommeil',
    sw: 'Lengo la usingizi',
    rn: 'Intumbero y’ibitotsi',
  },
  water: { en: 'Water', fr: 'Eau', sw: 'Maji', rn: 'Amazi' },
  steps: { en: 'Steps', fr: 'Pas', sw: 'Hatua', rn: 'Intambwe' },
  sleep: { en: 'Sleep', fr: 'Sommeil', sw: 'Usingizi', rn: 'Ibitotsi' },
  deviceName: {
    en: 'Device name',
    fr: 'Nom de l’appareil',
    sw: 'Jina la kifaa',
    rn: 'Izina ry’igikoresho',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type Field = keyof typeof FIELDS;

//First recognised language in Accept-Language; English otherwise.
export const pickLocale = (header?: string | null): Locale => {
  if (!header) return 'en';

  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0] as Locale;
    if ((LOCALES as readonly string[]).includes(base)) return base;
  }
  return 'en';
};

const fill = (template: string, extensions: Record<string, unknown>, locale: Locale) => {
  let complete = true;
  const text = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = extensions[name];
    if (name === 'field') {
      const labels = typeof value === 'string' ? FIELDS[value as Field] : undefined;
      if (labels) return labels[locale];
    } else if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    complete = false;
    return '';
  });
  return complete ? text : undefined;
};

//The translated message for an error, or undefined to keep the original.
export const messageFor = (
  locale: Locale,
  extensions: Record<string, unknown> | undefined
): string | undefined => {
  const code = extensions?.code;
  if (typeof code !== 'string') return undefined;

  const reason = extensions?.reason;
  const key = (typeof reason === 'string' ? `${code}.${reason}` : code) as Key;
  const template = TABLES[locale][key];
  return template ? fill(template, extensions ?? {}, locale) : undefined;
};

//Translates a message for express responses outside GraphQL.
export const translate = (
  message: string,
  extensions: Record<string, unknown>,
  acceptLanguage: string | undefined
): string => {
  const locale = pickLocale(acceptLanguage);
  if (locale === 'en') return message;
  return messageFor(locale, extensions) ?? message;
};

//The English label for a field.
export const fieldName = (field: Field): string => FIELDS[field].en;
