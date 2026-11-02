import { describe, expect, it } from 'vitest';
import { airBand, batteryBand, lightSteps, resolveSensorAlert, resolveSensorFamily, signalBars, SENSOR_FAMILY_CLASSES } from './sensorFamily';

const NOW = new Date(2026, 9, 29, 21, 0).getTime();
const hours = (count: number, value: (index: number) => number, step = 15) =>
  Array.from({ length: count * (60 / step) + 1 }, (_, index) => ({ t: NOW - (count * 60 - index * step) * 60_000, v: value(index) }));

describe('resolveSensorFamily', () => {
  it('puts every device class of the board in its family', () => {
    for (const [family, classes] of Object.entries(SENSOR_FAMILY_CLASSES)) {
      const domain = ['opening', 'motion', 'safety', 'device'].includes(family) ? 'binary_sensor' : 'sensor';
      for (const deviceClass of classes) {
        expect(resolveSensorFamily({ entityId: `${domain}.x`, deviceClass }), `${domain} ${deviceClass}`).toBe(family);
      }
    }
  });

  it('tells the sensor of a class from the yes/no of the same name', () => {
    expect(resolveSensorFamily({ entityId: 'sensor.boiler', deviceClass: 'gas' })).toBe('water');
    expect(resolveSensorFamily({ entityId: 'binary_sensor.boiler', deviceClass: 'gas' })).toBe('safety');
    expect(resolveSensorFamily({ entityId: 'sensor.door', deviceClass: 'battery' })).toBe('battery');
    expect(resolveSensorFamily({ entityId: 'binary_sensor.door', deviceClass: 'battery' })).toBe('device');
    expect(resolveSensorFamily({ entityId: 'sensor.soil', deviceClass: 'moisture' })).toBe('humidity');
    expect(resolveSensorFamily({ entityId: 'binary_sensor.washer', deviceClass: 'moisture' })).toBe('safety');
  });

  it('reads the unit when there is no class, and keeps the rest as a measure or a word', () => {
    expect(resolveSensorFamily({ entityId: 'sensor.a', unit: '°C' })).toBe('temperature');
    expect(resolveSensorFamily({ entityId: 'sensor.a', unit: 'W' })).toBe('energy');
    expect(resolveSensorFamily({ entityId: 'sensor.a', unit: '€/kWh' })).toBe('price');
    expect(resolveSensorFamily({ entityId: 'sensor.a', unit: 'dB' })).toBe('measure');
    expect(resolveSensorFamily({ entityId: 'sensor.a', unit: 'pz' })).toBe('measure');
    expect(resolveSensorFamily({ entityId: 'sensor.a', state: '12' })).toBe('measure');
    expect(resolveSensorFamily({ entityId: 'sensor.a', state: 'Centrifuga' })).toBe('state');
    expect(resolveSensorFamily({ entityId: 'binary_sensor.a' })).toBe('device');
    expect(resolveSensorFamily({ entityId: 'light.a' })).toBeNull();
  });
});

