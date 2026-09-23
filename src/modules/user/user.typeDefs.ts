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

  "Omitted fields are unchanged; null clears birthDate, heightCm or weightKg. The photo is set via /upload/avatar."
  input UpdateProfileInput {
    name: String
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
