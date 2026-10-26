import type { MockEntityStateMap } from '../../types/ha';

/*
 * The demo home of the second Rooms page: every kind of light and device, on
 * and off, some away, some in no room, as on the design board. They live in
 * the page while the demo runs; nothing reaches Home Assistant.
 */

const light = (name: string, state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  rawAttributes: { friendly_name: name, ...attributes },
});
const colour = (extra: Record<string, unknown>) => ({ supported_color_modes: ['color_temp', 'hs'], ...extra });
const white = (extra: Record<string, unknown>) => ({ supported_color_modes: ['color_temp'], ...extra });
const dimmer = (extra: Record<string, unknown>) => ({ supported_color_modes: ['brightness'], ...extra });
const plain = { supported_color_modes: ['onoff'] };

export const DEMO_LIGHT_STATES: MockEntityStateMap = {
  'light.demo_floor_lamp': light('Lampada da terra', 'on', colour({ color_mode: 'color_temp', brightness: 184, color_temp_kelvin: 2700, hs_color: [30, 90] })),
  'light.demo_spots': light('Faretti', 'on', white({ color_mode: 'color_temp', brightness: 128, color_temp_kelvin: 4000 })),
  'light.demo_led_strip': light('Striscia LED', 'on', colour({ color_mode: 'hs', brightness: 102, hs_color: [265, 90] })),
  'light.demo_chandelier': light('Lampadario', 'off', dimmer({ brightness: 200 })),
  'light.demo_wall_lamp': light('Applique', 'off', plain),
  'light.demo_reading_lamp': light('Lampada da lettura', 'off', white({ color_temp_kelvin: 2200 })),
  'light.demo_bedside': light('Comodino', 'on', white({ color_mode: 'color_temp', brightness: 64, color_temp_kelvin: 2200 })),
  'light.demo_ceiling': light('Plafoniera', 'off', dimmer({})),
  'light.demo_cabinets': light('Sottopensili', 'on', white({ color_mode: 'color_temp', brightness: 230, color_temp_kelvin: 4000 })),
  'light.demo_island': light('Isola', 'off', dimmer({})),
  'light.demo_hood': light('Cappa', 'unavailable', plain),
  'light.demo_mirror': light('Specchio', 'off', white({ color_temp_kelvin: 6500 })),
  'light.demo_garden': light('Luce del giardino', 'off', plain),
};

/** Room of each demo light (the demo rooms of the Rooms page); a light with none is in no room. */
export const DEMO_LIGHT_ROOMS: Record<string, string> = {
  'light.demo_floor_lamp': 'demo-living-room',
  'light.demo_spots': 'demo-living-room',
  'light.demo_led_strip': 'demo-living-room',
  'light.demo_chandelier': 'demo-living-room',
  'light.demo_wall_lamp': 'demo-living-room',
  'light.demo_reading_lamp': 'demo-living-room',
  'light.demo_bedside': 'demo-bedroom',
  'light.demo_ceiling': 'demo-bedroom',
  'light.demo_cabinets': 'demo-kitchen',
  'light.demo_island': 'demo-kitchen',
  'light.demo_hood': 'demo-kitchen',
  'light.demo_mirror': 'demo-bathroom',
};

/** Temperature and humidity of the demo rooms, as on the design board. */
export const DEMO_ROOM_READINGS: Record<string, { temperature?: number; humidity?: number }> = {
  'demo-living-room': { temperature: 21.5, humidity: 48 },
  'demo-bedroom': { temperature: 19.5, humidity: 52 },
  'demo-kitchen': { temperature: 22.8, humidity: 55 },
  'demo-bathroom': { temperature: 23.1, humidity: 71 },
};

const device = (name: string, state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  rawAttributes: { friendly_name: name, ...attributes },
});
const outlet = { device_class: 'outlet' };
const power = (watts: number) => device('Potenza', String(watts), { device_class: 'power', unit_of_measurement: 'W' });

