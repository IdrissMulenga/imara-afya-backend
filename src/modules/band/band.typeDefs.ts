export const bandTypeDefs = /* GraphQL */ `
  "The fitness band paired with this account. An account has at most one band, and a band belongs to one account."
  type Band {
    id: ID!
    "Hardware identifier (serial number or MAC address), uppercased."
    bandId: String!
    model: String!
    firmware: String!
    pairedAt: String!
    "Last successful sync; null until the first one."
    lastSyncedAt: String
  }

  type BandSyncResult {
    "Days written."
    syncedDays: Int!
    "Days in the future or more than 30 days ago, ignored."
    skippedDays: Int!
    band: Band!
  }

  input PairBandInput {
    bandId: String!
    model: String
    firmware: String
  }

  "One day of totals from the band. day is YYYY-MM-DD in the user's timezone; sleepHours is the sleep that ended that morning. A missing or null value leaves the stored one unchanged."
  input BandDayInput {
    day: String!
    steps: Int
    "Where steps came from: BAND or PHONE (the default)."
    stepsSource: DataSource
    sleepHours: Float
    "Where sleepHours came from: MANUAL (set by hand), BAND, PHONE (the default) or ESTIMATE (from the sleep schedule)."
    sleepSource: DataSource
  }

  "Daily totals from the account's devices, at most 62 days. A value replaces the stored one only from a source ranked at least as high (see DataSource), so a phone cannot undo the band or real sleep, and resending a sync is safe."
  input SyncBandInput {
    bandId: String!
    firmware: String
    days: [BandDayInput!]!
  }

  extend type Query {
    "The paired band, or null."
    myBand: Band
  }

  extend type Mutation {
    "Pairs a band. Fails with BAND_ALREADY_PAIRED if a different band is paired, BAND_TAKEN if the band belongs to another account."
    pairBand(input: PairBandInput!): Band!
    "Removes the paired band. false if there was none."
    unpairBand: Boolean!
    "Saves steps and sleep from the paired band. Fails with BAND_NOT_PAIRED for any other band."
    syncBand(input: SyncBandInput!): BandSyncResult!
  }
`;
