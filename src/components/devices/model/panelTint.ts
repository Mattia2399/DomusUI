import type { ClimateModel } from './climate';
import type { DeviceModel } from './device';

/* The colour a panel gives its sheet while the device is on, the same wherever it opens. */

export const DEVICE_TINT: Record<DeviceModel['kind'], string> = {
  outlet: '48 209 88',
  switch: '48 209 88',
  virtual: '48 209 88',
  fan: '100 210 255',
  cover: '255 159 10',
  humidifier: '90 200 250',
};

export const CLIMATE_TINT: Record<ClimateModel['mode'], string> = {
  off: '142 142 147',
  heat: '255 122 26',
  cool: '10 132 255',
  heat_cool: '48 209 88',
  auto: '48 209 88',
  dry: '50 173 230',
  fan_only: '148 163 184',
};
