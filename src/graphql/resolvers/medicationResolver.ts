import Medication from './../../models/medication.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { AddMedicationArgs, UpdateMedicationArgs, RemoveMedicationArgs } from "../../utils/types.js"



export default {
  Query: {
    //LIST THE LOGGED IN USER'S MEDICATIONS
    myMedications: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      //only return medications that belong to the logged in user
      return Medication.find({ user: context.user!.id }).sort({ createdAt: -1 });
    },
  },

  Mutation: {
    //ADD A MEDICATION REMINDER
    addMedication: async (_: unknown, { input }: AddMedicationArgs, context: Context) => {
      authCheck(context);

      const { name, dosage, times, frequency } = input

      try {
        //create the medication tied to the logged in user
        const medication = new Medication({ user: context.user!.id, name, dosage, times, frequency });

        await medication.save();

        return medication;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while adding medication', {
          extensions: { code: 'MEDICATION_CREATE_FAILED' },
        });
      }
    },

    //UPDATE A MEDICATION (also used to turn the reminder on/off via active)
    updateMedication: async (_: unknown, { id, input }: UpdateMedicationArgs, context: Context) => {
      authCheck(context);

      const { name, dosage, times, frequency, active } = input

      try {
        //make sure the medication exists and belongs to this user
        const medication = await Medication.findOne({ _id: id, user: context.user!.id });

        if (!medication) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        //only update the fields the user actually sent
        if (name !== undefined) medication.set('name', name);
        if (dosage !== undefined) medication.set('dosage', dosage);
        if (times !== undefined) medication.set('times', times);
        if (frequency !== undefined) medication.set('frequency', frequency);
        if (active !== undefined) medication.set('active', active);

        await medication.save();

        return medication;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while updating medication', {
          extensions: { code: 'MEDICATION_UPDATE_FAILED' },
        });
      }
    },

    //REMOVE A MEDICATION
    removeMedication: async (_: unknown, { id }: RemoveMedicationArgs, context: Context) => {
      authCheck(context);

      try {
        //only delete a medication that belongs to the logged in user
        const deleted = await Medication.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        return true;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while removing medication', {
          extensions: { code: 'MEDICATION_DELETE_FAILED' },
        });
      }
    },
  },
};
