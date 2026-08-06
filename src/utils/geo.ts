import { MAP_DEFAULTS, MAP_FRAMING, DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from './../config/mapConfig.js';


export type Point = {
    latitude: number;
    longitude: number;
};

export type MapRegion = Point & {
    latitudeDelta: number;
    longitudeDelta: number;
};


//DISTANCE IN KM BETWEEN TWO LAT/LNG POINTS (haversine formula).
//
//This is the only copy. The app used to run the same formula on the device so
//it could sort without a second round trip; now it just reads distanceKm off
//the response, so there is one implementation and one set of results.
export const distanceKm = (from: Point, to: Point) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    //earth radius in km
    const R = 6371;

    const dLat = toRad(to.latitude - from.latitude);
    const dLon = toRad(to.longitude - from.longitude);

    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};


//ONE DECIMAL PLACE is all the app ever shows, and it keeps the payload small.
export const roundKm = (value: number) => Math.round(value * 10) / 10;


//A LAT/LNG PAIR WE CAN ACTUALLY PLOT.
//
//Missing coordinates on a seeded row would otherwise become NaN and quietly
//drag the whole map to the middle of the ocean.
export const isPlottable = (point: Partial<Point>): point is Point => {
    const { latitude, longitude } = point;

    return typeof latitude === 'number' && Number.isFinite(latitude)
        && typeof longitude === 'number' && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
};


//THE SMALLEST BOX CONTAINING EVERY POINT, with breathing room.
//
//Used to be computed on the device. Doing it here means the phone receives a
//region it can hand straight to the map, and the framing rules are the same
//for every client we ever add.
export const regionFor = (points: Point[]): MapRegion => {
    const usable = points.filter(isPlottable);

    if (!usable.length) return { ...MAP_DEFAULTS };

    const lats = usable.map((p) => p.latitude);
    const lngs = usable.map((p) => p.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const clamp = (span: number) => Math.min(
        Math.max(span * MAP_FRAMING.padding, MAP_FRAMING.minDelta),
        MAP_FRAMING.maxDelta,
    );

    return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: clamp(maxLat - minLat),
        longitudeDelta: clamp(maxLng - minLng),
    };
};


//KEEP A REQUESTED RADIUS SANE.
//
//A caller asking for radiusKm: 40000 is asking for the whole planet, which is
//not a filter at all. Anything absent or nonsensical falls back to the default.
export const usableRadius = (radiusKm?: number | null) => {
    if (typeof radiusKm !== 'number' || !Number.isFinite(radiusKm) || radiusKm <= 0) {
        return DEFAULT_RADIUS_KM;
    }

    return Math.min(radiusKm, MAX_RADIUS_KM);
};
