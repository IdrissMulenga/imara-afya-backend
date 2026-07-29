import Medication from './../../models/medication.js';
import MedicationLog from './../../models/medicationLog.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { AddMedicationArgs, UpdateMedicationArgs, RemoveMedicationArgs, MarkMedicationTakenArgs, MyMedicationLogsArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"


//shape a medication log document into the GraphQL MedicationDose type
const toDose = (log: any) => ({
  id: log.id,
  medicationId: String(log.get('medication')),
  status: log.get('status'),
  takenAt: log.get('takenAt'),
});



export default {
  Query: {
    //LIST THE LOGGED IN USER'S MEDICATIONS
    myMedications: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      //only return medications that belong to the logged in user
      return Medication.find({ user: context.user!.id }).sort({ createdAt: -1 }).limit(LIMITS.medications);
    },

    //LIST DOSE LOGS (optionally for one medication and/or one day)
    myMedicationLogs: async (_: unknown, { medicationId, date }: MyMedicationLogsArgs, context: Context) => {
      authCheck(context);

      const filter: any = { user: context.user!.id };

      //optional filters: a specific medication and/or a specific day
      if (medicationId) filter.medication = medicationId;
      if (date) filter.takenAt = { $regex: `^${date}` };

      const logs = await MedicationLog.find(filter).sort({ takenAt: -1 }).limit(LIMITS.medicationLogs);

      return logs.map(toDose);
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

    //RECORD THAT A DOSE WAS TAKEN (or skipped) — powers adherence + reminders
    markMedicationTaken: async (_: unknown, { medicationId, takenAt, status }: MarkMedicationTakenArgs, context: Context) => {
      authCheck(context);

      try {
        //make sure the medication exists and belongs to this user
        const medication = await Medication.findOne({ _id: medicationId, user: context.user!.id });

        if (!medication) {
          throw new GraphQLError('Medication not found', {
            extensions: { code: 'MEDICATION_NOT_FOUND' },
          });
        }

        //default to "now" and "taken" when the caller doesn't specify
        const log = new MedicationLog({
          user: context.user!.id,
          medication: medication.id,
          status: status ?? 'taken',
          takenAt: takenAt ?? new Date().toISOString(),
        });

        await log.save();

        return toDose(log);
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //bad status value (not in the enum) lands here
        if (error?.name === 'ValidationError') {
          throw new GraphQLError('Invalid dose data', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        throw new GraphQLError('Unexpected error while logging dose', {
          extensions: { code: 'DOSE_LOG_FAILED' },
        });
      }
    },
  },
};
