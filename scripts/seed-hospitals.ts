import Hospital from "../src/models/hospital.js"
import { connectDB, disconnectDB } from "../src/config/db.js"
import { loadHospitalFile, DEFAULT_DATA_PATH } from "../src/utils/hospitalData.js"


//UPDATE THE FACILITY DIRECTORY FROM A FILE YOU CONTROL.
//
//   npm run seed:hospitals              (uses data/hospitals.json)
//   npm run seed:hospitals path/to.json
//
//You do NOT need this for a fresh deploy — the server seeds an empty database
//by itself on boot. This script is for CHANGING data that already exists: a
//clinic moved, a phone number changed, a new facility opened.
//
//It matches on name + coordinates, so running it twice updates rather than
//duplicates. Validation is shared with the boot seeder, so both refuse the
//same bad data — nothing is invented here, every coordinate has to come from
//a source you have checked.

const run = async () => {
    const file = process.argv[2] ?? DEFAULT_DATA_PATH;

    const { entries, path, problems } = loadHospitalFile(file);

    if (!entries) {
        console.error(
            problems.length
                ? `Cannot read ${path}: ${problems.join('; ')}`
                : `File not found: ${path}`,
        );
        process.exit(1);
    }

    if (!entries.length) {
        console.error('That file has no entries.');
        process.exit(1);
    }

    //check everything BEFORE writing anything
    if (problems.length) {
        console.error(`\nRefusing to seed — ${problems.length} problem(s):\n`);
        problems.forEach((p) => console.error(`  • ${p}`));
        console.error('\nFix the file and run again. Nothing was written.\n');
        process.exit(1);
    }

    await connectDB();

    let added = 0;
    let updated = 0;

    for (const entry of entries) {
        const existing = await Hospital.findOne({
            name: entry.name.trim(),
            latitude: entry.latitude,
            longitude: entry.longitude,
        });

        if (existing) {
            existing.set(entry);
            await existing.save();
            updated++;
        } else {
            await new Hospital({ ...entry, name: entry.name.trim() }).save();
            added++;
        }
    }

    const total = await Hospital.countDocuments();

    console.log(`\nDone. ${added} added, ${updated} updated. Directory now holds ${total} facilities.\n`);

    await disconnectDB();
    process.exit(0);
};

run();
