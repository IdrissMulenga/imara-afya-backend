import type { OtpPurpose } from '../../../domain/auth/entities/otp.entity.js';
import type { User } from '../../../domain/auth/entities/user.entity.js';
import type { MailService } from '../ports/mail.port.js';
import type { AuthPolicy } from '../ports/auth-policy.port.js';
import type { OtpService } from './otp.service.js';

//ISSUE A CODE AND SEND IT.
//
//Pairing these two steps is the whole job. Five use cases need it, and doing
//it by hand each time is how one of them ends up issuing a code it never sends.
//
//TWO DELIVERY GUARANTEES, TWO FUNCTIONS — not one function with a flag. A
//boolean that changes error semantics makes both call sites harder to read
//than a name that says which one you get.

export interface CodeDeliveryDeps {
  otpService: OtpService;
  mail: MailService;
  policy: AuthPolicy;
  onDeliveryFailure?: (context: { purpose: OtpPurpose; error: unknown }) => void;
}

interface DeliverParams {
  user: User;
  purpose: OtpPurpose;
  ip: string;
  deviceId?: string | null;
  skipResendGuard?: boolean;
}

export const createCodeDelivery = (deps: CodeDeliveryDeps) => {
  const { otpService, mail, policy, onDeliveryFailure } = deps;

  const issueAndSend = async (params: DeliverParams): Promise<Date> => {
    const { code, expiresAt } = await otpService.issue({
      userId: params.user.id,
      purpose: params.purpose,
      ip: params.ip,
      deviceId: params.deviceId,
      skipResendGuard: params.skipResendGuard,
    });

    await mail.sendOtp({
      to: params.user.email,
      code,
      purpose: params.purpose,
      language: params.user.language,
      expiryMinutes: policy.otpTtlMinutes,
    });

    return expiresAt;
  };

  //Delivery failure propagates. Use this wherever the user is waiting on the
  //code and has no other way forward.
  const deliver = (params: DeliverParams): Promise<Date> => issueAndSend(params);

  //Delivery failure is logged and swallowed. Use this ONLY where the work that
  //already succeeded must stand regardless — signup, where the account exists
  //and the session is valid whether or not the email lands, and the app offers
  //a resend.
  const deliverBestEffort = async (params: DeliverParams): Promise<void> => {
    try {
      await issueAndSend(params);
    } catch (error) {
      onDeliveryFailure?.({ purpose: params.purpose, error });
    }
  };

  return { deliver, deliverBestEffort };
};

export type CodeDelivery = ReturnType<typeof createCodeDelivery>;
