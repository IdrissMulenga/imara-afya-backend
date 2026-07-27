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

const MedicationLog = model("MedicationLog", medicationLogSchema)


export default MedicationLog
