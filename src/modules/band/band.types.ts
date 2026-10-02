import type { DeviceDayInput } from '../habit/index.js';

//Pairs a band with the account.
export interface PairBandInput {
  bandId: string;
  model?: string | null;
  firmware?: string | null;
}

//Daily totals read from the paired band.
export interface SyncBandInput {
  bandId: string;
  firmware?: string | null;
  days: DeviceDayInput[];
}

export interface BandOut {
  id: string;
  bandId: string;
  model: string;
  firmware: string;
  //ISO timestamps.
  pairedAt: string;
  lastSyncedAt: string | null;
}

export interface BandSyncResult {
  syncedDays: number;
  skippedDays: number;
  band: BandOut;
}
