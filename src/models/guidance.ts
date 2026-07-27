import mongoose from "mongoose"

const { Schema, model } = mongoose


const guidanceSchema = new Schema({
    category: {
        type: String,
        required: true,
        enum: ["ramadan", "menstruation", "pregnancy", "general", "nutrition"]
    },
    //religious guidance and medical advice are kept apart on purpose —
    //the app labels them differently so users never confuse the two
    kind: {
        type: String,
        required: true,
        enum: ["religious", "medical"]
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    body: {
        type: String,
        required: true
    },
    //scholar name or medical reference the content came from
    source: {
        type: String,
        trim: true
    },
    language: {
        type: String,
        enum: ["en", "sw", "fr", "rn"],
        default: "en"
    },
    published: {
        type: Boolean,
        default: true
    }
}, { timestamps: true })

//content is always fetched per category in the user's language
guidanceSchema.index({ category: 1, language: 1 })

const Guidance = model("Guidance", guidanceSchema)


export default Guidance
