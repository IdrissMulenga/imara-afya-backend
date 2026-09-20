import type { OtpPurpose } from '../../../domain/auth/entities/otp.entity.js';
import type { Language } from '../../../domain/auth/entities/user.entity.js';

//SENDING A ONE-TIME CODE.
//
//The application says what must be delivered; infrastructure decides how. The
//language comes from the user, so the provider owns the copy — a use case
//should never be assembling an email body.

export interface OtpMessage {
  to: string;
  code: string;
  purpose: OtpPurpose;
  language: Language;
  expiryMinutes: number;
}

export interface MailService {
  //Throws on failure. Callers that can tolerate a miss catch it explicitly —
  //a swallowed failure inside the provider would hide a dead mail
  //configuration from every flow at once.
  sendOtp(message: OtpMessage): Promise<void>;
}
