//TIME, AS A DEPENDENCY.
//
//Every expiry, cooldown and streak in this codebase reads the clock. Injecting
//it means a test can prove "this code is rejected after ten minutes" without
//waiting ten minutes or stubbing a global, and every use case in one request
//sees the same instant rather than drifting apart mid-flow.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
