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
    //HOW OFTEN, not just at what times.
    //
    //This field existed from the start and nothing ever read it — every
    //medicine was treated as daily, so someone on an every-other-day tablet got
    //reminded twice as often as they should be and their adherence looked half
    //what it was. `days` carries the weekday numbers for "specificDays",
    //matching the routine feature's 0 = Sunday convention.
    frequency: {
        type: String,
        enum: ["daily", "alternate", "specificDays"],
        default: "daily"
    },
    days: {
        type: [Number],
        default: []
    },
    //THE COURSE, when there is one.
    //
    //A week of antibiotics is not a permanent prescription. Without an end date
    //the reminders never stop, and the user's only way out is deleting the
    //medicine — which takes its dose history with it.
    //
    //Both are plain "YYYY-MM-DD" in the user's own timezone, like every other
    //day-grouped field in this database. Null start means "since forever",
    //null end means "ongoing", which is the common case.
    startDate: {
        type: String
    },
    endDate: {
        type: String
    },
    //WHAT IS LEFT IN THE PACKET.
    //
    //Optional: plenty of people won't count, and a required field they don't
    //want to fill is a field that makes them abandon the form. When it is set,
    //logging a dose decrements it and the app can warn before the packet runs
    //out — which is the actual failure mode for long-term medication in a place
    //where the pharmacy is a bus ride away.
    stock: {
        type: Number,
        min: 0
    },
    //how many units one dose costs — half a tablet is a real prescription
    stockPerDose: {
        type: Number,
        min: 0,
        default: 1
    },
    //warn when stock falls to this many days' worth
    refillAtDays: {
        type: Number,
        min: 0,
        default: 5
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
