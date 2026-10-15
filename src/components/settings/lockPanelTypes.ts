export type LockActivityKind = 'lock' | 'unlock' | 'open' | 'jam' | 'other';

/** One change of the lock, as Home Assistant's logbook or this panel recorded it. */
export type LockActivityEntry = {
  id: string;
  /** A ready-made sentence, for entries that carry nothing else. */
  text: string;
  timestampMs?: number;
  kind?: LockActivityKind;
  /** The person who acted, when Home Assistant knows one. */
  userActor?: string;
  /** Where the change came from: the lock itself, an automation, this panel. */
  source?: { kind: 'lock' } | { kind: 'automation'; name: string } | { kind: 'panel' };
};

export type LockActivityStatus = 'idle' | 'loading' | 'available' | 'empty' | 'unavailable' | 'offline';

/** What an unlock asks for: a confirmation on the device, the lock code, or nothing. */
export type LockProtection = 'device' | 'code' | 'none';

export type LockPanelData = {
  name: string;
  state: string;
  status?: string;
  changedBy?: string;
  activityLogLimit?: number;
  activityLogHours?: number;
  activityTimeline?: LockActivityEntry[];
  activityTimelineStatus?: LockActivityStatus;
  supportedFeatures?: number;
  batteryLevel?: number;
  connection?: {
    state: 'online' | 'offline' | 'unknown';
    label: string;
  };
  rawAttributes?: Record<string, unknown>;
  lockCode?: string;
  protection?: LockProtection;
};
