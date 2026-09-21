//THE USER SCHEMA.
//
//This module owns the User type and everything about a person's profile.
//Signing in belongs to the auth module.
//
//`extend type Query` adds to the Query type that modules/index.ts declares.
//That is how two modules can both add fields without clashing.

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

  input DeleteAccountInput {
    password: String!
  }

  extend type Query {
    me: User!
  }

  extend type Mutation {
    updateProfile(input: UpdateProfileInput!): User!
    setPreferences(input: PreferencesInput!): User!
    deleteAccount(input: DeleteAccountInput!): Boolean!
  }
`;
