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
    }
}, { timestamps: true })

//this is the fastest growing collection — one row per dose, per user, per day.
//The dashboard reads "today's doses for this user" on every single open.
medicationLogSchema.index({ user: 1, takenAt: -1 })
medicationLogSchema.index({ user: 1, medication: 1, takenAt: -1 })

const MedicationLog = model("MedicationLog", medicationLogSchema)


export default MedicationLog
