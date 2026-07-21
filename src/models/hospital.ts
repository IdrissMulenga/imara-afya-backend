import mongoose from "mongoose"

const { Schema, model } = mongoose


const hospitalSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    }
}, { timestamps: true })

const Hospital = model("Hospital", hospitalSchema)


export default Hospital
