import type { MicroWidget } from '../../types/dashboardModels';

export type ActiveDeviceType =
  | 'light'
  | 'switch'
  | 'fan'
  | 'humidifier'
  | 'climate'
  | 'camera'
  | 'sensor'
  | 'media'
  | 'weather'
  | 'alarm'
  | 'vacuum'
  | 'lock'
  | 'cover'
  | 'calendar'
  | 'members';
export type SensorConnectionState = 'online' | 'offline' | 'unknown';

export type MembersPresenceEntry = {
  id: string;
  personEntityId: string;
  name: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  locationSourceEntityId?: string;
  state?: string;
  trackerEntityIds: string[];
  isCurrent?: boolean;
  roleLabel?: string;
  avatarUrl?: string;
  locationLabel?: string;
  devices: {
    smartwatch: number;
    tablet: number;
    smartphone: number;
    tracker: number;
  };
};

export type MembersMapPoint = MembersPresenceEntry & {
  latitude: number;
  longitude: number;
};

export interface ActiveDevice {
  id: string;
  name: string;
  type: ActiveDeviceType;
  microWidgets?: MicroWidget[];
  status?: string;
  sensorValue?: number;
  sensorUnit?: string;
  sensorEntityId?: string;
  sensorRawState?: string;
  sensorDataSource?: 'ha' | 'mock';
  sensorDeviceClass?: string;
  sensorDisplayPrecision?: number;
  sensorHistory?: number[];
  sensorBattery?: string;
  sensorConnection?: string;
  sensorConnectionState?: SensorConnectionState;
  switchEntityId?: string;
  fanEntityId?: string;
  humidifierEntityId?: string;
  switchConsumptionEntityId?: string;
  alarmState?: string;
  alarmCodeRequired?: boolean;
  alarmChangedBy?: string;
  alarmSupportedFeatures?: number;
  vacuumState?: string;
  vacuumBatteryLevel?: number;
  vacuumFanSpeed?: string;
  vacuumMapUrl?: string;
  lockState?: string;
  lockChangedBy?: string;
  lockSupportsOpen?: boolean;
  coverState?: string;
  coverPosition?: number;
  coverTiltPosition?: number;
  coverSupportedFeatures?: number;
  calendarEntityId?: string;
  calendarSupportedFeatures?: number;
  membersPresence?: MembersPresenceEntry[];
  membersMapPoints?: MembersMapPoint[];
}
