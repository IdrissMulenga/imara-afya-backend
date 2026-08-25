import Guidance from './../../models/guidance.js';
import type { Context } from "../context.js"
import { authCheck, adminCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { GuidanceArgs, AddGuidanceArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"
import { rethrow } from "../../utils/resolverHelpers.js"


export default {
  Query: {
    //READ THE PUBLISHED GUIDANCE LIBRARY, OPTIONALLY NARROWED DOWN
    guidance: async (_: unknown, { category, language }: GuidanceArgs, context: Context) => {
      authCheck(context);

      //drafts should never reach the app
      const filter: any = { published: true };

      if (category) filter.category = category;
      if (language) filter.language = language;

      //newest first. This used to sort by `kind` as well, from when the library
      //held religious content that had to come first — with one kind left, that
      //part of the sort only cost the database work.
      return Guidance.find(filter).sort({ createdAt: -1 }).limit(LIMITS.guidance);
    },
  },

  Mutation: {
    //ADD A PIECE OF GUIDANCE (admin only — this content is shown to every user)
    addGuidance: async (_: unknown, { input }: AddGuidanceArgs, context: Context) => {
      authCheck(context);
      adminCheck(context);

      const { category, kind, title, body, source, language, published } = input

      try {
        //Medical guidance must be attributable. Everyone reads this library and
        //takes it as advice, so a claim with no reference behind it does not go
        //in — the old check only demanded this of religious content, which no
        //longer exists, leaving the medical content unchecked.
        if (!source?.trim()) {
          throw new GraphQLError('Guidance requires a source (a medical reference)', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const entry = new Guidance({
          category, kind, title, body, source: source.trim(), language, published,
        });

        await entry.save();

        return entry;
      } catch (error) {
        //an out of enum category / kind / language lands here
        throw rethrow(
          error, 'Unexpected error while adding guidance', 'GUIDANCE_CREATE_FAILED',
          'Invalid guidance data',
        );
      }
    },
  },
};
