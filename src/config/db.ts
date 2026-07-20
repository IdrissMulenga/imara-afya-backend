import mongoose from "mongoose";
import { envConf } from './envConf.js';

export const connectDB = async () => { 
    try {
        await mongoose.connect(envConf.MONGODB_URI)
        console.log("Mongodb connected......")
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}