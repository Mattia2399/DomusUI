import type React from 'react';
import type { MockEntityStateMap } from '../../types/ha';
import { resolveDeviceKind, type DeviceKind } from '../devices/model/entityKind';
import { resolvePanel } from '../devices/panels/resolvePanel';
import type { AlarmPanelCommands, AlarmPanelModel } from '../devices/panels/AlarmPanel';
import type { VacuumPanelCommands, VacuumPanelModel } from '../devices/panels/entries/vacuum';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import type { WeatherPanelInput } from '../devices/panels/entries/weather';
import type { WasteTypeStyleMap } from '../../services/calendarClient';
import type { VacuumMappedArea } from '../widgets/vacuumDeviceModel';
import type { LockPanelData } from './lockPanelTypes';
import type { CameraPanelModel, CameraRelatedAction } from '../devices/panels/entries/camera';
import type { ActiveDevice } from './types';

/*
 * Which cards of the Home open a shared panel. The column asks this at once,
 * while the panels and their models load only when one opens (HomePanel.tsx).
 * A card whose entity cannot be read here says so (UnavailablePanel.tsx).
 */

export type HomeLamp = {
  name: string;
  isOn: boolean;
  brightness: number;
  status?: string;
  hsColor?: [number, number] | number[];
  colorTemp?: number;
  supportsBrightness?: boolean;
  supportsColorTemp?: boolean;
  supportsColor?: boolean;
  supportsWhite?: boolean;
  supportsEffects?: boolean;
  supportsFlash?: boolean;
  minColorTempKelvin?: number;
  maxColorTempKelvin?: number;
  effect?: string;
  effectList?: string[];
};

export type HomeClimate = {
  mode: string;
  currentTemp: number;
  targetTemp: number;
  minTemp: number;
  maxTemp: number;
  targetTempLow?: number;
  targetTempHigh?: number;
  targetTempStep?: number;
  hvacModes?: string[];
  hvacAction?: string;
  fanMode?: string;
  fanModes?: string[];
  currentHumidity?: number;
  targetHumidity?: number;
  minHumidity?: number;
  maxHumidity?: number;
  targetHumidityStep?: number;
  presetMode?: string;
  presetModes?: string[];
  swingMode?: string;
  swingModes?: string[];
  swingHorizontalMode?: string;
  swingHorizontalModes?: string[];
  supportsTargetHumidity?: boolean;
  supportsSwingHorizontalMode?: boolean;
};

export type HomeSpeaker = {
  status: string;
  coverUrl?: string;
  rawAttributes?: Record<string, unknown>;
  multiroomDevices?: Array<{ id: string; name: string; subtitle?: string; grouped?: boolean }>;
};

export type HomeCover = {
  state: string;
  position?: number;
  tiltPosition?: number;
  supportedFeatures?: number;
  rawAttributes?: Record<string, unknown>;
};

export type HomePanelActions = {
  toggleLamp: () => void;
  setLampBrightness: (value: number) => void;
  setLampColorTemp: (kelvin: number) => void;
  setLampHsColor: (hs: [number, number]) => void;
  setLampWhite: (value: number) => void;
  setLampEffect: (effect: string) => void;
  flashLamp: (mode: 'short' | 'long') => void;
  toggleClimatePower: () => void;
  setClimateMode?: (mode: string) => void;
  setClimateTargetTemp?: (value: number) => void;
  setClimateTargetRange?: (low: number, high: number) => void;
  setClimateFanMode?: (mode: string) => void;
  setClimatePresetMode?: (mode: string) => void;
  setClimateSwingMode?: (mode: string) => void;
  setClimateTargetHumidity?: (value: number) => void;
  setClimateSwingHorizontalMode?: (mode: string) => void;
  autoAdjustClimate: () => void;
  toggleSwitch: () => void;
  toggleFan: () => void;
  setFanPercentage: (percentage: number) => void;
  setFanPreset: (mode: string) => void;
  setFanOscillation: (oscillating: boolean) => void;
  setFanDirection: (direction: 'forward' | 'reverse') => void;
  toggleHumidifier: () => void;
  setHumidifierTargetHumidity: (humidity: number) => void;
  setHumidifierMode: (mode: string) => void;
  openCover?: () => void;
  closeCover?: () => void;
  stopCover?: () => void;
  setCoverPosition?: (position: number) => void;
  setCoverTiltPosition?: (position: number) => void;
  lockDoor: (code?: string) => void;
  unlockDoor: (code?: string) => boolean | void;
  openDoor: (code?: string) => void;
  toggleSpeakerPlayback: () => void;
  toggleSpeakerPower: () => void;
  previousSpeakerTrack: () => void;
  nextSpeakerTrack: () => void;
  seekSpeakerPosition: (position: number) => void;
  setSpeakerVolume: (value: number) => void;
  toggleSpeakerMute: () => void;
  toggleSpeakerShuffle: () => void;
  cycleSpeakerRepeatMode: () => void;
  selectSpeakerSoundMode?: (mode: string) => void;
  selectSpeakerOutputDevice: (source: string) => void;
  toggleSpeakerGroupMember: (entityId: string, joined: boolean) => void;
  moveCameraPtz?: (direction: import('../camera/CameraPtzJoystick').CameraPtzDirection) => void;
  stopCameraPtz?: () => void;
  runCameraRelatedEntityAction?: (request: CameraRelatedAction) => boolean | void | Promise<boolean | void>;
};


