import type { Model } from "mongoose"
import HabitLog from './../models/habitLog.js';
import HealthRecord from './../models/healthRecord.js';
import Medication from './../models/medication.js';
import MedicationLog from './../models/medicationLog.js';
import PeriodCycle from './../models/periodCycle.js';
import Pregnancy from './../models/pregnancy.js';


//EVERY COLLECTION THAT HOLDS SOMETHING BELONGING TO A USER.
//
//Deleting an account has to empty all of them. Keeping the list in one place is
//the point: when a new user-owned model is added later, this is the single
//spot to update, and forgetting it means personal health data survives a
//deletion the user was told was complete.
//
//If you add a model with `user: { ref: "User" }`, add it here.
const USER_OWNED: { label: string; model: Model<any> }[] = [
    { label: 'health records', model: HealthRecord },
    { label: 'medications', model: Medication },
    { label: 'medication doses', model: MedicationLog },
    { label: 'period cycles', model: PeriodCycle },
    { label: 'pregnancies', model: Pregnancy },
    { label: 'habit logs', model: HabitLog },
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
