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
        enum: ["Man", "Woman"]
    },
    religion: {
        type: String,
        enum: ["Muslim", "Christian"],
        default: "Muslim"
    }
}, { timestamps: true })

const User = model("User", userSchema)


export default User