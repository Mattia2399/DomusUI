import React from 'react';
import type { MockEntityState } from '../types/ha';
import { SensorFamilyCard, toFamilySensorModel } from '../components/devices/cards/SensorFamilyCard';
import { HouseStatesProvider } from '../components/devices/cards/houseStatesContext';
import { PanelServicesProvider, type PanelServices } from '../components/devices/panels/panelServicesContext';
import { Panel } from '../components/devices/panels/Panel';
import { deviceCardHeightPx, type DeviceCardFormat } from '../components/devices/cards/DeviceCardShell';
import type { SeriesPoint } from '../components/devices/model/sensor';
import type { StateChange } from '../components/devices/model/security';

/*
 * Development only, inside /devices-lab: every sensor family of the board
 * (docs/design-reference/sensori) in its three sizes, in its normal state and
 * in its alert, with the sample figures of the board.
 */

const SIZES: DeviceCardFormat[] = ['U×2', 'U×4', 'W×4'];
const COLUMN_PX = 200;
const MIN = 60_000;
const HOUR = 60 * MIN;

type Sample = {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  changedAgo?: number;
  history?: (now: number) => SeriesPoint[];
  changes?: (now: number) => StateChange[];
  battery?: number;
  /** Other sensors of the house beside it. */
  house?: Array<{ entityId: string; state: string; attributes: Record<string, unknown>; changedAgo?: number }>;
};

/** A day of points every quarter hour, from a curve over 0..1 of the day. */
const day = (curve: (x: number) => number) => (now: number) =>
  Array.from({ length: 97 }, (_, index) => ({ t: now - (96 - index) * 15 * MIN, v: curve(index / 96) }));

const rising = (from: number, to: number) => day((x) => from + (to - from) * x ** 2);
const flat = (value: number, wobble = 0) => day((x) => value + Math.sin(x * 18) * wobble);
const spans = (list: Array<[number, number]>) => (now: number) =>
  list.flatMap(([ago, length]) => [{ t: now - ago, state: 'on' }, { t: now - ago + length, state: 'off' }]).sort((a, b) => a.t - b.t);

const s = (name: string, extra: Record<string, unknown> = {}) => ({ friendly_name: name, ...extra });
const PRICES = [69, 66, 62, 59, 59, 66, 78, 88, 84, 75, 66, 56, 47, 41, 38, 41, 53, 75, 94, 100, 91, 81, 75, 72].map((v) => Math.round(v * 0.34) / 100);

