//THE USER / AUTH SCHEMA.
//
//`/* GraphQL */` before the backtick tells editors to syntax-highlight the
//string as GraphQL. It does nothing at runtime.

export const userTypeDefs = /* GraphQL */ `
  type User {
    id: ID!
    email: String!
    emailVerified: Boolean!

    name: String!
    photoUrl: String!
    gender: Gender!
    birthDate: String
    heightCm: Float
    weightKg: Float
    "Worked out from height and weight — never stored."
    bmi: Float

    language: Language!
    units: Units!
    timezone: String!
    cycleTrackingEnabled: Boolean!

    waterGoalGlasses: Float!
    stepGoal: Int!
    sleepGoalHours: Float!

    createdAt: String!
  }

  enum Gender {
    female
    male
    unspecified
  }

  enum Language {
    en
    fr
    sw
    rn
  }

  enum Units {
    metric
    imperial
  }

  type AuthPayload {
    token: String!
    user: User!
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
    deviceLabel: String
  }

  input LoginInput {
    email: String!
    password: String!
    deviceId: String!
    deviceLabel: String
  }

  input VerifyOtpInput {
    code: String!
    deviceId: String
    deviceLabel: String
  }

  input VerifyResetOtpInput {
    email: String!
    code: String!
  }

  input ResetPasswordInput {
    resetToken: String!
    password: String!
    deviceId: String!
    deviceLabel: String
  }

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
  }

  input DeleteAccountInput {
    password: String!
  }

  input UpdateProfileInput {
    name: String
    photoUrl: String
    gender: Gender
    birthDate: String
    heightCm: Float
    weightKg: Float
  }

  input PreferencesInput {
    language: Language
    units: Units
    timezone: String
    cycleTrackingEnabled: Boolean
    waterGoalGlasses: Float
    stepGoal: Int
    sleepGoalHours: Float
  }

  extend type Query {
    me: User!
    myTrustedDevices: [TrustedDevice!]!
  }

  extend type Mutation {
    signup(input: SignUpInput!): AuthPayload!
    login(input: LoginInput!): LoginResult!

    verifyEmailOtp(input: VerifyOtpInput!): User!
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

    updateProfile(input: UpdateProfileInput!): User!
    setPreferences(input: PreferencesInput!): User!
    deleteAccount(input: DeleteAccountInput!): Boolean!
  }
`;
