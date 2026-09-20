import { DomainError } from '../../../domain/shared/errors/domain.error.js';
import { ErrorCode } from '../../../domain/shared/errors/error-codes.js';
import type { User, UserProps } from '../../../domain/auth/entities/user.entity.js';
import type { UserRepository } from '../../../domain/auth/repositories/user.repository.js';
import type { Clock } from '../ports/clock.port.js';
import type { ProfilePatch, PreferencesPatch } from '../dto/auth.dto.js';
import { loadUser } from './shared.js';

//PATCHING A PROFILE.
//
//THE SHAPE HERE IS THE POINT. The obvious implementation is a run of
//`if (input.x !== undefined) user.x = input.x` — thirteen branches that grow
//by one every time a field is added, with each field's validation sitting
//wherever whoever added it happened to put it.
//
//Instead each patchable field declares its own cleaner in a table, and one
//generic apply walks it. Adding a field is one line, and it is impossible to
//add one without deciding how it is validated, because the table IS the
//validation. The branches disappear rather than being centralised.

type Cleaner<TIn, TOut> = (value: TIn) => TOut;

//eslint-disable-next-line @typescript-eslint/no-explicit-any
type FieldMap<TPatch> = {
  [K in keyof TPatch]-?: {
    field: keyof UserProps;
    clean: Cleaner<NonNullable<TPatch[K]>, unknown>;
  };
};

const MAX_NAME = 80;
const CONTROL_CHARS = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

const text = (max: number, label: string): Cleaner<string, string> => {
  return (raw) => {
    const cleaned = raw.replace(CONTROL_CHARS, '').trim();
    if (cleaned.length > max) {
      throw new DomainError(ErrorCode.BAD_USER_INPUT, `${label} is too long.`);
    }
    return cleaned;
  };
};

const identity = <T>(value: T): T => value;

const bounded = (min: number, max: number, label: string): Cleaner<number, number> => {
  return (value) => {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new DomainError(ErrorCode.BAD_USER_INPUT, `${label} is out of range.`);
    }
    return value;
  };
};

const pastDate = (raw: string): Date => {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
    throw new DomainError(ErrorCode.BAD_USER_INPUT, 'That date of birth is not valid.');
  }
  return parsed;
};

//An invalid timezone would throw inside Intl on every read afterwards, which
//turns one bad write into a permanently broken account.
const timezone = (raw: string): string => {
  const trimmed = raw.trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: trimmed });
    return trimmed;
  } catch {
    throw new DomainError(ErrorCode.BAD_USER_INPUT, 'That timezone is not recognised.');
  }
};

const PROFILE_FIELDS: FieldMap<ProfilePatch> = {
  name: { field: 'name', clean: text(MAX_NAME, 'Name') },
  photoUrl: { field: 'photoUrl', clean: (v: string) => v.trim() },
  gender: { field: 'gender', clean: identity },
  birthDate: { field: 'birthDate', clean: pastDate },
  heightCm: { field: 'heightCm', clean: bounded(50, 260, 'Height') },
  weightKg: { field: 'weightKg', clean: bounded(20, 400, 'Weight') },
};

const PREFERENCE_FIELDS: FieldMap<PreferencesPatch> = {
  language: { field: 'language', clean: identity },
  units: { field: 'units', clean: identity },
  timezone: { field: 'timezone', clean: timezone },
  cycleTrackingEnabled: { field: 'cycleTrackingEnabled', clean: identity },
  waterGoalGlasses: { field: 'waterGoalGlasses', clean: bounded(1, 30, 'Water goal') },
  stepGoal: { field: 'stepGoal', clean: bounded(500, 100_000, 'Step goal') },
  sleepGoalHours: { field: 'sleepGoalHours', clean: bounded(3, 14, 'Sleep goal') },
};

const buildPatch = <TPatch extends object>(
  input: TPatch,
  fields: FieldMap<TPatch>
): Partial<UserProps> => {
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(input) as (keyof TPatch)[]) {
    const value = input[key];
    //undefined means "not sent". null is a deliberate clear and passes through.
    if (value === undefined) continue;

    const rule = fields[key];
    if (!rule) continue;

    patch[rule.field as string] = rule.clean(value as NonNullable<TPatch[keyof TPatch]>);
  }

  return patch as Partial<UserProps>;
};

export interface ProfileDeps {
  users: UserRepository;
  clock: Clock;
}

const applyAndSave = async (
  deps: ProfileDeps,
  userId: string,
  patch: Partial<UserProps>
): Promise<User> => {
  const user = await loadUser(deps.users, userId);
  user.applyPatch(patch);
  await deps.users.save(user);
  return user;
};

export const makeUpdateProfile =
  (deps: ProfileDeps) =>
  (input: { userId: string; patch: ProfilePatch }): Promise<User> =>
    applyAndSave(deps, input.userId, buildPatch(input.patch, PROFILE_FIELDS));

export const makeSetPreferences =
  (deps: ProfileDeps) =>
  (input: { userId: string; patch: PreferencesPatch }): Promise<User> =>
    applyAndSave(deps, input.userId, buildPatch(input.patch, PREFERENCE_FIELDS));
