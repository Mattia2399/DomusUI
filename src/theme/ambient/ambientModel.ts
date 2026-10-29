/**
 * The colours of the Dynamic background: two soft glows that follow the room
 * or the alarm. Pure functions only, so the pages and the tests share them.
 */

export type AmbientIntensity = 'base' | 'subtle';

export type AmbientRequest = {
  a: string;
  b: string;
  intensity?: AmbientIntensity;
  pulse?: boolean;
};

export type ResolvedAmbient = Required<AmbientRequest>;

/** Every page that asks for nothing: blue and violet, at the base intensity. */
export const BASE_AMBIENT: ResolvedAmbient = { a: '#0A84FF', b: '#BF5AF2', intensity: 'base', pulse: false };

/** The room palette; each colour's companion is the next one, so the two glows never share a tint. */
export const AMBIENT_PALETTE = ['#FF9F0A', '#FF375F', '#BF5AF2', '#5E5CE6', '#0A84FF', '#64D2FF', '#30D158', '#34C7A5'] as const;

const ICON_COLORS: Record<string, string> = {
  'mdi:sofa': '#FF9F0A',
  'mdi:bed': '#5E5CE6',
  'mdi:shower': '#64D2FF',
  'mdi:bathtub': '#64D2FF',
  'mdi:silverware-fork-knife': '#BF5AF2',
  'mdi:stove': '#BF5AF2',
  'mdi:desk': '#30D158',
  'mdi:monitor': '#30D158',
  'mdi:garage': '#8E8E93',
  'mdi:tree': '#34C7A5',
  'mdi:flower': '#34C7A5',
};

// Rooms whose name already says what they are, before the hash: the same
// colours as their icons, for homes whose areas have none.
const NAME_COLORS: [RegExp, string][] = [
  [/soggiorno|salotto|living|salon/i, '#FF9F0A'],
  [/camera|letto|bedroom|chambre/i, '#5E5CE6'],
  [/bagno|bath|salle de bain|toilet/i, '#64D2FF'],
  [/cucina|kitchen|cuisine/i, '#BF5AF2'],
  [/studio|ufficio|office|bureau/i, '#30D158'],
  [/garage/i, '#8E8E93'],
  [/giardino|terrazz|balcon|garden|jardin|terrasse/i, '#34C7A5'],
];

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Hue in degrees and saturation, 0 to 1, of an RGB colour. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === rn ? ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60 : max === gn ? ((bn - rn) / delta + 2) * 60 : ((rn - gn) / delta + 4) * 60;
  return [hue, saturation, lightness];
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] =
    hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The second glow: the next palette colour, or the next one after the closest hue. */
export function companionOf(color: string): string {
  const index = AMBIENT_PALETTE.findIndex((entry) => entry.toLowerCase() === color.toLowerCase());
  if (index >= 0) return AMBIENT_PALETTE[(index + 1) % AMBIENT_PALETTE.length];
  const rgb = hexToRgb(color);
  if (!rgb) return BASE_AMBIENT.b;
  const [hue, saturation] = rgbToHsl(...rgb);
  if (saturation < 0.12) return '#5E5CE6';
  let closest = 0;
  let distance = Infinity;
  AMBIENT_PALETTE.forEach((entry, entryIndex) => {
    const [entryHue] = rgbToHsl(...(hexToRgb(entry) as [number, number, number]));
    const gap = Math.min(Math.abs(entryHue - hue), 360 - Math.abs(entryHue - hue));
    if (gap < distance) {
      distance = gap;
      closest = entryIndex;
    }
  });
  return AMBIENT_PALETTE[(closest + 1) % AMBIENT_PALETTE.length];
}

/** A stable index for a name: the same room always gets the same colour. */
export function hashName(name: string): number {
  let hash = 2166136261;
  for (const char of name.trim().toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % AMBIENT_PALETTE.length;
}

export type AmbientArea = { id: string; name: string; icon?: string | null; picture?: string | null };

/**
 * The glows of a room: its picture's colour when one could be read, else its
 * icon, else its name. ``pictureColor`` is null when there is no picture or it
 * could not be read (a foreign image, a failed load).
 */
export function resolveRoomAmbient(area: AmbientArea, pictureColor?: string | null): AmbientRequest {
  const icon = (area.icon ?? '').trim().toLowerCase().replace(/-outline$/, '');
  const a =
    (pictureColor && hexToRgb(pictureColor) ? pictureColor.toUpperCase() : null) ??
    ICON_COLORS[icon] ??
    NAME_COLORS.find(([pattern]) => pattern.test(area.name))?.[1] ??
    AMBIENT_PALETTE[hashName(area.name)];
  return { a, b: companionOf(a), intensity: 'base' };
}

const ALARM_COLORS: Record<string, string> = {
  disarmed: '#3A3F4B',
  armed_home: '#30D158',
  armed_away: '#0A84FF',
  armed_night: '#5E5CE6',
  armed_vacation: '#64D2FF',
  armed_custom_bypass: '#BF5AF2',
  pending: '#FF9F0A',
  triggered: '#FF453A',
  unavailable: '#3A3F4B',
};

/** The glows of Security: sober, the colour of the alarm state, breathing only while it sounds. */
export function resolveAlarmAmbient(state: string | null | undefined): AmbientRequest {
  const key = state && state in ALARM_COLORS ? state : 'unavailable';
  const a = ALARM_COLORS[key];
  const b = key === 'triggered' ? '#FF375F' : key === 'disarmed' ? '#5E5CE6' : a;
  return { a, b, intensity: 'subtle', pulse: key === 'triggered' };
}

/**
 * The dominant hue of a small image, as a glow colour: near black, near white
 * and grey pixels are ignored, the most frequent hue wins and is brought to a
 * glowing lightness. Null when nothing colourful is left.
 */
export function dominantGlowColor(pixels: ArrayLike<number>): string | null {
  const bins = new Array<number>(24).fill(0);
  const hues = new Array<number>(24).fill(0);
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 128) continue;
    const [hue, saturation, lightness] = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if (lightness < 0.12 || lightness > 0.92 || saturation < 0.25) continue;
    const bin = Math.floor(hue / 15) % 24;
    bins[bin] += 1;
    hues[bin] += hue;
  }
  const best = bins.indexOf(Math.max(...bins));
  if (bins[best] === 0) return null;
  return hslToHex(hues[best] / bins[best], 0.78, 0.58);
}
