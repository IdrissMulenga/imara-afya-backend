import mongoose from "mongoose"

const { Schema, model } = mongoose


const pregnancySchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    //first day of the last menstrual period — everything is counted from here
    lastPeriodDate: {
        type: String,
        required: true
    },
    //set when the pregnancy ends, so the record stays in the user's history
    endedAt: {
        type: String
    },
    //why it ended — kept deliberately neutral, the app never asks for detail
    outcome: {
        type: String,
        enum: ["birth", "ended", "other"]
    },
    note: {
        type: String
    }
}, { timestamps: true })

//the app almost always asks for the one active pregnancy
pregnancySchema.index({ user: 1, endedAt: 1 })

const Pregnancy = model("Pregnancy", pregnancySchema)


export default Pregnancy
