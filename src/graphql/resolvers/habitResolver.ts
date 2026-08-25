import HabitLog from './../../models/habitLog.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { LogHabitArgs, MyHabitLogsArgs, RemoveHabitLogArgs, SetWaterGoalArgs } from "../../utils/types.js"
import { LIMITS } from "../../utils/limits.js"
import { addDays } from "../../utils/datetime.js"
import { assertPastDate, rethrow, userToday } from "../../utils/resolverHelpers.js"


//how many days in a row (ending today, or yesterday if today isn't done yet)
//the user hit their water goal.
//
//`today` is handed in rather than read here — this file used to work out its
//own "today" from UTC, which broke the streak for anyone whose evening falls on
//the previous UTC day. Whose calendar we mean is now the caller's decision.
const waterStreak = (byDay: Map<string, number>, goal: number, today: string) => {
    let streak = 0;
    let day = today;

    //today not done yet shouldn't break a streak — start from yesterday
    if ((byDay.get(day) ?? 0) < goal) day = addDays(day, -1);

    //Bounded by the number of days actually logged. The caller only ever
    //queries a 60-day window so this could not really run away, but an
    //unbounded loop whose exit depends on database contents is worth not
    //having at all.
    for (let i = 0; i < byDay.size; i += 1) {
        if ((byDay.get(day) ?? 0) < goal) break;

        streak++;
        day = addDays(day, -1);
    }

    return streak;
};

//standard WHO categories
const bmiCategory = (bmi: number) => {
    if (bmi < 18.5) return 'underweight';
    if (bmi < 25) return 'normal';
    if (bmi < 30) return 'overweight';
    return 'obese';
};



export default {
  Query: {
    //TODAY'S HABITS + STREAK + BMI — powers the dashboard rings
    habitSummary: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      const user = context.user!;
      const today = userToday(context);
      const goal = user.get('waterGoal') ?? 8;

      //only the last 60 days matter for a streak, keeps the query small
      const since = addDays(today, -60);

      const logs = await HabitLog.find({
        user: user.id,
        date: { $gte: since },
      }).sort({ date: -1 });

      //water is cumulative per day, so sum each day's entries
      const waterByDay = new Map<string, number>();
      let sleepLastNight: number | null = null;
      let latestWeight: number | null = null;

      for (const log of logs) {
        const type = log.get('type');
        const date = log.get('date');
        const value = log.get('value');

        if (type === 'water') {
          waterByDay.set(date, (waterByDay.get(date) ?? 0) + value);
        } else if (type === 'sleep' && sleepLastNight === null) {
          //logs are newest first, so the first one we see is the latest
          sleepLastNight = value;
        } else if (type === 'weight' && latestWeight === null) {
          latestWeight = value;
        }
      }

      const waterToday = waterByDay.get(today) ?? 0;

      //fall back to the profile weight when nothing has been logged yet
      const weight = latestWeight ?? user.get('weight') ?? null;
      const height = user.get('height') ?? null;

      let bmi: number | null = null;
      if (weight && height) {
        const metres = height / 100;
        bmi = Math.round((weight / (metres * metres)) * 10) / 10;
      }

      return {
        date: today,
        waterToday,
        waterGoal: goal,
        waterGoalMet: waterToday >= goal,
        waterStreak: waterStreak(waterByDay, goal, today),
        sleepLastNight,
        latestWeight: weight,
        bmi,
        bmiCategory: bmi ? bmiCategory(bmi) : null,
      };
    },

    //RAW LOGS FOR TRENDS (e.g. weight over the last month)
    myHabitLogs: async (_: unknown, { type, from, to }: MyHabitLogsArgs, context: Context) => {
      authCheck(context);

      const filter: any = { user: context.user!.id, type };

      //optional date window
      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = from;
        if (to) filter.date.$lte = to;
      }

      return HabitLog.find(filter).sort({ date: -1 }).limit(LIMITS.habitLogs);
    },
  },

  Mutation: {
    //LOG A HABIT ENTRY (a glass of water, a night's sleep, a weigh-in)
    logHabit: async (_: unknown, { input }: LogHabitArgs, context: Context) => {
      authCheck(context);

      const { type, value, date } = input

      try {
        //guard against nonsense values that would skew the summary
        if (!Number.isFinite(value) || value <= 0) {
          throw new GraphQLError('Value must be greater than zero', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (type === 'sleep' && value > 24) {
          throw new GraphQLError('Sleep cannot be more than 24 hours', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (type === 'weight' && (value < 2 || value > 500)) {
          throw new GraphQLError('Please enter a realistic weight in kg', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //an unchecked date went straight into the document before, so a typo
        //filed a log under a day that never existed and quietly skewed the
        //summary
        const day = date ? assertPastDate(date, userToday(context)) : userToday(context);

        const log = new HabitLog({
          user: context.user!.id,
          type,
          value,
          date: day,
        });

        await log.save();

        return log;
      } catch (error) {
        //bad type value (not in the enum) lands here
        throw rethrow(
          error, 'Unexpected error while logging habit', 'HABIT_LOG_FAILED', 'Invalid habit data',
        );
      }
    },

    //REMOVE AN ENTRY (mis-tap on the water button, etc.)
    removeHabitLog: async (_: unknown, { id }: RemoveHabitLogArgs, context: Context) => {
      authCheck(context);

      try {
        const deleted = await HabitLog.findOneAndDelete({ _id: id, user: context.user!.id });

        if (!deleted) {
          throw new GraphQLError('Habit entry not found', {
            extensions: { code: 'HABIT_LOG_NOT_FOUND' },
          });
        }

        return true;
      } catch (error) {
        throw rethrow(error, 'Unexpected error while removing entry', 'HABIT_DELETE_FAILED');
      }
    },

    //LET THE USER PICK THEIR DAILY WATER TARGET
    setWaterGoal: async (_: unknown, { glasses }: SetWaterGoalArgs, context: Context) => {
      authCheck(context);

      try {
        if (glasses < 1 || glasses > 30) {
          throw new GraphQLError('Water goal must be between 1 and 30 glasses', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const user = context.user!;

        user.set('waterGoal', glasses);

        await user.save();

        return user;
      } catch (error) {
        throw rethrow(error, 'Unexpected error while saving goal', 'GOAL_UPDATE_FAILED');
      }
    },
  },
};
