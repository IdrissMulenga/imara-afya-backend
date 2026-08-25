import mongoose from "mongoose"

const { Schema, model } = mongoose


//THE DAILY CHECK-IN.
//
//How are you, and how much energy do you have. Two taps, five seconds, and it
//is the one thing in this app that is equally worth doing whether you are
//managing an illness or perfectly well — which is exactly the gap the rest of
//the features leave.
//
//It is also the raw material for everything interesting later: mood against
//sleep, energy against the cycle, both against whether medicine was taken.
const checkInSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    //plain "YYYY-MM-DD" resolved in the USER'S timezone, not the server's
    date: {
        type: String,
        required: true
    },
    //1 = worst, 5 = best. A five-point scale because three is too coarse to
    //show a trend and ten asks for a precision nobody has about their own mood.
    mood: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    energy: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    //optional free text — "slept badly", "headache all afternoon"
    note: {
        type: String,
        trim: true,
        maxlength: 500
    }
}, { timestamps: true })

//ONE CHECK-IN PER PERSON PER DAY.
//
//Enforced by the database rather than by the resolver: checking first and then
//writing leaves a window where two quick taps create two rows, and then the
//streak counter and every average built on this is quietly wrong.
checkInSchema.index({ user: 1, date: -1 }, { unique: true })

const CheckIn = model("CheckIn", checkInSchema)


export default CheckIn
