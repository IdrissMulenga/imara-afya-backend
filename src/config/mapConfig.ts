//WHERE THE MAP OPENS, AND HOW WIDE.
//
//These used to be hard-coded in the app. They live here now for two reasons:
//when the directory grows beyond Bujumbura we change one file instead of
//shipping a new build, and the phone stops needing to know anything about
//Burundi's geography just to draw a map.
//
//A "delta" is how many degrees of latitude / longitude the visible box covers.
//0.09 is roughly 10km, which frames the city without losing street names.
export const MAP_DEFAULTS = {
    //Bujumbura city centre — the fallback when we have neither the user's
    //position nor a single facility to frame
    latitude: -3.3822,
    longitude: 29.3644,
    latitudeDelta: 0.09,
    longitudeDelta: 0.09,
} as const;


//HOW THE BOX IS DRAWN AROUND A SET OF PINS.
export const MAP_FRAMING = {
    //pad the bounding box so pins aren't flush against the edge
    padding: 1.6,
    //a single pin has a span of zero, which would zoom to the atom
    minDelta: 0.02,
    //never zoom out past the whole country — beyond this the map is useless
    maxDelta: 3,
} as const;


//DEFAULT SEARCH RADIUS for nearby lookups, in km.
//
//10km covers Bujumbura end to end. It is a default, not a cap — the caller may
//ask for more, up to MAX_RADIUS_KM.
export const DEFAULT_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 200;
