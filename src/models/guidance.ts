import mongoose from "mongoose"

const { Schema, model } = mongoose


const guidanceSchema = new Schema({
    category: {
        type: String,
        required: true,
        enum: ["menstruation", "pregnancy", "general", "nutrition"]
    },
    //Everything in this library is medical. The field is kept because it is
    //already in the schema and in stored documents, and because a second kind
    //(say "lifestyle") is plausible — but it has exactly one value today, so
    //nothing should branch on it.
    kind: {
        type: String,
        required: true,
        enum: ["medical"],
        default: "medical"
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
    //the medical reference the content came from
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
