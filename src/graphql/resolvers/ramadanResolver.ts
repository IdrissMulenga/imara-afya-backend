import Medication from './../../models/medication.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { SetRamadanModeArgs } from "../../utils/types.js"


//"HH:mm" in 24h form
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

//minutes since midnight, so times are easy to compare
const toMinutes = (time: string) => {
    const [h, m] = time.split(':');
    return Number(h) * 60 + Number(m);
};

const MIDDAY = 12 * 60;

//NOTE: this is scheduling help only, not medical advice — a user should always
//confirm with their doctor or pharmacist before moving a dose.
//shift a dose time that lands inside the fasting window to the nearest
//non-fasting slot: morning doses go to suhoor, afternoon doses go to iftar.
//anything already outside the window is left alone.
const adjustTime = (time: string, suhoor: string, iftar: string) => {
    //leave anything we can't parse exactly as it is
    if (!timePattern.test(time)) return time;

    const minutes = toMinutes(time);
    const suhoorMinutes = toMinutes(suhoor);
    const iftarMinutes = toMinutes(iftar);

    //outside the fasting window — no change needed
    if (minutes < suhoorMinutes || minutes > iftarMinutes) return time;

    return minutes < MIDDAY ? suhoor : iftar;
};



export default {
  Query: {
    //RAMADAN SETTINGS + WHAT THE USER'S DOSE TIMES BECOME WHILE FASTING
    ramadanSchedule: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      const user = context.user!;
      const enabled = user.get('ramadanMode') ?? false;
      const suhoorTime = user.get('suhoorTime') ?? null;
      const iftarTime = user.get('iftarTime') ?? null;

      const medications = await Medication.find({ user: user.id, active: true }).sort({ name: 1 });

      //without the mode on, or without both times set, we can't shift anything
      const canAdjust = enabled && !!suhoorTime && !!iftarTime;

      return {
        enabled,
        suhoorTime,
        iftarTime,
        medications: medications.map((m) => {
          const originalTimes: string[] = m.get('times') ?? [];

          return {
            id: m.id,
            name: m.get('name'),
            originalTimes,
            adjustedTimes: canAdjust
              ? originalTimes.map((t) => adjustTime(t, suhoorTime, iftarTime))
              : originalTimes,
          };
        }),
      };
    },
  },

  Mutation: {
    //TURN RAMADAN MODE ON/OFF AND SAVE THE USER'S SUHOOR / IFTAR TIMES
    setRamadanMode: async (_: unknown, { input }: SetRamadanModeArgs, context: Context) => {
      authCheck(context);

      const { enabled, suhoorTime, iftarTime } = input

      try {
        //times are optional, but if sent they must be valid "HH:mm"
        if (suhoorTime !== undefined && suhoorTime !== null && !timePattern.test(suhoorTime)) {
          throw new GraphQLError('Suhoor time must be in HH:mm format', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (iftarTime !== undefined && iftarTime !== null && !timePattern.test(iftarTime)) {
          throw new GraphQLError('Iftar time must be in HH:mm format', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const user = context.user!;

        user.set('ramadanMode', enabled);

        //only overwrite the times the user actually sent
        if (suhoorTime !== undefined) user.set('suhoorTime', suhoorTime);
        if (iftarTime !== undefined) user.set('iftarTime', iftarTime);

        //suhoor should come before iftar or the fasting window makes no sense
        const suhoor = user.get('suhoorTime');
        const iftar = user.get('iftarTime');

        if (enabled && suhoor && iftar && toMinutes(suhoor) >= toMinutes(iftar)) {
          throw new GraphQLError('Suhoor time must be before iftar time', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        await user.save();

        return user;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while saving Ramadan settings', {
          extensions: { code: 'RAMADAN_UPDATE_FAILED' },
        });
      }
    },
  },
};
