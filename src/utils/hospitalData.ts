import fs from "node:fs"
import path from "node:path"


//LOADING AND CHECKING THE FACILITY FILE.
//
//Shared by the boot seeder and the manual script so both apply exactly the same
//rules. A facility that passes here is one we are willing to send a sick person
//to, so the checks are deliberately strict.

export type HospitalEntry = {
    name: string;
    address?: string;
    phone?: string;
    latitude: number;
    longitude: number;
    city?: string;
    province?: string;
    type?: string;
};

//Burundi sits roughly inside this box. A coordinate outside it is almost
//certainly a typo, or latitude and longitude swapped — which would silently
//place a Bujumbura clinic in another country.
const BURUNDI_BOUNDS = {
    minLat: -4.5,
    maxLat: -2.2,
    minLng: 28.9,
    maxLng: 30.9,
};

const VALID_TYPES = ['hospital', 'clinic', 'pharmacy'];

//where the file lives unless someone passes another path
export const DEFAULT_DATA_PATH = 'data/hospitals.json';


export const validateEntry = (entry: HospitalEntry, index: number) => {
    const where = `entry ${index + 1}${entry?.name ? ` (${entry.name})` : ''}`;
    const problems: string[] = [];

    if (!entry?.name?.trim()) problems.push('missing name');

    if (typeof entry?.latitude !== 'number' || typeof entry?.longitude !== 'number') {
        problems.push('latitude and longitude must be numbers');
    } else {
        const inBounds =
            entry.latitude >= BURUNDI_BOUNDS.minLat &&
            entry.latitude <= BURUNDI_BOUNDS.maxLat &&
            entry.longitude >= BURUNDI_BOUNDS.minLng &&
            entry.longitude <= BURUNDI_BOUNDS.maxLng;

        if (!inBounds) {
            problems.push(
                `coordinates (${entry.latitude}, ${entry.longitude}) are outside Burundi — check they aren't swapped`,
            );
        }
    }

    if (entry?.type && !VALID_TYPES.includes(entry.type)) {
        problems.push(`type must be one of ${VALID_TYPES.join(', ')}`);
    }

    return problems.length ? `${where}: ${problems.join('; ')}` : null;
};


//Returns the entries, or throws with every problem listed at once. Validating
//the whole file before writing anything means a bad row halfway down can't
//leave the directory half seeded.
export const loadHospitalFile = (file = DEFAULT_DATA_PATH) => {
    const fullPath = path.resolve(process.cwd(), file);

    if (!fs.existsSync(fullPath)) {
        return { entries: null, path: fullPath, problems: [] as string[] };
    }

    let entries: HospitalEntry[];

    try {
        entries = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error: any) {
        return { entries: null, path: fullPath, problems: [`not valid JSON: ${error.message}`] };
    }

    if (!Array.isArray(entries)) {
        return { entries: null, path: fullPath, problems: ['expected a JSON array'] };
    }

    const problems = entries
        .map(validateEntry)
        .filter((p): p is string => p !== null);

    return { entries, path: fullPath, problems };
};
