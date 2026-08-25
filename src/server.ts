import app from './app.js';
import { connectDB, disconnectDB } from "./config/db.js"
import { envConf } from './config/envConf.js';
import { assertPurgeCoverage } from './services/accountService.js';


const startServer = async () => {
    try {
        //Importing app.js above has registered every model, so this can now see
        //them all. It throws if any collection holding user data would survive
        //an account deletion — better to refuse to start than to promise
        //someone their data is gone and leave it there.
        assertPurgeCoverage()

        await connectDB()

        const server = app.listen(envConf.PORT, () => {
            console.log(`server started at port ${envConf.PORT}.......`)
        })

        //GRACEFUL SHUTDOWN — hosting platforms send SIGTERM before replacing an
        //instance. Without this, requests in flight during a deploy are dropped
        //and a user sees a failure for something that actually worked.
        //A second signal while the first shutdown is draining would call
        //server.close() twice — the second callback never fires, so the Mongo
        //pool is closed from under requests that are still finishing.
        let shuttingDown = false

        const shutdown = async (signal: string) => {
            if (shuttingDown) return

            shuttingDown = true

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

        //A rejected promise nobody awaited is a bug worth seeing, but not worth
        //dropping every in-flight request over — most of ours come from a
        //single failed query, and the resolver already answered with an error.
        //An uncaught EXCEPTION is different: the process state is unknown after
        //one, so that path below does shut down.
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
