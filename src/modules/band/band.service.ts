import type { IUser } from '../user/index.js';
import { syncDeviceDays } from '../habit/index.js';
import { Band, type IBand } from './band.model.js';
import { appError, ErrorCode } from '../../shared/errors.js';
import { isDuplicateKey } from '../../shared/upsert.js';
import { checkBandId, cleanText } from '../../shared/validation.js';
import type { BandOut, BandSyncResult, PairBandInput, SyncBandInput } from './band.types.js';

const MODEL_MAX = 80;
const FIRMWARE_MAX = 40;
//Most day entries one sync may carry.
const MAX_SYNC_DAYS = 62;

type BandFields = Pick<
  IBand,
  '_id' | 'bandId' | 'bandModel' | 'firmware' | 'pairedAt' | 'lastSyncedAt'
>;

const toBandOut = (band: BandFields): BandOut => ({
  id: String(band._id),
  bandId: band.bandId,
  model: band.bandModel ?? '',
  firmware: band.firmware ?? '',
  pairedAt: band.pairedAt.toISOString(),
  lastSyncedAt: band.lastSyncedAt?.toISOString() ?? null,
});

const alreadyPaired = () =>
  appError(
    ErrorCode.BAND_ALREADY_PAIRED,
    'Another band is already paired with your account. Remove it first.'
  );

const taken = () => appError(ErrorCode.BAND_TAKEN, 'That band is paired with another account.');

const notPaired = () =>
  appError(ErrorCode.BAND_NOT_PAIRED, 'That band is not paired with your account.');

//The user's paired band, or null.
export const getBand = async (user: IUser): Promise<BandOut | null> => {
  const band = await Band.findOne({ user: user._id }).lean<BandFields | null>();
  return band ? toBandOut(band) : null;
};

//Pairs a band. Pairing the band already paired refreshes its details; any other band is refused.
export const pairBand = async (user: IUser, input: PairBandInput): Promise<BandOut> => {
  const bandId = checkBandId(input.bandId);
  const details: Partial<Pick<IBand, 'bandModel' | 'firmware'>> = {};
  if (input.model != null) details.bandModel = cleanText(input.model, MODEL_MAX, 'bandModel');
  if (input.firmware != null) {
    details.firmware = cleanText(input.firmware, FIRMWARE_MAX, 'firmware');
  }

  const existing = await Band.findOne({ user: user._id });
  if (existing) {
    if (existing.bandId !== bandId) throw alreadyPaired();
    existing.set(details);
    await existing.save();
    return toBandOut(existing);
  }

  if (await Band.exists({ bandId })) throw taken();

  try {
    const saved = await Band.create({ user: user._id, bandId, ...details });
    return toBandOut(saved);
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    throw 'bandId' in keyPattern ? taken() : alreadyPaired();
  }
};

//Removes the paired band. Returns false if there was none.
export const unpairBand = async (user: IUser): Promise<boolean> => {
  const result = await Band.deleteOne({ user: user._id });
  return result.deletedCount > 0;
};

//Saves daily steps and sleep from the paired band; any other band is refused.
export const syncBand = async (user: IUser, input: SyncBandInput): Promise<BandSyncResult> => {
  const bandId = checkBandId(input.bandId);
  const days = input.days ?? [];
  if (days.length > MAX_SYNC_DAYS) {
    throw appError(
      ErrorCode.BAD_USER_INPUT,
      'Some of that is not valid. Please check and try again.'
    );
  }
  const firmware =
    input.firmware != null ? cleanText(input.firmware, FIRMWARE_MAX, 'firmware') : undefined;

  const band = await Band.findOne({ user: user._id });
  if (!band || band.bandId !== bandId) throw notPaired();

  const { syncedDays, skippedDays } = await syncDeviceDays(user, days);

  band.lastSyncedAt = new Date();
  if (firmware !== undefined) band.firmware = firmware;
  await band.save();

  return { syncedDays, skippedDays, band: toBandOut(band) };
};
