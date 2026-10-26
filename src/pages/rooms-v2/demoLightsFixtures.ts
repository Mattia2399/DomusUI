import type { MockEntityStateMap } from '../../types/ha';

/*
 * The lights of the demo home for the second Rooms page: every kind of light,
 * on and off, one away, and one in no room. They live in the page while the
 * demo runs; nothing reaches Home Assistant.
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
