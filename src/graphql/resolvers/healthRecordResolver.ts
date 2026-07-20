import HealthRecord from './../../models/healthRecord.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { MyHealthRecordsArgs, AddHealthRecordArgs, UpdateHealthRecordArgs, RemoveHealthRecordArgs } from "../../utils/types.js"



export default {
  Query: {
    //LIST THE LOGGED IN USER'S HEALTH RECORDS
    myHealthRecords: async (_: unknown, { type }: MyHealthRecordsArgs, context: Context) => {
      authCheck(context);

      //only return records that belong to the logged in user
      const filter: any = { user: context.user!.id };

      //if a type was passed, filter by it (Condition, Allergy, Medication)
      if (type) filter.type = type;

      return HealthRecord.find(filter).sort({ createdAt: -1 });
    },
  },

  Mutation: {
    //ADD A HEALTH RECORD
    addHealthRecord: async (_: unknown, { input }: AddHealthRecordArgs, context: Context) => {
      authCheck(context);

      const { type, name, note } = input

      try {
        //create the record tied to the logged in user
        const record = new HealthRecord({ user: context.user!.id, type, name, note });

        await record.save();

        return record;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //bad type value (not in the enum) lands here
        if (error?.name === 'ValidationError') {
          throw new GraphQLError('Invalid health record data', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        throw new GraphQLError('Unexpected error while adding record', {
          extensions: { code: 'RECORD_CREATE_FAILED' },
        });
      }
    },

    //UPDATE A HEALTH RECORD
    updateHealthRecord: async (_: unknown, { id, input }: UpdateHealthRecordArgs, context: Context) => {
      authCheck(context);

      const { name, note } = input

      try {
        //make sure the record exists and belongs to this user
        const record = await HealthRecord.findOne({ _id: id, user: context.user!.id });

        if (!record) {
          throw new GraphQLError('Health record not found', {
            extensions: { code: 'RECORD_NOT_FOUND' },
          });
        }

        //only update the fields the user actually sent
        if (name !== undefined) record.set('name', name);
        if (note !== undefined) record.set('note', note);

        await record.save();

        return record;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while updating record', {
          extensions: { code: 'RECORD_UPDATE_FAILED' },
        });
      }
    },

    //REMOVE A HEALTH RECORD
    removeHealthRecord: async (_: unknown, { id }: RemoveHealthRecordArgs, context: Context) => {
      authCheck(context);

      try {
        //only delete a record that belongs to the logged in user
        const deleted = await HealthRecord.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Health record not found', {
            extensions: { code: 'RECORD_NOT_FOUND' },
          });
        }

        return true;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while removing record', {
          extensions: { code: 'RECORD_DELETE_FAILED' },
        });
      }
    },
  },
};