describe('resolveSensorAlert', () => {
  const alert = (input: Partial<Parameters<typeof resolveSensorAlert>[0]> & Pick<Parameters<typeof resolveSensorAlert>[0], 'family'>) =>
    resolveSensorAlert({ value: null, state: '', now: NOW, ...input });

  it('says when a room is too hot or too cold, and since when', () => {
    expect(alert({ family: 'temperature', deviceClass: 'temperature', value: 21.4 })).toBeNull();
    const hot = alert({ family: 'temperature', deviceClass: 'temperature', value: 27.8, history: hours(3, (i) => (i < 4 ? 24 : 27)) });
    expect(hot).toMatchObject({ level: 'warning', reason: 'hot' });
    expect(hot?.since).toBe(NOW - 120 * 60_000);
    expect(alert({ family: 'temperature', deviceClass: 'temperature', value: 59, unit: '°F' })?.reason).toBe('cold');
    expect(alert({ family: 'temperature', deviceClass: 'temperature_delta', value: 30 })).toBeNull();
  });

  it('warns of humidity outside the band, air in the orange and red bands', () => {
    expect(alert({ family: 'humidity', deviceClass: 'humidity', value: 78 })?.reason).toBe('humid');
    expect(alert({ family: 'humidity', deviceClass: 'humidity', value: 48 })).toBeNull();
    expect(alert({ family: 'humidity', deviceClass: 'moisture', value: 90 })).toBeNull();
    expect(alert({ family: 'air', deviceClass: 'carbon_dioxide', value: 620 })).toBeNull();
    expect(alert({ family: 'air', deviceClass: 'carbon_dioxide', value: 1480 })).toEqual({ level: 'warning', reason: 'airPoor' });
    expect(alert({ family: 'air', deviceClass: 'carbon_dioxide', value: 2100 })).toEqual({ level: 'critical', reason: 'airBad' });
    expect(airBand('pm25', 22)).toBe(1);
    expect(airBand('nitrous_oxide', 22)).toBeNull();
  });

  it('calls the power near the meter critical, in W or kW', () => {
    expect(alert({ family: 'energy', deviceClass: 'power', value: 3100, unit: 'W' })?.reason).toBe('nearLimit');
    expect(alert({ family: 'energy', deviceClass: 'power', value: 1.2, unit: 'kW' })).toBeNull();
    expect(alert({ family: 'energy', deviceClass: 'power', value: 5, unit: 'kW', meterKw: 6 })).toBeNull();
    expect(alert({ family: 'energy', deviceClass: 'energy', value: 9000, unit: 'kWh' })).toBeNull();
    expect(alert({ family: 'energy', value: 3100, unit: 'W' })?.reason).toBe('nearLimit');
  });

  it('sees a leak in a meter that never stops for two hours', () => {
    const running = hours(3, (i) => 1000 + i * 8);
    expect(alert({ family: 'water', deviceClass: 'water', value: 1096, history: running })?.reason).toBe('leak');
    const pause = hours(3, (i) => 1000 + (i > 6 && i < 9 ? 56 : i * 8));
    expect(alert({ family: 'water', deviceClass: 'water', value: 1096, history: pause.map((p, i) => ({ ...p, v: i >= 7 && i <= 8 ? pause[6].v : p.v })) })).toBeNull();
    expect(alert({ family: 'water', deviceClass: 'volume_flow_rate', value: 3.2, history: hours(3, () => 3.2) })?.reason).toBe('leak');
    expect(alert({ family: 'water', deviceClass: 'volume_flow_rate', value: 3.2, history: hours(3, (i) => (i === 10 ? 0 : 3.2)) })).toBeNull();
    expect(alert({ family: 'water', deviceClass: 'water', value: 1096 })).toBeNull();
  });

  it('knows batteries, darkness, wind, signal and noise', () => {
    expect(alert({ family: 'battery', value: 9 })).toEqual({ level: 'warning', reason: 'batteryLow' });
    expect(alert({ family: 'battery', value: 3 })?.level).toBe('critical');
    expect(alert({ family: 'battery', value: 82 })).toBeNull();
    expect(batteryBand(23)).toBe(1);
    expect(alert({ family: 'light', deviceClass: 'illuminance', value: 4 })?.reason).toBe('dark');
    expect(lightSteps('illuminance', 12_400)).toBe(4);
    expect(alert({ family: 'weather', deviceClass: 'wind_speed', value: 62, unit: 'km/h' })?.reason).toBe('windStrong');
    expect(alert({ family: 'weather', deviceClass: 'wind_speed', value: 14, unit: 'm/s' })?.reason).toBe('windStrong');
    expect(alert({ family: 'signal', deviceClass: 'signal_strength', value: -88, unit: 'dBm' })?.reason).toBe('signalWeak');
    expect(signalBars(-58, 'dBm')).toBe(3);
    expect(signalBars(-88, 'dBm')).toBe(1);
    expect(alert({ family: 'measure', deviceClass: 'sound_pressure', value: 68 })?.reason).toBe('loud');
    expect(alert({ family: 'measure', deviceClass: 'distance', value: 68 })).toBeNull();
  });

  it('marks a cycle that just ended, and a dear price', () => {
    const ended = new Date(NOW - 12 * 60_000).toISOString();
    expect(alert({ family: 'time', deviceClass: 'timestamp', state: ended })).toMatchObject({ level: 'notice', reason: 'finished' });
    expect(alert({ family: 'time', deviceClass: 'timestamp', state: new Date(NOW + 25 * 60_000).toISOString() })).toBeNull();
    expect(alert({ family: 'time', deviceClass: 'timestamp', state: new Date(NOW - 3 * 86_400_000).toISOString() })).toBeNull();
    expect(alert({ family: 'state', state: 'Finished' })?.reason).toBe('done');
    expect(alert({ family: 'state', state: 'spin' })).toBeNull();
    expect(alert({ family: 'price', value: 0.34, dayMean: 0.24 })?.reason).toBe('priceHigh');
    expect(alert({ family: 'price', value: 0.21, dayMean: 0.24 })).toBeNull();
  });

  it('reads the yes/no families', () => {
    expect(alert({ family: 'opening', state: 'on' })?.reason).toBe('open');
    expect(alert({ family: 'opening', state: 'off' })).toBeNull();
    expect(alert({ family: 'motion', state: 'on' })?.reason).toBe('motion');
    expect(alert({ family: 'safety', deviceClass: 'smoke', state: 'on' })).toEqual({ level: 'critical', reason: 'detected' });
    expect(alert({ family: 'safety', deviceClass: 'tamper', state: 'on' })?.level).toBe('warning');
    expect(alert({ family: 'device', deviceClass: 'connectivity', state: 'off' })?.reason).toBe('offline');
    expect(alert({ family: 'device', deviceClass: 'connectivity', state: 'on' })).toBeNull();
    expect(alert({ family: 'device', deviceClass: 'plug', state: 'off' })).toBeNull();
  });
});
