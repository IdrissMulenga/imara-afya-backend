import Hospital from './../../models/hospital.js';
import type { Context } from "../context.js"
import { authCheck, adminCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { NearbyHospitalsArgs, HospitalsArgs, CareMapArgs, AddHospitalArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"
import { distanceKm, isPlottable, regionFor, roundKm, usableRadius, type Point } from "../../utils/geo.js"


//THE SHAPE THE APP PLOTS.
//
//Built by hand rather than returned as a mongoose document because careMap
//adds distanceKm, which is not a stored field — it depends on where the caller
//is standing.
const toFacility = (h: any) => ({
  id: h.id,
  name: h.get('name'),
  address: h.get('address'),
  phone: h.get('phone'),
  latitude: h.get('latitude'),
  longitude: h.get('longitude'),
  city: h.get('city'),
  province: h.get('province'),
  type: h.get('type'),
});


//A user typing "St. Jean (Kamenge)" into search must not be able to hand us a
//regular expression. Escaping turns every character into a literal.
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


export default {
  Query: {
    //FIND HOSPITALS NEAR A GIVEN POINT, CLOSEST FIRST
    nearbyHospitals: async (_: unknown, { latitude, longitude, radiusKm }: NearbyHospitalsArgs, context: Context) => {
      authCheck(context);

      //default to a 10km radius if none was passed
      const radius = usableRadius(radiusKm);

      const hospitals = await Hospital.find().limit(LIMITS.hospitals);

      return hospitals
        .map((h) => ({
          ...toFacility(h),
          distanceKm: roundKm(distanceKm({ latitude, longitude }, {
            latitude: h.get('latitude'),
            longitude: h.get('longitude'),
          })),
        }))
        .filter((h) => h.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    },

    //EVERYTHING THE "FIND CARE" SCREEN NEEDS, IN ONE RESPONSE.
    //
    //Filtering, text search, distance, sorting and the map's opening region are
    //all worked out here. The app used to do the last three itself, which meant
    //two implementations of the same rules and a phone doing trigonometry on
    //every keystroke. Now it renders what it is given.
    careMap: async (_: unknown, { input }: CareMapArgs, context: Context) => {
      authCheck(context);

      const { latitude, longitude, radiusKm, type, search, city, province } = input ?? {};

      const filter: any = {};

      //only apply the filters the caller actually sent
      if (city) filter.city = city;
      if (province) filter.province = province;
      if (type) filter.type = type;

      //totalCount answers "is the directory empty?", which is a different
      //problem from "nothing matched your search" and needs a different message
      const [rows, totalCount] = await Promise.all([
        Hospital.find(filter).sort({ name: 1 }).limit(LIMITS.hospitals),
        Hospital.countDocuments(filter),
      ]);

      //a row with no usable coordinates cannot be pinned, and would drag the
      //framing off into the ocean
      let facilities = rows.map(toFacility).filter(isPlottable);

      //NAME / ADDRESS SEARCH.
      //
      //Done in memory on an already-capped list rather than with a Mongo regex:
      //an unanchored regex can't use an index, so at this size the scan here is
      //both faster and cheaper than making the database do it.
      const query = search?.trim().toLowerCase();

      if (query) {
        //escaped so a stray bracket is matched, not interpreted
        const safe = new RegExp(escapeRegex(query), 'i');

        facilities = facilities.filter(
          (f) => safe.test(f.name ?? '') || safe.test(f.address ?? ''),
        );
      }

      //DISTANCE — only possible when she has shared her position. Without it
      //the list stays alphabetical, which is why location is never required.
      const here: Point | null = isPlottable({ latitude, longitude })
        ? { latitude: latitude as number, longitude: longitude as number }
        : null;

      const radius = here ? usableRadius(radiusKm) : null;

      let sortedByDistance = false;

      if (here) {
        const measured = facilities
          .map((f) => ({ ...f, distanceKm: roundKm(distanceKm(here, f)) }))
          .sort((a, b) => a.distanceKm - b.distanceKm);

        //Radius is a preference, not a promise. If nothing at all falls inside
        //it we hand back the closest anyway — "the nearest clinic is 14km away"
        //is useful, "no results" when you need care is not.
        const withinRadius = measured.filter((f) => f.distanceKm <= (radius as number));

        facilities = withinRadius.length ? withinRadius : measured;
        sortedByDistance = true;
      }

      //where the map should open: framed around the pins, plus her own position
      //so she can see how far away things are
      const points: Point[] = here ? [...facilities, here] : facilities;

      return {
        facilities,
        region: regionFor(points),
        totalCount,
        count: facilities.length,
        radiusKm: radius,
        sortedByDistance,
      };
    },

    //ALL FACILITIES, OPTIONALLY FILTERED BY AREA — this is what the map screen plots
    hospitals: async (_: unknown, { city, province, type }: HospitalsArgs, context: Context) => {
      authCheck(context);

      const filter: any = {};

      //only apply the filters the caller actually sent
      if (city) filter.city = city;
      if (province) filter.province = province;
      if (type) filter.type = type;

      return Hospital.find(filter).sort({ name: 1 }).limit(LIMITS.hospitals);
    },
  },

  Mutation: {
    //ADD A HOSPITAL TO THE DIRECTORY (admin only — a wrong location sends someone to the wrong place)
    addHospital: async (_: unknown, { input }: AddHospitalArgs, context: Context) => {
      authCheck(context);
      adminCheck(context);

      const { name, address, phone, latitude, longitude, city, province, type } = input

      try {
        const hospital = new Hospital({ name, address, phone, latitude, longitude, city, province, type });

        await hospital.save();

        return hospital;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while adding hospital', {
          extensions: { code: 'HOSPITAL_CREATE_FAILED' },
        });
      }
    },
  },
};
