import type { SeriesPoint } from './sensor';
import type { StateChange } from './security';

/*
 * The figures the sensor families draw from a day of history: hourly means,
 * what a meter added since midnight, the energy under a power line, the
 * cheapest hours of a price, the opening spans of a yes/no. Plain functions.
 */

export const HOUR = 3_600_000;

export function startOfDay(now: number) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** The value a series had at a time: the last point at or before it. */
export function valueAt(points: SeriesPoint[], time: number) {
  let found: number | null = null;
  for (const point of points) {
    if (point.t > time) break;
    found = point.v;
  }
  return found;
}

/** The mean of each of the last 24 hours, oldest first; an hour without points keeps the last value. */
export function hourlyMeans(points: SeriesPoint[], now: number, hours = 24) {
  const end = Math.floor(now / HOUR) * HOUR + HOUR;
  const start = end - hours * HOUR;
  let carry = valueAt(points, start);
  return Array.from({ length: hours }, (_, index) => {
    const from = start + index * HOUR;
    const inside = points.filter((point) => point.t >= from && point.t < from + HOUR).map((point) => point.v);
    if (inside.length > 0) carry = inside[inside.length - 1];
    return inside.length > 0 ? inside.reduce((sum, value) => sum + value, 0) / inside.length : carry;
  });
}

/** How much a meter went up in each of the last 24 hours. */
export function hourlyIncrease(points: SeriesPoint[], now: number, hours = 24) {
  const end = Math.floor(now / HOUR) * HOUR + HOUR;
  const start = end - hours * HOUR;
  return Array.from({ length: hours }, (_, index) => {
    const from = start + index * HOUR;
    const a = valueAt(points, from);
    const b = valueAt(points, Math.min(now, from + HOUR));
    return a === null || b === null ? 0 : Math.max(0, b - a);
  });
}

/** What a meter added since midnight, or null without a point from before it. */
export function increaseSince(points: SeriesPoint[], from: number, current: number | null) {
  const start = valueAt(points, from) ?? points.find((point) => point.t >= from)?.v ?? null;
  if (start === null || current === null) return null;
  return Math.max(0, current - start);
}

/** The energy under a power line since a time, in the unit of the line times hours (W → Wh). */
export function energySince(points: SeriesPoint[], from: number, now: number) {
  const inside = points.filter((point) => point.t >= from && point.t <= now);
  if (inside.length < 2) return null;
  let total = 0;
  for (let index = 1; index < inside.length; index += 1) {
    const a = inside[index - 1];
    const b = inside[index];
    total += ((a.v + b.v) / 2) * ((b.t - a.t) / HOUR);
  }
  return total;
}

/** The change over the last hours, for the arrow beside a value. */
export function changeOver(points: SeriesPoint[], hours: number, now: number) {
  if (points.length < 2) return 0;
  const before = valueAt(points, now - hours * HOUR) ?? points[0].v;
  return points[points.length - 1].v - before;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS)[number];

/** Where a wind comes from, from its bearing in degrees. */
export function compassPoint(degrees: number): CompassPoint {
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/*
 * The prices of the day from the attributes an energy-price integration
 * keeps (`today` as 24 numbers, or `raw_today`/`prices`/`forecast` as a list
 * of hours), one per hour from midnight; null when there are none.
 */
export function dayPrices(attributes: Record<string, unknown>, now: number): number[] | null {
  const today = attributes.today;
  if (Array.isArray(today) && today.length >= 24 && today.every((value) => typeof value === 'number')) {
    if (today.length === 24) return today as number[];
    const step = today.length / 24;
    return Array.from({ length: 24 }, (_, hour) => (today as number[])[Math.floor(hour * step)]);
  }
  const list = [attributes.raw_today, attributes.prices, attributes.forecast].find(Array.isArray) as unknown[] | undefined;
  if (!list) return null;
  const midnight = startOfDay(now);
  const hours: Array<number | null> = Array.from({ length: 24 }, () => null);
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const start = Date.parse(`${record.start ?? record.startsAt ?? record.time ?? record.datetime ?? ''}`);
    const price = Number(record.value ?? record.price ?? record.total);
    if (!Number.isFinite(start) || !Number.isFinite(price)) continue;
    const hour = Math.floor((start - midnight) / HOUR);
    if (hour >= 0 && hour < 24 && hours[hour] === null) hours[hour] = price;
  }
  return hours.every((value) => value !== null) ? (hours as number[]) : null;
}

/** The cheapest run of hours of the day, as the hour it starts. */
export function cheapestRun(prices: number[], length = 3, fromHour = 0) {
  let best: number | null = null;
  let bestSum = Infinity;
  for (let start = fromHour; start + length <= prices.length; start += 1) {
    const sum = prices.slice(start, start + length).reduce((total, value) => total + value, 0);
    if (sum < bestSum) {
      bestSum = sum;
      best = start;
    }
  }
  return best;
}

/** The yes spans of the day, as times, from the changes and the state now. */
export function yesSpans(changes: StateChange[], from: number, now: number) {
  const spans: Array<{ start: number; end: number }> = [];
  let open: number | null = null;
  const before = [...changes].reverse().find((change) => change.t < from);
  if (before?.state === 'on') open = from;
  for (const change of changes) {
    if (change.t < from) continue;
    if (change.state === 'on' && open === null) open = change.t;
    if (change.state !== 'on' && open !== null) {
      spans.push({ start: open, end: change.t });
      open = null;
    }
  }
  if (open !== null) spans.push({ start: open, end: now });
  return spans;
}

/** The yes changes of each hour of the day (passages of a motion sensor). */
export function hourlyYes(changes: StateChange[], now: number, hours = 24) {
  const end = Math.floor(now / HOUR) * HOUR + HOUR;
  const start = end - hours * HOUR;
  const counts = Array.from({ length: hours }, () => 0);
  for (const change of changes) {
    if (change.state !== 'on' || change.t < start || change.t >= end) continue;
    counts[Math.floor((change.t - start) / HOUR)] += 1;
  }
  return counts;
}
