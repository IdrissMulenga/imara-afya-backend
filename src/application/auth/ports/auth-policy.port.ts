//THE NUMBERS THE RULES DEPEND ON.
//
//Gathered into one shape and injected rather than imported from a config
//module. Two reasons: the inner layers stay free of any dependency on how
//configuration is loaded, and a test can run the real rules with a two-second
//expiry instead of ten minutes.

export interface AuthPolicy {
  otpTtlMinutes: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  otpResendsPerHour: number;
  deviceTrustDays: number;
  maxPasswordAttempts: number;
  resetTokenMinutes: number;
  maxTrustedDevices: number;
  passwordHashRounds: number;
  //Lower than a password's. A code lives ten minutes and dies after five
  //guesses, so the work factor protecting it does not need to hold for years —
  //and hashing sits on the hot path of every verification.
  otpHashRounds: number;
}
