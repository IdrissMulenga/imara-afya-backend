import mongoose from "mongoose"

const { Schema, model } = mongoose


const periodCycleSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    startDate: {
        type: String,
        required: true
    },
    endDate: {
        type: String
    }
}, { timestamps: true })

const PeriodCycle = model("PeriodCycle", periodCycleSchema)


export default PeriodCycle
