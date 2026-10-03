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
    "Target weight in kg; null when not set."
    weightGoalKg: Float
    "Sleep schedule as HH:MM in the user's timezone; null when not set."
    sleepBedtime: String
    sleepWakeTime: String
    "Schedule for nights ending on Saturday and Sunday; null means the same as weekdays."
    sleepWeekendBedtime: String
    sleepWeekendWakeTime: String

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

  "Omitted fields are unchanged; null clears the weight goal or any of the sleep schedule times."
  input PreferencesInput {
    language: Language
    units: Units
    timezone: String
    cycleTrackingEnabled: Boolean
    waterGoalGlasses: Float
    stepGoal: Int
    sleepGoalHours: Float
    "20-400 kg."
    weightGoalKg: Float
    sleepBedtime: String
    sleepWakeTime: String
    sleepWeekendBedtime: String
    sleepWeekendWakeTime: String
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
    "Emails a JSON file of everything the app holds about the user to their confirmed address. EMAIL_NOT_VERIFIED (reason EXPORT) until it is confirmed; 3 a day."
    emailMyData: Boolean!
  }
`;
