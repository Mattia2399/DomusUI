/*
 * The colour disc: the hue is the angle (red at the top, clockwise) and the
 * saturation the distance from the white centre. Plain functions from a point
 * to a colour and back, so that the drawing and the finger always agree.
 */

export type HueSaturation = { hue: number; saturation: number };

/** How far from the centre the handle goes, as a share of the disc's width. */
export const COLOR_DISC_REACH = 0.45;

export function clampColor({ hue, saturation }: HueSaturation): HueSaturation {
  return {
    hue: Math.round(((hue % 360) + 360) % 360),
    saturation: Math.round(Math.max(0, Math.min(100, saturation))),
  };
}

/** The colour under a point, measured from the top left corner of a disc this wide. */
export function colorAtPoint(x: number, y: number, width: number): HueSaturation {
  const dx = x - width / 2;
  const dy = y - width / 2;
  const reach = width * COLOR_DISC_REACH;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return clampColor({ hue: degrees, saturation: reach > 0 ? (Math.hypot(dx, dy) / reach) * 100 : 0 });
}

/** Where a colour sits on the disc, in percent of its width from the top left corner. */
export function pointOfColor({ hue, saturation }: HueSaturation) {
  const angle = (hue * Math.PI) / 180;
  const distance = (Math.max(0, Math.min(100, saturation)) / 100) * COLOR_DISC_REACH * 100;
  return { left: 50 + distance * Math.sin(angle), top: 50 - distance * Math.cos(angle) };
}
