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
    },
    //used by the map screen to filter facilities by area
    city: {
        type: String,
        trim: true
    },
    province: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ["hospital", "clinic", "pharmacy"],
        default: "hospital"
    }
}, { timestamps: true })

const Hospital = model("Hospital", hospitalSchema)


export default Hospital
