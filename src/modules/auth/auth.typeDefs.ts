export const authTypeDefs = /* GraphQL */ `
  type AuthPayload {
    token: String!
    user: User!
    "True only when signInWithGoogle / signInWithApple just created the account."
    newAccount: Boolean
  }

  "Returned by login when the phone is not trusted. Carries NO token."
  type OtpChallenge {
    challenge: Boolean!
    purpose: String!
    expiresAt: String!
    "Masked, so the user knows which inbox to open without exposing the address."
    maskedEmail: String!
  }

  "login returns one of these two. The app checks __typename to see which."
  union LoginResult = AuthPayload | OtpChallenge

  type ResetTicket {
    resetToken: String!
    expiresAt: String!
  }

  type TrustedDevice {
    id: ID!
    label: String!
    lastSeenAt: String!
    expiresAt: String!
    "True for the phone making this request."
    current: Boolean!
  }

  input SignUpInput {
    email: String!
    password: String!
    deviceId: String!
    deviceSecret: String!
    deviceLabel: String
    "The language chosen in the app; also used for the signup email."
    language: Language
  }

  input LoginInput {
    email: String!
    password: String!
    deviceId: String!
    deviceSecret: String
    deviceLabel: String
  }

  input VerifyOtpInput {
    code: String!
    deviceId: String!
    deviceSecret: String!
    deviceLabel: String
  }

  input VerifyEmailOtpInput {
    code: String!
  }

  input VerifyResetOtpInput {
    email: String!
    code: String!
  }

  input ResetPasswordInput {
    resetToken: String!
    password: String!
    deviceId: String!
    deviceSecret: String!
    deviceLabel: String
  }

  input GoogleSignInInput {
    idToken: String!
    deviceId: String!
    deviceSecret: String!
    deviceLabel: String
    language: Language
  }

  input AppleSignInInput {
    identityToken: String!
    "The raw nonce; the token carries its SHA-256."
    nonce: String!
    "Exchanged for a refresh token kept to revoke the sign-in when the account is deleted."
    authorizationCode: String
    "Apple sends the name only on the first sign-in."
    givenName: String
    familyName: String
    deviceId: String!
    deviceSecret: String!
    deviceLabel: String
    language: Language
  }

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
  }

  "Provider settings the app reads before anyone signs in."
  type SignInOptions {
    "Google OAuth Web client id; null while Google sign-in is off."
    googleWebClientId: String
    "Google OAuth iOS client id; null until the iPhone client exists."
    googleIosClientId: String
  }

  extend type Query {
    signInOptions: SignInOptions!
    myTrustedDevices: [TrustedDevice!]!
  }

  extend type Mutation {
    signup(input: SignUpInput!): AuthPayload!
    login(input: LoginInput!): LoginResult!
    "Signs in, links or creates an account with Google. No emailed code on a new phone."
    signInWithGoogle(input: GoogleSignInInput!): AuthPayload!
    "Signs in, links or creates an account with Apple. No emailed code on a new phone."
    signInWithApple(input: AppleSignInInput!): AuthPayload!

    verifyEmailOtp(input: VerifyEmailOtpInput!): User!
    resendEmailOtp: Boolean!

    verifyLoginOtp(email: String!, input: VerifyOtpInput!): AuthPayload!
    resendLoginOtp(email: String!, deviceId: String!): Boolean!

    requestPasswordReset(email: String!): Boolean!
    verifyPasswordResetOtp(input: VerifyResetOtpInput!): ResetTicket!
    resendPasswordResetOtp(email: String!): Boolean!
    resetPassword(input: ResetPasswordInput!): AuthPayload!

    changePassword(input: ChangePasswordInput!): AuthPayload!
    refreshSession: AuthPayload!
    logout: Boolean!

    revokeTrustedDevice(id: ID!): Boolean!
  }
`;
