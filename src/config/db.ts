import mongoose from "mongoose";
import { envConf } from './envConf.js';

export const connectDB = async () => {
    try {
        await mongoose.connect(envConf.MONGODB_URI, {
            //Atlas counts connections against the cluster limit, so cap the pool
            //rather than letting mongoose open its default 100 per instance
            maxPoolSize: envConf.DB_POOL_SIZE,
            minPoolSize: 1,
            //fail fast instead of hanging a request for 30s when the cluster is
            //unreachable — the app can show an error far sooner
            serverSelectionTimeoutMS: 8000,
            socketTimeoutMS: 45000,
        })

        console.log("Mongodb connected......")
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}


//close the pool on shutdown so in-flight writes finish and Atlas frees the
//connections straight away instead of waiting for them to time out
export const disconnectDB = async () => {
    try {
        await mongoose.connection.close();
        console.log("Mongodb connection closed......")
    } catch (error) {
        console.error('MongoDB disconnect error:', error);
    }
}
