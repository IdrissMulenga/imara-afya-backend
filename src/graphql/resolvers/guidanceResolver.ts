import Guidance from './../../models/guidance.js';
import type { Context } from "../context.js"
import { authCheck, adminCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { GuidanceArgs, AddGuidanceArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"



export default {
  Query: {
    //READ THE PUBLISHED GUIDANCE LIBRARY, OPTIONALLY NARROWED DOWN
    guidance: async (_: unknown, { category, language }: GuidanceArgs, context: Context) => {
      authCheck(context);

      //drafts should never reach the app
      const filter: any = { published: true };

      if (category) filter.category = category;
      if (language) filter.language = language;

      //religious content first so it reads like the app groups it
      return Guidance.find(filter).sort({ kind: 1, createdAt: -1 }).limit(LIMITS.guidance);
    },
  },

  Mutation: {
    //ADD A PIECE OF GUIDANCE (admin only — this content is shown to every user)
    addGuidance: async (_: unknown, { input }: AddGuidanceArgs, context: Context) => {
      authCheck(context);
      adminCheck(context);

      const { category, kind, title, body, source, language, published } = input

      try {
        //religious guidance must be attributable — a scholar or reference is required
        //so users can tell it apart from medical advice
        if (kind === 'religious' && !source?.trim()) {
          throw new GraphQLError('Religious guidance requires a source (scholar or reference)', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const entry = new Guidance({ category, kind, title, body, source, language, published });

        await entry.save();

        return entry;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //an out of enum category / kind / language lands here
        if (error?.name === 'ValidationError') {
          throw new GraphQLError('Invalid guidance data', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        throw new GraphQLError('Unexpected error while adding guidance', {
          extensions: { code: 'GUIDANCE_CREATE_FAILED' },
        });
      }
    },
  },
};
