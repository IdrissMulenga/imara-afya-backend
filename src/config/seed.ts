import Hospital from './../models/hospital.js';
import { loadHospitalFile } from './../utils/hospitalData.js';


//SEED THE FACILITY DIRECTORY ON BOOT.
//
//Runs automatically after the database connects, so a fresh deploy comes up with
//the hospital list already in place — nobody has to remember a command.
//
//Two deliberate limits:
//
//  • It only runs when the collection is EMPTY. Once there is data, this stays
//    out of the way, so it can never overwrite a correction made in production
//    with a stale value from the file.
//  • It refuses to write anything if a single entry fails validation, and logs
//    why. Half a directory is worse than none when the data is addresses people
//    travel to while unwell.
//
//To update an existing directory, use the manual script — that one is explicit
//about changing data that already exists:
//    npm run seed:hospitals data/hospitals.json
export const seedHospitals = async () => {
    try {
        const existing = await Hospital.countDocuments();

        if (existing > 0) {
            //normal case on every restart after the first — say nothing loud
            return;
        }

        const { entries, path, problems } = loadHospitalFile();

        if (!entries) {
            if (problems.length) {
                console.error(`Hospital seed file at ${path} is unusable: ${problems.join('; ')}`);
            } else {
                console.log('No hospital data file found — Find care will show its empty state.');
            }

            return;
        }

        if (problems.length) {
            console.error(`\nRefusing to seed hospitals — ${problems.length} problem(s) in ${path}:`);
            problems.forEach((p) => console.error(`  • ${p}`));
            console.error('Fix the file and restart. Nothing was written.\n');

            return;
        }

        if (!entries.length) return;

        await Hospital.insertMany(
            entries.map((entry) => ({ ...entry, name: entry.name.trim() })),
        );

        console.log(`Seeded ${entries.length} facilities into the directory.`);
    } catch (error: any) {
        //seeding must never stop the server coming up — an app with an empty
        //directory is far better than an app that won't start
        console.error('Hospital seeding failed:', error.message);
    }
};
