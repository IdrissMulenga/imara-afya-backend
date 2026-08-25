import mongoose from "mongoose"

const { Schema, model } = mongoose


const userSchema = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    agreedToTerms: {
        type: Boolean,
        required: true
    },
    agreedToTermsAt: {
        type: Date
    },
    image: {
        type: String
    },
    height: {
        type: Number
    },
    weight: {
        type: Number
    },
    gender: {
        type: String,
        required: true,
        enum: ["Man", "Woman"]
    },
    //IANA name, e.g. "Africa/Bujumbura". Everything that groups by day resolves
    //"today" through this, so a dose logged at 00:30 lands on the right date.
    //UTC is the safe default: wrong for most people, but never crashes.
    timezone: {
        type: String,
        default: "UTC",
        trim: true
    },
    //metric stores kg and millilitres, imperial shows lb and fluid ounces.
    //Only the DISPLAY changes — storage is always metric, so switching never
    //rewrites history or loses precision.
    unitSystem: {
        type: String,
        enum: ["metric", "imperial"],
        default: "metric"
    },
    plan: {
        type: String,
        enum: ["free", "premium"],
        default: "free"
    },
    //only an admin can write to the shared guidance library —
    //this is never settable from signup or completeProfile, it's promoted in the database
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    //daily water target in glasses — the habit summary compares against this
    waterGoal: {
        type: Number,
        default: 8
    },
    //Whether her cycle is predictable. This changes how much weight the app puts
    //on its own predictions: for an irregular cycle a confident countdown is
    //misleading, so the app says so rather than pretending.
    //"unknown" until she answers, which is not the same as "regular".
    cycleRegularity: {
        type: String,
        enum: ["regular", "irregular", "unknown"],
        default: "unknown"
    },
    //Bumped whenever the user logs out or changes their password. Every token
    //carries the version it was issued with, so raising this instantly makes
    //every existing token for this account invalid — that's what turns a stolen
    //7-day token from a 7-day problem into a "log out" problem.
    tokenVersion: {
        type: Number,
        default: 0
    },
    //sha-256 of the reset token. We never store the token itself, so a database
    //leak doesn't hand out working reset links.
    passwordResetTokenHash: {
        type: String,
        select: false
    },
    passwordResetExpires: {
        type: Date,
        select: false
    }
}, { timestamps: true })

const User = model("User", userSchema)


export default User