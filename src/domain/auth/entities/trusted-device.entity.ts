//A PHONE THAT SKIPS THE CODE.
//
//Reduces friction; adds no factor. The identifier is caller-supplied, so
//someone holding a valid password and a stolen identifier skips the code —
//they need both, and the password is still checked. See device-id.vo.ts.

export interface TrustedDeviceProps {
  id: string;
  userId: string;
  deviceId: string;
  //"Android 14 · Tecno" — shown in settings so a user can recognise which
  //phone a row refers to before revoking it.
  label: string;
  lastSeenAt: Date;
  expiresAt: Date;
}

export class TrustedDevice {
  constructor(private readonly props: TrustedDeviceProps) {}

  get id(): string {
    return this.props.id;
  }
  get deviceId(): string {
    return this.props.deviceId;
  }
  get label(): string {
    return this.props.label;
  }
  get lastSeenAt(): Date {
    return this.props.lastSeenAt;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get snapshot(): Readonly<TrustedDeviceProps> {
    return { ...this.props };
  }

  //Checked here as well as by the database's TTL index, for the same reason as
  //the codes: the index sweeps on its own schedule.
  isValid(now: Date): boolean {
    return this.props.expiresAt.getTime() > now.getTime();
  }
}
