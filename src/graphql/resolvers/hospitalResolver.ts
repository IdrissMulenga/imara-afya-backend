import Hospital from './../../models/hospital.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { NearbyHospitalsArgs, AddHospitalArgs } from "../../utils/types.js"


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

      const hospitals = await Hospital.find();

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
  },

  Mutation: {
    //ADD A HOSPITAL TO THE DIRECTORY (used to seed data for now)
    addHospital: async (_: unknown, { input }: AddHospitalArgs, context: Context) => {
      authCheck(context);

      const { name, address, phone, latitude, longitude } = input

      try {
        const hospital = new Hospital({ name, address, phone, latitude, longitude });

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
