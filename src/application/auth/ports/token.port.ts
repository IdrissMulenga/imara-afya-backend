//TOKEN ISSUING AND VERIFICATION.
//
//Two token kinds, deliberately not interchangeable.
//
//A SESSION token authenticates requests. It carries the user's tokenVersion at
//issue (the revocation switch) and the session ORIGIN — when the password was
//last actually typed — which is what stops a session being renewed forever.
//
//A RESET token exists only between proving a one-time code and setting a new
//password. The implementation must mark it with its purpose and check that
//mark on the way back in, so a session token cannot be presented where a reset
//token is expected, or the other way round.

export interface SessionClaims {
  userId: string;
  tokenVersion: number;
  //ISO string. Kept as a string because it travels verbatim into the next
  //token on refresh — parsing and reformatting it would drift.
  origin: string;
}

export interface TokenService {
  signSession(userId: string, tokenVersion: number, origin: Date): string;
  verifySession(token: string): SessionClaims;

  signReset(userId: string): string;
  verifyReset(token: string): { userId: string };

  //True once the original sign-in is older than the renewal cap. Enforced on
  //refresh only: an already-issued token keeps working until its own expiry,
  //so the cap is a refusal to extend, not a logout.
  isOriginExpired(origin: string, now: Date): boolean;
}
