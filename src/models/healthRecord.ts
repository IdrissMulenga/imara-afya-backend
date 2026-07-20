import mongoose from "mongoose"

const { Schema, model } = mongoose


const healthRecordSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ["Condition", "Allergy", "Medication"]
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    note: {
        type: String,
        trim: true
    }
}, { timestamps: true })

const HealthRecord = model("HealthRecord", healthRecordSchema)


export default HealthRecord
