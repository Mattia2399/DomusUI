/* What the Home says about a camera and a media player when it asks the panels to act. */

export type { CameraPtzDirection } from '../camera/CameraPtzJoystick';

export type CameraRelatedEntityCategory = 'detection' | 'diagnostic' | 'control' | 'action' | 'media' | 'other';

export type CameraRelatedEntityInfo = {
  entityId: string;
  name: string;
  domain: string;
  category: CameraRelatedEntityCategory;
  state?: string;
  stateLabel?: string;
  unit?: string;
  deviceClass?: string;
  icon?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  numericValue?: number;
};

export type CameraDeviceInfo = {
  id?: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
  hwVersion?: string;
  areaId?: string;
  configurationUrl?: string;
};

export type CameraRelatedEntityActionRequest = {
  entity: CameraRelatedEntityInfo;
  action: 'toggle' | 'press' | 'select' | 'set_value';
  value?: string | number | boolean;
};

export type CameraHistoryEntry = {
  entityId: string;
  state: string;
  timestampMs: number;
  attributes?: Record<string, unknown>;
};

export type CameraHistoryStatus = 'idle' | 'loading' | 'available' | 'empty' | 'error' | 'offline';

export type MediaPlayRequest = {
  mediaContentId: string;
  mediaContentType: string;
  enqueue?: 'add' | 'next' | 'play' | 'replace';
  announce?: boolean;
};
