import mongoose from "mongoose"

const { Schema, model } = mongoose


const userSchema = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    agreedToTerms: {
        type: Boolean,
        required: true
    },
    agreedToTermsAt: {
        type: Date
    },
    image: {
        type: String
    },
    height: {
        type: Number
    },
    weight: {
        type: Number
    },
    gender: {
        type: String,
        required: true,
        enum: ["Man", "Woman"]
    },
    religion: {
        //stored as a canonical key — the app shows the translated label
        type: String,
        enum: ["christianity", "islam", "hinduism", "buddhism", "traditional", "none", "prefer_not_to_say"],
        default: "islam"
    },
    plan: {
        type: String,
        enum: ["free", "premium"],
        default: "free"
    },
    //only an admin can write to the shared guidance library and hospital directory —
    //this is never settable from signup or completeProfile, it's promoted in the database
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    //daily water target in glasses — the habit summary compares against this
    waterGoal: {
        type: Number,
        default: 8
    },
    //when on, medication reminders get shifted around the fasting window
    ramadanMode: {
        type: Boolean,
        default: false
    },
    //"HH:mm" 24h strings, e.g. "04:30"
    suhoorTime: {
        type: String
    },
    iftarTime: {
        type: String
    }
}, { timestamps: true })

const User = model("User", userSchema)


export default User