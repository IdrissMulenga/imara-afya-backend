import mongoose from "mongoose"

const { Schema, model } = mongoose


const medicationLogSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    medication: {
        type: Schema.Types.ObjectId,
        ref: "Medication",
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ["taken", "skipped"],
        default: "taken"
    },
    takenAt: {
        type: String,
        required: true
    },
    //THE DAY THIS BELONGS TO, in the user's own timezone.
    //
    //takenAt is a UTC instant, and grouping by it is wrong the moment someone
    //isn't on UTC: a dose taken at 00:30 in Bujumbura is 22:30 the PREVIOUS day
    //in UTC, so "today's doses" missed it entirely and the checkmark sprang
    //back. Storing the local calendar day alongside the instant fixes that, and
    //keeps working when the user travels.
    //(No `index: true` here. Every query for these also filters by user, so the
    //compound { user, localDate } index below serves them all — a standalone
    //index on localDate was never chosen by the planner and only cost a write
    //on the fastest growing collection in the database.)
    localDate: {
        type: String,
        required: true
    },
    //WHICH SCHEDULED DOSE THIS IS — "08:00", "20:00".
    //
    //Without it a medicine taken twice a day was "done" after one tap, because
    //a log row only said WHICH medicine and WHAT DAY. Someone on twice-daily
    //metformin was told they had finished at breakfast. For an adherence
    //feature that is worse than showing nothing.
    //
    //Null means an unscheduled dose — a medicine with no set times, taken as
    //needed. Those can legitimately happen more than once a day.
    slot: {
        type: String,
        default: null
    }
}, { timestamps: true })

//this is the fastest growing collection — one row per dose, per user, per day.
//The dashboard reads "today's doses for this user" on every single open.
medicationLogSchema.index({ user: 1, takenAt: -1 })
//the dashboard's actual question: "what did this person take today"
medicationLogSchema.index({ user: 1, localDate: -1 })
medicationLogSchema.index({ user: 1, medication: 1, takenAt: -1 })

//ONE ROW PER SCHEDULED DOSE PER DAY.
//
//Partial, so it only applies where `slot` is a string. As-needed doses have a
//null slot and are deliberately left unconstrained — you can take paracetamol
//twice in an afternoon, and the database should not argue about it.
medicationLogSchema.index(
    { user: 1, medication: 1, localDate: 1, slot: 1 },
    { unique: true, partialFilterExpression: { slot: { $type: "string" } } }
)

const MedicationLog = model("MedicationLog", medicationLogSchema)


export default MedicationLog
