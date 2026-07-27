import mongoose from "mongoose"

const { Schema, model } = mongoose


const habitLogSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    type: {
        type: String,
        required: true,
        //water = glasses drunk, sleep = hours slept, weight = kg
        enum: ["water", "sleep", "weight"]
    },
    value: {
        type: Number,
        required: true
    },
    //plain "YYYY-MM-DD" so a day's entries group easily
    date: {
        type: String,
        required: true
    }
}, { timestamps: true })

//we always look these up per user, per type, per day
habitLogSchema.index({ user: 1, type: 1, date: -1 })

const HabitLog = model("HabitLog", habitLogSchema)


export default HabitLog
