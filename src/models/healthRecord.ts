import mongoose from "mongoose"

const { Schema, model } = mongoose


const attachmentSchema = new Schema({
    url: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        trim: true
    }
}, { timestamps: true })


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
    },
    attachments: {
        type: [attachmentSchema],
        default: []
    }
}, { timestamps: true })

//every read is "this user's records", optionally narrowed by type — without
//this index mongo scans the whole collection on each one
healthRecordSchema.index({ user: 1, type: 1, createdAt: -1 })

const HealthRecord = model("HealthRecord", healthRecordSchema)


export default HealthRecord
