import mongoose, { type Model } from "mongoose"
import CheckIn from './../models/checkIn.js';
import HabitLog from './../models/habitLog.js';
import HealthRecord from './../models/healthRecord.js';
import Medication from './../models/medication.js';
import MedicationLog from './../models/medicationLog.js';
import PeriodCycle from './../models/periodCycle.js';
import Pregnancy from './../models/pregnancy.js';
import { Routine, RoutineLog } from './../models/routine.js';


//EVERY COLLECTION THAT HOLDS SOMETHING BELONGING TO A USER.
//
//Deleting an account has to empty all of them. Keeping the list in one place is
//the point: when a new user-owned model is added later, this is the single
//spot to update, and forgetting it means personal health data survives a
//deletion the user was told was complete.
//
//If you add a model with `user: { ref: "User" }`, add it here.
//
//That warning was already ignored once: check-ins, routines and routine logs
//shipped with the wellbeing feature and were never added, so for a while
//"delete my account" left a person's mood history and daily habits sitting in
//the database — and countUserData below, which exists to catch exactly that,
//was iterating the same short list and reporting a confident zero.
const USER_OWNED: { label: string; model: Model<any> }[] = [
    { label: 'health records', model: HealthRecord },
    { label: 'medications', model: Medication },
    { label: 'medication doses', model: MedicationLog },
    { label: 'period cycles', model: PeriodCycle },
    { label: 'pregnancies', model: Pregnancy },
    { label: 'habit logs', model: HabitLog },
    { label: 'check-ins', model: CheckIn },
    { label: 'routines', model: Routine },
    { label: 'routine logs', model: RoutineLog },
];


//Remove everything this user owns, and report what went. The counts are logged
//rather than returned — a user asking to be forgotten does not need a receipt
//itemising their reproductive health records.
export const purgeUserData = async (userId: string) => {
    const summary: Record<string, number> = {};

    for (const { label, model } of USER_OWNED) {
        const result = await model.deleteMany({ user: userId });
        summary[label] = result.deletedCount ?? 0;
    }

    return summary;
};


//A safety net for the test suite and for anyone auditing a deletion: returns
//how many documents still reference this user. Should be zero after a purge.
export const countUserData = async (userId: string) => {
    let total = 0;

    for (const { model } of USER_OWNED) {
        total += await model.countDocuments({ user: userId });
    }

    return total;
};


//THE CHECK THAT THE COMMENT ABOVE COULDN'T MAKE.
//
//A comment saying "add your model here" is only as good as the next person
//reading it, and three models already slipped past it. Mongoose knows every
//schema that has been registered, so ask it instead: anything with a `user`
//path that isn't in the list is personal data we would fail to delete.
//
//Called at startup so it fails on the developer's machine, loudly, rather than
//in front of a user who was told their account was gone.
export const assertPurgeCoverage = () => {
    const covered = new Set(USER_OWNED.map(({ model }) => model.modelName));

    const missing = Object.values(mongoose.models)
        .filter((model) => model.schema.path('user') && !covered.has(model.modelName))
        .map((model) => model.modelName);

    if (missing.length) {
        throw new Error(
            `These models hold user data but are not purged on account deletion: ${missing.join(', ')}. `
            + 'Add them to USER_OWNED in src/services/accountService.ts.',
        );
    }
};
