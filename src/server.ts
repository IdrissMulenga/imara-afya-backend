import app from './app.js';
import { connectDB, disconnectDB } from "./config/db.js"
import { envConf } from './config/envConf.js';


const startServer = async () => {
    try {
        await connectDB()

        const server = app.listen(envConf.PORT, () => {
            console.log(`server started at port ${envConf.PORT}.......`)
        })

        //GRACEFUL SHUTDOWN — hosting platforms send SIGTERM before replacing an
        //instance. Without this, requests in flight during a deploy are dropped
        //and a user sees a failure for something that actually worked.
        const shutdown = async (signal: string) => {
            console.log(`${signal} received, shutting down......`)

            server.close(async () => {
                await disconnectDB()
                process.exit(0)
            })

            //don't wait forever for a stuck connection to drain
            setTimeout(() => {
                console.error('Forced shutdown after timeout')
                process.exit(1)
            }, 10_000).unref()
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))

        //a crash that leaves the process half alive serves broken requests to
        //everyone — better to exit and let the platform start a clean instance
        process.on('unhandledRejection', (reason) => {
            console.error('UNHANDLED_REJECTION:', reason)
        })

        process.on('uncaughtException', (error) => {
            console.error('UNCAUGHT_EXCEPTION:', error)
            shutdown('uncaughtException')
        })
    } catch (error: any) {
        console.log('Error starting server:', error.message);
    }
}

startServer()