export type HomePanelProps = {
  activeDevice: ActiveDevice;
  /** The entity of the card that opened the panel. */
  cardEntityId?: string;
  /** What the card holds besides its device: related controls, micro widgets, choices on its controls. */
  related?: import('../devices/panels/related/relatedContext').PanelRelated;
  lamp: HomeLamp;
  climate: HomeClimate;
  cover: HomeCover;
  camera: CameraPanelModel;
  speaker: HomeSpeaker;
  lock: LockPanelData;
  /** The cover opens a way into the house and this person may not command it. */
  coverIsReadOnly: boolean;
  haStates: MockEntityStateMap;
  actions: HomePanelActions;
  alarm: AlarmPanelModel;
  alarmCommands: AlarmPanelCommands;
  onAuthorizeAlarmDeviceAuth?: (label: string) => Promise<boolean>;
  vacuum: VacuumPanelModel;
  vacuumCommands: VacuumPanelCommands;
  vacuumAreas?: VacuumMappedArea[];
  calendarAgenda: CalendarAgendaController;
  weather: WeatherPanelInput['weather'];
  weatherConfig?: Pick<WeatherPanelInput, 'unit' | 'forecastDays' | 'forecastType' | 'conditionOverride' | 'showWind'>;
  calendarWasteTypes?: WasteTypeStyleMap;
  onConfigureWaste?: () => void;
  /** Commands are hidden while the real editor is configuring the card. */
  panelCommandsEnabled: boolean;
  /** The sheet of a phone has its own title and Close. */
  embedded: boolean;
  onClose: () => void;
};

export const homeEntityOf = (haStates: MockEntityStateMap, entityId: string | undefined) => {
  const id = entityId?.trim();
  return id ? haStates[id] ?? haStates[id.toLowerCase()] : undefined;
};

/** The entity of a card that is not a cover, which the Home reads on its own. */
export function homeDeviceEntityId({ activeDevice }: Pick<HomePanelProps, 'activeDevice'>) {
  if (activeDevice.type === 'fan') return activeDevice.fanEntityId;
  if (activeDevice.type === 'humidifier') return activeDevice.humidifierEntityId;
  return activeDevice.switchEntityId;
}

/** Whether a card of the Home opens a shared panel today. */
export function homePanelOf(props: HomePanelProps) {
  const { activeDevice, haStates } = props;
  if (activeDevice.type === 'weather') return 'weather' as const;
  const { panel } = resolvePanel(activeDevice.type as DeviceKind);
  if (panel === 'light' || panel === 'climate' || panel === 'alarm' || panel === 'vacuum' || panel === 'calendar' || panel === 'members') return panel;
  if (panel === 'security') return homeLiveEntityId(props, 'lock') ? panel : null;
  if (panel === 'camera') return props.camera.entityId && homeEntityOf(haStates, props.camera.entityId) ? panel : null;
  if (panel === 'media') return homeLiveEntityId(props, 'media_player') ? panel : null;
  if (panel === 'sensor') return activeDevice.sensorEntityId ? panel : null;
  if (panel !== 'device') return null;
  if (activeDevice.type === 'cover') return panel;
  const entityId = homeDeviceEntityId(props);
  if (!entityId || !homeEntityOf(haStates, entityId)) return null;
  return resolvePanel(resolveDeviceKind(entityId)).panel === 'device' ? panel : null;
}

/** Finds the real HA entity behind cards whose widget id is not the entity id. */
export function homeLiveEntityId(props: HomePanelProps, domain: 'lock' | 'media_player') {
  // The card says which player it shows: the panel opens that one, and guesses only without it.
  const given = domain === 'media_player' ? props.activeDevice.mediaEntityId : undefined;
  if (given && homeEntityOf(props.haStates, given)) return given;
  const direct = props.activeDevice.id.startsWith(`${domain}.`) ? props.activeDevice.id : null;
  if (direct && homeEntityOf(props.haStates, direct)) return direct;
  const attributes = domain === 'lock' ? props.lock.rawAttributes : props.speaker.rawAttributes;
  if (attributes) {
    const bySameAttributes = Object.keys(props.haStates).find(
      (entityId) => entityId.startsWith(`${domain}.`) && props.haStates[entityId]?.rawAttributes === attributes,
    );
    if (bySameAttributes) return bySameAttributes;
  }
  const expectedName = props.activeDevice.name.trim();
  return Object.keys(props.haStates).find(
    (entityId) =>
      entityId.startsWith(`${domain}.`) &&
      `${props.haStates[entityId]?.rawAttributes?.friendly_name ?? ''}`.trim() === expectedName,
  ) ?? null;
}
