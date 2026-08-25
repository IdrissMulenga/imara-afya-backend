import mongoose from "mongoose"

const { Schema, model } = mongoose


//A ROUTINE THE USER DEFINED THEMSELVES.
//
//"Morning walk", "vitamins", "stretch before bed", "call Mum". The fixed habit
//types — water, sleep, weight — cover what we thought people should track. This
//covers what they actually want to, which is the difference between an app you
//check and an app you use.
const routineSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80
    },
    //an Ionicons name chosen in the app, so a routine is recognisable at a
    //glance in a list rather than being one more line of text
    icon: {
        type: String,
        trim: true,
        default: "checkmark-circle-outline"
    },
    //0 = Sunday .. 6 = Saturday. Empty means every day — the common case, and
    //making it the default costs the user no decisions.
    days: {
        type: [Number],
        default: []
    },
    //optional "HH:MM" reminder time
    time: {
        type: String,
        trim: true
    },
    //archived rather than deleted, so the history behind it survives
    active: {
        type: Boolean,
        default: true
    },
    //user-controlled ordering in the list
    position: {
        type: Number,
        default: 0
    }
}, { timestamps: true })

routineSchema.index({ user: 1, active: 1, position: 1 })

export const Routine = model("Routine", routineSchema)


//ONE TICK, ON ONE DAY.
const routineLogSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    routine: {
        type: Schema.Types.ObjectId,
        ref: "Routine",
        required: true
    },
    //"YYYY-MM-DD" in the user's timezone
    date: {
        type: String,
        required: true
    }
}, { timestamps: true })

//A routine is either done on a day or it isn't — there is no "done twice".
//Unique so a double tap can't inflate a streak.
routineLogSchema.index({ user: 1, routine: 1, date: -1 }, { unique: true })
//the list screen asks "what was ticked today" for every routine at once
routineLogSchema.index({ user: 1, date: -1 })

export const RoutineLog = model("RoutineLog", routineLogSchema)
