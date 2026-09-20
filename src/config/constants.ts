

export const LIMITS = {
  //one row per device, and a person does not own thirty phones
  trustedDevices: 50,
} as const;

//How long a list of one-time codes for a single user can grow before the TTL
//index clears it. Used to bound the resend-count lookup window.
export const OTP_LOOKBACK_HOURS = 24;

//Password rules. Enforced server-side even though the app checks too, because
//curl does not run the app.
export const PASSWORD = {
  MIN_LENGTH: 8,
} as const;
