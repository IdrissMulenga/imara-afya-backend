import HealthRecord from './../../models/healthRecord.js';
import type { Context } from "../context.js"
import { authCheck, premiumCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { MyHealthRecordsArgs, AddHealthRecordArgs, UpdateHealthRecordArgs, RemoveHealthRecordArgs, AddAttachmentArgs, RemoveAttachmentArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"
import { rethrow } from "../../utils/resolverHelpers.js"


//HOW MANY FILES MAY HANG OFF ONE RECORD.
//
//Attachments are stored inside the record document, and a mongo document may
//not exceed 16MB. Unbounded, a loop calling addAttachment would eventually
//push a record past that — at which point it can no longer be saved OR
//repaired through the API, so one person's prescription history is stuck for
//good. A cap turns that into a message.
const MAX_ATTACHMENTS = 20;

//The app uploads to Cloudinary and sends back the hosted URL, so this should
//only ever be an http(s) link. Rejecting anything else keeps a base64 blob —
//or a `javascript:` string headed for a WebView — out of the document.
const URL_RE = /^https?:\/\/\S+$/i;


export default {
  Query: {
    //LIST THE LOGGED IN USER'S HEALTH RECORDS
    myHealthRecords: async (_: unknown, { type }: MyHealthRecordsArgs, context: Context) => {
      authCheck(context);

      //only return records that belong to the logged in user
      const filter: any = { user: context.user!.id };

      //if a type was passed, filter by it (Condition, Allergy, Medication)
      if (type) filter.type = type;

      return HealthRecord.find(filter).sort({ createdAt: -1 }).limit(LIMITS.healthRecords);
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
      } catch (error) {
        //bad type value (not in the enum) lands here
        throw rethrow(
          error, 'Unexpected error while adding record', 'RECORD_CREATE_FAILED',
          'Invalid health record data',
        );
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
      } catch (error) {
        throw rethrow(error, 'Unexpected error while updating record', 'RECORD_UPDATE_FAILED');
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
      } catch (error) {
        throw rethrow(error, 'Unexpected error while removing record', 'RECORD_DELETE_FAILED');
      }
    },

    //ADD AN ATTACHMENT TO A RECORD (PREMIUM)
    addAttachment: async (_: unknown, { recordId, input }: AddAttachmentArgs, context: Context) => {
      authCheck(context);
      premiumCheck(context);

      const { url, name } = input

      try {
        //make sure the record exists and belongs to this user
        const record = await HealthRecord.findOne({ _id: recordId, user: context.user!.id });

        if (!record) {
          throw new GraphQLError('Health record not found', {
            extensions: { code: 'RECORD_NOT_FOUND' },
          });
        }

        if (!URL_RE.test(url?.trim() ?? '')) {
          throw new GraphQLError('Attachment must be an http(s) link', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const attachments = record.get('attachments');

        if (attachments.length >= MAX_ATTACHMENTS) {
          throw new GraphQLError(`A record can hold up to ${MAX_ATTACHMENTS} files`, {
            extensions: { code: 'LIMIT_REACHED' },
          });
        }

        //push the new attachment onto the record
        attachments.push({ url: url.trim(), name: name?.trim() || undefined });

        await record.save();

        return record;
      } catch (error) {
        throw rethrow(error, 'Unexpected error while adding attachment', 'ATTACHMENT_ADD_FAILED');
      }
    },

    //REMOVE AN ATTACHMENT FROM A RECORD (PREMIUM)
    removeAttachment: async (_: unknown, { recordId, attachmentId }: RemoveAttachmentArgs, context: Context) => {
      authCheck(context);
      premiumCheck(context);

      try {
        //make sure the record exists and belongs to this user
        const record = await HealthRecord.findOne({ _id: recordId, user: context.user!.id });

        if (!record) {
          throw new GraphQLError('Health record not found', {
            extensions: { code: 'RECORD_NOT_FOUND' },
          });
        }

        //find the attachment inside the record
        const attachment = record.get('attachments').id(attachmentId);

        if (!attachment) {
          throw new GraphQLError('Attachment not found', {
            extensions: { code: 'ATTACHMENT_NOT_FOUND' },
          });
        }

        //remove it and save
        attachment.deleteOne();

        await record.save();

        return record;
      } catch (error) {
        throw rethrow(
          error, 'Unexpected error while removing attachment', 'ATTACHMENT_REMOVE_FAILED',
        );
      }
    },
  },
};
