export const vitalTypeDefs = /* GraphQL */ `
  enum VitalKind {
    BLOOD_PRESSURE
    GLUCOSE
    PULSE
  }

  "When blood sugar was measured: before eating in the morning, about two hours after a meal, or any other time."
  enum GlucoseContext {
    FASTING
    AFTER_MEAL
    RANDOM
  }

  "How a reading is classed. Blood pressure (ISH 2020): LOW under 90/60, NORMAL, HIGH_NORMAL 130-139/85-89, HIGH_GRADE_1 140-159/90-99, HIGH_GRADE_2 160/100+, SEVERE 180/110+. Glucose (mmol/L): VERY_LOW under 3.0, LOW under 3.9, NORMAL, RAISED, HIGH, VERY_HIGH 16.7+. Pulse (bpm): VERY_LOW under 40, LOW 40-49, NORMAL 50-100, HIGH 101-120, VERY_HIGH over 120."
  enum VitalCategory {
    VERY_LOW
    LOW
    NORMAL
    HIGH_NORMAL
    RAISED
    HIGH
    HIGH_GRADE_1
    HIGH_GRADE_2
    SEVERE
    VERY_HIGH
  }

  "What to do about a reading. URGENT: seek care now. One reading is not a diagnosis."
  enum VitalAdvice {
    NONE
    RECHECK
    SEE_HEALTH_WORKER
    URGENT
  }

  type VitalReading {
    id: ID!
    kind: VitalKind!
    "YYYY-MM-DD in the user's timezone."
    day: String!
    "When it was measured (ISO)."
    at: String!
    systolic: Int
    diastolic: Int
    "Beats per minute."
    pulse: Int
    glucoseMmol: Float
    glucoseContext: GlucoseContext
    note: String!
    "For the reading's main measure."
    category: VitalCategory!
    "For the pulse given with a blood pressure reading, or a pulse reading; null without a pulse."
    pulseCategory: VitalCategory
    "The most serious advice across the reading's measures."
    advice: VitalAdvice!
  }

  "The average blood pressure over the readings in the last N days."
  type PressureAverage {
    days: Int!
    readings: Int!
    systolic: Int
    diastolic: Int
    category: VitalCategory
  }

  type VitalSummary {
    latestPressure: VitalReading
    latestGlucose: VitalReading
    "The newest reading with a pulse: a pulse reading or a blood pressure reading with one."
    latestPulse: VitalReading
    pressureWeek: PressureAverage!
    pressureMonth: PressureAverage!
  }

  "Blood pressure needs systolic and diastolic (pulse optional); glucose needs glucoseMmol (1-40) and glucoseContext; pulse needs pulse (25-250). at (ISO) defaults to now, max 30 days back."
  input LogVitalInput {
    kind: VitalKind!
    systolic: Int
    diastolic: Int
    pulse: Int
    glucoseMmol: Float
    glucoseContext: GlucoseContext
    note: String
    at: String
    "An id the app makes for this reading (8-64 letters, digits, - or _). Sending it again returns the reading already saved instead of a second one."
    clientId: String
  }

  extend type Query {
    "Readings in the last N days (default 30, max 365), newest first; one kind, or all."
    vitals(days: Int, kind: VitalKind): [VitalReading!]!
    vitalSummary: VitalSummary!
  }

  extend type Mutation {
    logVital(input: LogVitalInput!): VitalReading!
    "Removes one reading. false if there was none."
    deleteVital(id: ID!): Boolean!
  }
`;
