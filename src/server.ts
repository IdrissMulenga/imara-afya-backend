import app from './app.js';
import { connectDB } from "./config/db.js"
import { envConf } from './config/envConf.js';


const startServer = async () => {
    try {
        await connectDB()
        app.listen(envConf.PORT, () => { 
            console.log(`server started at port ${envConf.PORT}.......`)
        })
    } catch (error: any) {
        console.log('Error starting server:', error.message);
    }
}

startServer()
