import HabitLog from './../../models/habitLog.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { LogHabitArgs, MyHabitLogsArgs, RemoveHabitLogArgs, SetWaterGoalArgs } from "../../utils/types.js"


//plain "YYYY-MM-DD" helpers
const todayIso = () => new Date().toISOString().slice(0, 10);
const shiftDay = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

//how many days in a row (ending today, or yesterday if today isn't done yet)
//the user hit their water goal
const waterStreak = (byDay: Map<string, number>, goal: number) => {
    let streak = 0;
    let day = todayIso();

    //today not done yet shouldn't break a streak — start from yesterday
    if ((byDay.get(day) ?? 0) < goal) day = shiftDay(day, -1);

    while ((byDay.get(day) ?? 0) >= goal) {
        streak++;
        day = shiftDay(day, -1);
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
      const today = todayIso();
      const goal = user.get('waterGoal') ?? 8;

      //only the last 60 days matter for a streak, keeps the query small
      const since = shiftDay(today, -60);

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
        waterStreak: waterStreak(waterByDay, goal),
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

      return HabitLog.find(filter).sort({ date: -1 }).limit(200);
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

        const log = new HabitLog({
          user: context.user!.id,
          type,
          value,
          date: date ?? todayIso(),
        });

        await log.save();

        return log;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //bad type value (not in the enum) lands here
        if (error?.name === 'ValidationError') {
          throw new GraphQLError('Invalid habit data', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        throw new GraphQLError('Unexpected error while logging habit', {
          extensions: { code: 'HABIT_LOG_FAILED' },
        });
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
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while removing entry', {
          extensions: { code: 'HABIT_DELETE_FAILED' },
        });
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
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while saving goal', {
          extensions: { code: 'GOAL_UPDATE_FAILED' },
        });
      }
    },
  },
};
