import type { TrustedDevice } from '../entities/trusted-device.entity.js';

export interface TrustedDeviceRepository {
  find(userId: string, deviceId: string): Promise<TrustedDevice | null>;

  listForUser(userId: string, limit: number): Promise<TrustedDevice[]>;

  //Grant or extend trust. An upsert, so signing in twice from the same phone
  //refreshes the window instead of creating a second row.
  trust(data: {
    userId: string;
    deviceId: string;
    label: string;
    now: Date;
    expiresAt: Date;
  }): Promise<void>;

  touch(userId: string, deviceId: string, now: Date, expiresAt: Date): Promise<void>;

  //Scoped by user as well as id — without the user filter any authenticated
  //caller could revoke any row by guessing an id. Returns false when nothing
  //matched, so the use case can report it rather than silently succeeding.
  revokeById(userId: string, id: string): Promise<boolean>;

  deleteAllForUser(userId: string): Promise<void>;
}
