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

//cycles are always read for one user, ordered by start date
periodCycleSchema.index({ user: 1, startDate: -1 })

const PeriodCycle = model("PeriodCycle", periodCycleSchema)


export default PeriodCycle
