import mongoose from "mongoose"

const { Schema, model } = mongoose


const medicationSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    dosage: {
        type: String,
        trim: true
    },
    times: {
        type: [String],
        default: []
    },
    frequency: {
        type: String,
        default: "daily"
    },
    active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true })

//the dashboard asks for this user's active medications on every open
medicationSchema.index({ user: 1, active: 1, name: 1 })

const Medication = model("Medication", medicationSchema)


export default Medication