const FAMILIES: Array<{ title: string; normal: Sample; alert: Sample }> = [
  {
    title: 'Temperatura',
    normal: { entityId: 'sensor.lab_temp', state: '21.4', attributes: s('Temperatura sala', { device_class: 'temperature', unit_of_measurement: '°C' }), history: rising(19.5, 21.4) },
    alert: { entityId: 'sensor.lab_temp', state: '27.8', attributes: s('Temperatura sala', { device_class: 'temperature', unit_of_measurement: '°C' }), history: rising(23, 27.8) },
  },
  {
    title: 'Umidità',
    normal: { entityId: 'sensor.lab_hum', state: '48', attributes: s('Umidità bagno', { device_class: 'humidity', unit_of_measurement: '%' }), history: flat(48, 6) },
    alert: { entityId: 'sensor.lab_hum', state: '78', attributes: s('Umidità bagno', { device_class: 'humidity', unit_of_measurement: '%' }), history: rising(50, 78) },
  },
  {
    title: 'Qualità dell’aria',
    normal: {
      entityId: 'sensor.lab_air_co2', state: '620', attributes: s('Aria soggiorno', { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }), changedAgo: MIN,
      house: [
        { entityId: 'sensor.lab_air_pm25', state: '8', attributes: s('PM2.5', { device_class: 'pm25', unit_of_measurement: 'µg/m³' }) },
        { entityId: 'sensor.lab_air_voc', state: '180', attributes: s('VOC', { device_class: 'volatile_organic_compounds_parts', unit_of_measurement: 'ppb' }) },
      ],
    },
    alert: {
      entityId: 'sensor.lab_air_co2', state: '1480', attributes: s('Aria soggiorno', { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
      house: [
        { entityId: 'sensor.lab_air_pm25', state: '22', attributes: s('PM2.5', { device_class: 'pm25', unit_of_measurement: 'µg/m³' }) },
        { entityId: 'sensor.lab_air_voc', state: '640', attributes: s('VOC', { device_class: 'volatile_organic_compounds_parts', unit_of_measurement: 'ppb' }) },
      ],
    },
  },
  {
    title: 'Energia e potenza',
    normal: { entityId: 'sensor.lab_power', state: '1200', attributes: s('Consumo casa', { device_class: 'power', unit_of_measurement: 'W' }), history: day((x) => 150 + 900 * Math.max(0, Math.sin(x * Math.PI * 3)) + 1200 * Math.max(0, Math.sin((x - 0.6) * Math.PI * 2.4))) },
    alert: {
      entityId: 'sensor.lab_power', state: '3100', attributes: s('Consumo casa', { device_class: 'power', unit_of_measurement: 'W' }), history: rising(400, 3100),
      house: [
        { entityId: 'sensor.lab_oven_power', state: '1900', attributes: s('Forno', { device_class: 'power', unit_of_measurement: 'W' }) },
        { entityId: 'sensor.lab_washer_power', state: '800', attributes: s('Lavatrice', { device_class: 'power', unit_of_measurement: 'W' }) },
      ],
    },
  },
  {
    title: 'Acqua e gas',
    normal: { entityId: 'sensor.lab_water', state: '418.002', attributes: s('Acqua', { device_class: 'water', unit_of_measurement: 'm³' }), history: day((x) => 417.86 + 0.142 * Math.min(1, x * 1.08)) },
    alert: { entityId: 'sensor.lab_water', state: '418.27', attributes: s('Acqua', { device_class: 'water', unit_of_measurement: 'm³' }), history: day((x) => 417.86 + (x < 0.9 ? 0 : (x - 0.9) * 4.1)) },
  },
  {
    title: 'Batteria',
    normal: {
      entityId: 'sensor.lab_door_battery', state: '82', attributes: s('Sensore porta', { device_class: 'battery', unit_of_measurement: '%' }),
      house: [
        { entityId: 'sensor.lab_thermo_battery', state: '64', attributes: s('Termostato camera', { device_class: 'battery', unit_of_measurement: '%' }) },
        { entityId: 'sensor.lab_bell_battery', state: '41', attributes: s('Campanello', { device_class: 'battery', unit_of_measurement: '%' }) },
        { entityId: 'sensor.lab_remote_battery', state: '23', attributes: s('Telecomando', { device_class: 'battery', unit_of_measurement: '%' }) },
      ],
    },
    alert: {
      entityId: 'sensor.lab_door_battery', state: '9', attributes: s('Sensore porta', { device_class: 'battery', unit_of_measurement: '%', battery_type: 'CR2032' }),
      house: [
        { entityId: 'sensor.lab_thermo_battery', state: '64', attributes: s('Termostato camera', { device_class: 'battery', unit_of_measurement: '%' }) },
        { entityId: 'sensor.lab_bell_battery', state: '41', attributes: s('Campanello', { device_class: 'battery', unit_of_measurement: '%' }) },
        { entityId: 'sensor.lab_remote_battery', state: '23', attributes: s('Telecomando', { device_class: 'battery', unit_of_measurement: '%' }) },
      ],
    },
  },
  {
    title: 'Luce e sole',
    normal: { entityId: 'sensor.lab_lux', state: '12400', attributes: s('Luce giardino', { device_class: 'illuminance', unit_of_measurement: 'lx' }), history: day((x) => Math.max(0, Math.sin((x - 0.28) * Math.PI * 1.8)) * 14000) },
    alert: { entityId: 'sensor.lab_lux', state: '4', attributes: s('Luce giardino', { device_class: 'illuminance', unit_of_measurement: 'lx' }), history: day((x) => (x < 0.95 ? Math.max(4, 3000 * (1 - x)) : 4)) },
  },
  {
    title: 'Vento, pioggia, pressione',
    normal: {
      entityId: 'sensor.lab_garden_wind_speed', state: '14', attributes: s('Vento', { device_class: 'wind_speed', unit_of_measurement: 'km/h' }),
      house: [
        { entityId: 'sensor.lab_garden_wind_direction', state: '315', attributes: s('Direzione', { device_class: 'wind_direction', unit_of_measurement: '°' }) },
        { entityId: 'sensor.lab_garden_wind_gust', state: '22', attributes: s('Raffiche', { device_class: 'wind_speed', unit_of_measurement: 'km/h' }) },
        { entityId: 'sensor.lab_garden_rain', state: '0', attributes: s('Pioggia', { device_class: 'precipitation', unit_of_measurement: 'mm' }) },
        { entityId: 'sensor.lab_garden_pressure', state: '1016', attributes: s('Pressione', { device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa' }) },
      ],
    },
    alert: {
      entityId: 'sensor.lab_garden_wind_speed', state: '62', attributes: s('Vento', { device_class: 'wind_speed', unit_of_measurement: 'km/h' }),
      house: [
        { entityId: 'sensor.lab_garden_wind_direction', state: '30', attributes: s('Direzione', { device_class: 'wind_direction', unit_of_measurement: '°' }) },
        { entityId: 'sensor.lab_garden_wind_gust', state: '88', attributes: s('Raffiche', { device_class: 'wind_speed', unit_of_measurement: 'km/h' }) },
        { entityId: 'sensor.lab_garden_rain', state: '12', attributes: s('Pioggia', { device_class: 'precipitation_intensity', unit_of_measurement: 'mm/h' }) },
        { entityId: 'sensor.lab_garden_pressure', state: '998', attributes: s('Pressione', { device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa' }) },
      ],
    },
  },
  {
    title: 'Rete e segnale',
    normal: { entityId: 'sensor.lab_wifi', state: '-58', attributes: s('Wi-Fi cucina', { device_class: 'signal_strength', unit_of_measurement: 'dBm' }), history: flat(-58, 4) },
    alert: { entityId: 'sensor.lab_wifi', state: '-88', attributes: s('Wi-Fi cucina', { device_class: 'signal_strength', unit_of_measurement: 'dBm' }), history: rising(-60, -88) },
  },
  {
    title: 'Orari e durate',
    normal: { entityId: 'sensor.lab_dishwasher_end', state: '', attributes: s('Lavastoviglie', { device_class: 'timestamp' }), changedAgo: 65 * MIN },
    alert: { entityId: 'sensor.lab_dishwasher_end', state: '', attributes: s('Lavastoviglie', { device_class: 'timestamp' }), changedAgo: 102 * MIN },
  },
  {
    title: 'Stato a scelta',
    normal: { entityId: 'sensor.lab_washer', state: 'Centrifuga', attributes: s('Lavatrice', { device_class: 'enum', options: ['Prelavaggio', 'Lavaggio', 'Risciacquo', 'Centrifuga'] }), changedAgo: 18 * MIN },
    alert: { entityId: 'sensor.lab_washer', state: 'finished', attributes: s('Lavatrice', { device_class: 'enum', options: ['Prelavaggio', 'Lavaggio', 'Risciacquo', 'Centrifuga'] }), changedAgo: 40 * MIN },
  },
  {
    title: 'Prezzi e costi',
    normal: { entityId: 'sensor.lab_price', state: '0.21', attributes: s('Prezzo energia', { device_class: 'monetary', unit_of_measurement: '€/kWh', today: PRICES }) },
    alert: { entityId: 'sensor.lab_price', state: '0.34', attributes: s('Prezzo energia', { device_class: 'monetary', unit_of_measurement: '€/kWh', today: PRICES }) },
  },
  {
    title: 'Altre misure',
    normal: { entityId: 'sensor.lab_noise', state: '32', attributes: s('Rumore camera', { device_class: 'sound_pressure', unit_of_measurement: 'dB' }), history: flat(33, 5) },
    alert: { entityId: 'sensor.lab_noise', state: '68', attributes: s('Rumore camera', { device_class: 'sound_pressure', unit_of_measurement: 'dB' }), history: rising(35, 68) },
  },
  {
    title: 'Porte e finestre',
    normal: { entityId: 'binary_sensor.lab_window', state: 'off', attributes: s('Finestra cucina', { device_class: 'window' }), changedAgo: 2 * HOUR, changes: spans([[14 * HOUR, 15 * MIN], [9 * HOUR, 25 * MIN]]) },
    alert: { entityId: 'binary_sensor.lab_window', state: 'on', attributes: s('Finestra cucina', { device_class: 'window' }), changedAgo: 5 * MIN, changes: (now) => [...spans([[14 * HOUR, 15 * MIN], [9 * HOUR, 25 * MIN]])(now), { t: now - 5 * MIN, state: 'on' }] },
  },
  {
    title: 'Movimento e presenza',
    normal: { entityId: 'binary_sensor.lab_hall', state: 'off', attributes: s('Corridoio', { device_class: 'motion' }), changedAgo: 14 * MIN, changes: spans([20, 19, 15, 14, 12, 9, 8, 6, 5, 4, 3.5, 3, 2, 1].map((h) => [h * HOUR, 2 * MIN])) },
    alert: { entityId: 'binary_sensor.lab_hall', state: 'on', attributes: s('Corridoio', { device_class: 'motion' }), changedAgo: 0, changes: (now) => [...spans([20, 15, 9, 5, 3, 1].map((h) => [h * HOUR, 2 * MIN]))(now), { t: now - 10_000, state: 'on' }] },
  },
  {
    title: 'Sicurezza: fumo, gas, acqua',
    normal: {
      entityId: 'binary_sensor.lab_smoke', state: 'off', attributes: s('Fumo cucina', { device_class: 'smoke' }), battery: 76,
      house: [
        { entityId: 'binary_sensor.lab_gas', state: 'off', attributes: s('Gas caldaia', { device_class: 'gas' }) },
        { entityId: 'binary_sensor.lab_leak', state: 'off', attributes: s('Perdita lavatrice', { device_class: 'moisture' }) },
        { entityId: 'binary_sensor.lab_co', state: 'off', attributes: s('CO camera', { device_class: 'carbon_monoxide' }) },
      ],
    },
    alert: { entityId: 'binary_sensor.lab_smoke', state: 'on', attributes: s('Fumo cucina', { device_class: 'smoke' }), changedAgo: 30_000 },
  },
  {
    title: 'Stato dei dispositivi',
    normal: {
      entityId: 'binary_sensor.lab_printer', state: 'on', attributes: s('Stampante', { device_class: 'connectivity' }), changedAgo: 3 * 24 * HOUR,
      house: [
        { entityId: 'binary_sensor.lab_camera_link', state: 'on', attributes: s('Telecamera giardino', { device_class: 'connectivity' }) },
        { entityId: 'binary_sensor.lab_zigbee', state: 'on', attributes: s('Bridge Zigbee', { device_class: 'connectivity' }) },
        { entityId: 'binary_sensor.lab_robot', state: 'on', attributes: s('Robot', { device_class: 'connectivity' }) },
      ],
    },
    alert: {
      entityId: 'binary_sensor.lab_printer', state: 'off', attributes: s('Stampante', { device_class: 'connectivity' }), changedAgo: 2 * HOUR,
      house: [
        { entityId: 'binary_sensor.lab_camera_link', state: 'on', attributes: s('Telecamera giardino', { device_class: 'connectivity' }) },
        { entityId: 'binary_sensor.lab_zigbee', state: 'on', attributes: s('Bridge Zigbee', { device_class: 'connectivity' }) },
        { entityId: 'binary_sensor.lab_robot', state: 'on', attributes: s('Robot', { device_class: 'connectivity' }) },
      ],
    },
  },
];

function entityOf(sample: { state: string; attributes: Record<string, unknown>; changedAgo?: number }, now: number): MockEntityState {
  const changed = sample.changedAgo !== undefined ? new Date(now - sample.changedAgo).toISOString() : undefined;
  return { state: sample.state, rawAttributes: { ...sample.attributes, ...(changed ? { __last_changed: changed } : null) } } as MockEntityState;
}

function SampleRow({ sample, now }: { sample: Sample; now: number }) {
  // The end time of the dishwasher sits 25 minutes ahead, or 12 minutes behind once it is over.
  const timed = sample.entityId === 'sensor.lab_dishwasher_end'
    ? { ...sample, state: new Date(now + ((sample.changedAgo ?? 0) > 90 * MIN ? -12 : 25) * MIN).toISOString() }
    : sample;
  const entity = entityOf(timed, now);
  const states = React.useMemo(() => {
    const map: Record<string, MockEntityState> = { [sample.entityId]: entity };
    for (const other of sample.house ?? []) map[other.entityId] = entityOf(other, now);
    return map;
  }, [entity, now, sample]);
  const model = toFamilySensorModel(sample.entityId, entity, { battery: sample.battery ?? null });
  const [panelOpen, setPanelOpen] = React.useState(false);
  // The history of the sample, as Home Assistant would answer it to the panel.
  const services = React.useMemo<PanelServices>(() => ({
    callApi: (async (message: Record<string, unknown>) => {
      if (message.type !== 'history/history_during_period') return null;
      const points = sample.history?.(now) ?? [];
      const changes = sample.changes?.(now) ?? [];
      return { [sample.entityId]: [...points.map((point) => ({ s: String(point.v), lu: point.t / 1000 })), ...changes.map((change) => ({ s: change.state, lu: change.t / 1000 }))] };
    }) as PanelServices['callApi'],
    callService: async () => true,
  }), [now, sample]);
  if (!model) return null;
  return (
    <HouseStatesProvider value={states}>
      <div className="flex flex-wrap items-start gap-[10px]" data-sample={sample.entityId}>
        {SIZES.map((format) => (
          <div key={format} style={{ width: format.startsWith('W') ? COLUMN_PX * 2 + 10 : COLUMN_PX, height: deviceCardHeightPx(format) }}>
            <SensorFamilyCard model={model} history={sample.history?.(now)} changes={sample.changes?.(now)} format={format} now={now} onOpen={() => setPanelOpen((open) => !open)} />
          </div>
        ))}
      </div>
      {panelOpen ? (
        <div className="dv-panel-frame w-full max-w-[384px]" data-testid="lab-sensor-panel">
          <PanelServicesProvider value={services}>
            <Panel kind="sensor" input={{ entityId: sample.entityId, name: model.name, haStates: states }} onClose={() => setPanelOpen(false)} />
          </PanelServicesProvider>
        </div>
      ) : null}
    </HouseStatesProvider>
  );
}

export function SensorFamilyLab() {
  const now = React.useMemo(() => Date.now(), []);
  return (
    <div className="flex flex-col gap-6" data-testid="sensor-family-lab">
      {FAMILIES.map((family) => (
        <div key={family.title} className="flex flex-col gap-3">
          <h2 className="dv-t2 m-0 text-[13px] font-bold uppercase tracking-[0.06em]">{family.title}</h2>
          <SampleRow sample={family.normal} now={now} />
          <SampleRow sample={family.alert} now={now} />
        </div>
      ))}
    </div>
  );
}

export default SensorFamilyLab;
