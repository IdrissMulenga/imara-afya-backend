//THE AUTH SCHEMA.
//
//This module owns signing up, signing in, codes, passwords and devices. The
//User type itself belongs to the user module — AuthPayload just refers to it,
//which works because all modules' typeDefs become one schema.

export const authTypeDefs = /* GraphQL */ `
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

  extend type Query {
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
  }
`;
