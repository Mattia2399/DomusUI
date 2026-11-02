import type { MockEntityStateMap } from '../../types/ha';
import { resolveDeviceKind, type DeviceKind } from '../devices/model/entityKind';
import { resolvePanel } from '../devices/panels/resolvePanel';
import type { AlarmPanelCommands, AlarmPanelModel } from '../devices/panels/AlarmPanel';
import type { VacuumPanelCommands, VacuumPanelModel } from '../devices/panels/VacuumPanel';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import type { WasteTypeStyleMap } from '../../services/calendarClient';
import type { VacuumMappedArea } from '../widgets/vacuumDeviceModel';
import type { ActiveDevice } from './types';

/*
 * Which cards of the Home open a shared panel. The column asks this at once,
 * while the panels and their models load only when one opens (HomePanel.tsx).
 * A card whose entity cannot be read here keeps its old content.
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
  minColorTempKelvin?: number;
  maxColorTempKelvin?: number;
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
  presetMode?: string;
  presetModes?: string[];
  swingMode?: string;
  swingModes?: string[];
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
  toggleClimatePower: () => void;
  setClimateMode?: (mode: string) => void;
  setClimateTargetTemp?: (value: number) => void;
  setClimateTargetRange?: (low: number, high: number) => void;
  setClimateFanMode?: (mode: string) => void;
  setClimatePresetMode?: (mode: string) => void;
  setClimateSwingMode?: (mode: string) => void;
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
};

export type HomePanelProps = {
  activeDevice: ActiveDevice;
  lamp: HomeLamp;
  climate: HomeClimate;
  cover: HomeCover;
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
  calendarWasteTypes?: WasteTypeStyleMap;
  onConfigureWaste?: () => void;
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
  const { activeDevice, coverIsReadOnly, haStates } = props;
  const { panel } = resolvePanel(activeDevice.type as DeviceKind);
  if (panel === 'light' || panel === 'climate' || panel === 'alarm' || panel === 'vacuum' || panel === 'calendar' || panel === 'members') return panel;
  if (panel !== 'device') return null;
  if (activeDevice.type === 'cover') return coverIsReadOnly ? null : panel;
  const entityId = homeDeviceEntityId(props);
  if (!entityId || !homeEntityOf(haStates, entityId)) return null;
  return resolvePanel(resolveDeviceKind(entityId)).panel === 'device' ? panel : null;
}
