import Hospital from './../../models/hospital.js';
import type { Context } from "../context.js"
import { authCheck, adminCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { NearbyHospitalsArgs, HospitalsArgs, AddHospitalArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"


//distance in km between two lat/lng points (haversine formula)
const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; //earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};



export default {
  Query: {
    //FIND HOSPITALS NEAR A GIVEN POINT, CLOSEST FIRST
    nearbyHospitals: async (_: unknown, { latitude, longitude, radiusKm }: NearbyHospitalsArgs, context: Context) => {
      authCheck(context);

      //default to a 10km radius if none was passed
      const radius = radiusKm ?? 10;

      const hospitals = await Hospital.find().limit(LIMITS.hospitals);

      return hospitals
        .map((h) => ({
          id: h.id,
          name: h.get('name'),
          address: h.get('address'),
          phone: h.get('phone'),
          latitude: h.get('latitude'),
          longitude: h.get('longitude'),
          distanceKm: distanceKm(latitude, longitude, h.get('latitude'), h.get('longitude')),
        }))
        .filter((h) => h.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
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