export const DEMO_DEVICE_STATES: MockEntityStateMap = {
  'switch.demo_tv_plug': device('Presa TV', 'on', outlet),
  'sensor.demo_tv_plug_power': power(86),
  'switch.demo_console_plug': device('Presa console', 'on', outlet),
  'sensor.demo_console_plug_power': power(4),
  'switch.demo_lamp_plug': device('Presa lampada', 'off', outlet),
  'fan.demo_fan': device('Ventilatore', 'on', {
    percentage: 66,
    percentage_step: 33.33,
    oscillating: true,
    preset_modes: ['Auto', 'Notte', 'Naturale'],
    preset_mode: null,
    supported_features: 11,
  }),
  'cover.demo_living_blind': device('Tapparella', 'open', { current_position: 60, current_tilt_position: 40, supported_features: 15 + 128 }),
  'humidifier.demo_dehumidifier': device('Deumidificatore', 'off', {
    device_class: 'dehumidifier',
    current_humidity: 48,
    humidity: 50,
    min_humidity: 30,
    max_humidity: 70,
    available_modes: ['Normale', 'Auto', 'Notte', 'Biancheria'],
    mode: 'Auto',
  }),
  'switch.demo_fridge': device('Frigorifero', 'on', outlet),
  'sensor.demo_fridge_power': power(96),
  'switch.demo_coffee': device('Macchina caffè', 'off', outlet),
  'sensor.demo_coffee_power': power(0),
  'fan.demo_hood_fan': device('Cappa', 'off', { percentage: 25, percentage_step: 25, supported_features: 1 }),
  'cover.demo_bedroom_blind': device('Tapparella', 'closed', { current_position: 0, supported_features: 15 }),
  'fan.demo_ceiling_fan': device('Ventilatore a soffitto', 'off', {
    percentage: 40,
    direction: 'forward',
    preset_modes: ['Notte'],
    preset_mode: null,
    supported_features: 13,
  }),
  'input_boolean.demo_do_not_disturb': device('Non disturbare', 'off'),
  'switch.demo_towel_rail': device('Scaldasalviette', 'on', outlet),
  'sensor.demo_towel_rail_power': power(420),
  'switch.demo_garden_plug': device('Presa giardino', 'off', outlet),
};

export const DEMO_DEVICE_ROOMS: Record<string, string> = {
  'switch.demo_tv_plug': 'demo-living-room',
  'switch.demo_console_plug': 'demo-living-room',
  'switch.demo_lamp_plug': 'demo-living-room',
  'fan.demo_fan': 'demo-living-room',
  'cover.demo_living_blind': 'demo-living-room',
  'humidifier.demo_dehumidifier': 'demo-living-room',
  'switch.demo_fridge': 'demo-kitchen',
  'switch.demo_coffee': 'demo-kitchen',
  'fan.demo_hood_fan': 'demo-kitchen',
  'cover.demo_bedroom_blind': 'demo-bedroom',
  'fan.demo_ceiling_fan': 'demo-bedroom',
  'input_boolean.demo_do_not_disturb': 'demo-bedroom',
  'switch.demo_towel_rail': 'demo-bathroom',
};

/** Plugs that ask before turning off in the demo, until the demo is changed. */
export const DEMO_PROTECTED_ENTITIES = ['switch.demo_fridge'];

const AC_MODES = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'];

export const DEMO_CLIMATE_STATES: MockEntityStateMap = {
  'climate.demo_living_ac': device('Climatizzatore', 'heat', {
    hvac_modes: AC_MODES,
    hvac_action: 'heating',
    temperature: 23,
    current_temperature: 21.5,
    target_temp_low: 20,
    target_temp_high: 24,
    min_temp: 16,
    max_temp: 30,
    target_temp_step: 0.5,
    fan_modes: ['auto', 'low', 'medium', 'high'],
    fan_mode: 'auto',
    swing_modes: ['off', 'vertical'],
    swing_mode: 'off',
    preset_modes: ['none', 'comfort', 'eco', 'boost', 'sleep'],
    preset_mode: 'comfort',
  }),
  'climate.demo_living_radiator': device('Termosifone', 'heat', {
    hvac_modes: ['off', 'heat'],
    temperature: 21,
    current_temperature: 20.5,
    min_temp: 5,
    max_temp: 28,
    target_temp_step: 0.5,
  }),
  'climate.demo_bedroom_ac': device('Climatizzatore', 'cool', {
    hvac_modes: AC_MODES,
    hvac_action: 'idle',
    temperature: 23,
    current_temperature: 19.5,
    target_temp_low: 21,
    target_temp_high: 25,
    min_temp: 16,
    max_temp: 30,
    target_temp_step: 0.5,
    fan_modes: ['auto', 'low', 'medium', 'high'],
    fan_mode: 'low',
    swing_modes: ['off', 'vertical'],
    swing_mode: 'vertical',
    preset_modes: ['none', 'comfort', 'eco', 'sleep'],
    preset_mode: 'sleep',
  }),
  'climate.demo_bathroom_floor': device('Pavimento radiante', 'heat', {
    hvac_modes: ['off', 'heat'],
    hvac_action: 'idle',
    temperature: 24,
    current_temperature: 23.1,
    min_temp: 18,
    max_temp: 28,
    target_temp_step: 0.5,
  }),
};

export const DEMO_CLIMATE_ROOMS: Record<string, string> = {
  'climate.demo_living_ac': 'demo-living-room',
  'climate.demo_living_radiator': 'demo-living-room',
  'climate.demo_bedroom_ac': 'demo-bedroom',
  'climate.demo_bathroom_floor': 'demo-bathroom',
};

export const DEMO_STATES: MockEntityStateMap = { ...DEMO_LIGHT_STATES, ...DEMO_DEVICE_STATES, ...DEMO_CLIMATE_STATES };
export const DEMO_ROOMS: Record<string, string> = { ...DEMO_LIGHT_ROOMS, ...DEMO_DEVICE_ROOMS, ...DEMO_CLIMATE_ROOMS };
