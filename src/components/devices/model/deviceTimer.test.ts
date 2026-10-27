import { describe, expect, it } from 'vitest';
import { toDeviceModel } from './device';
import { canHaveTimer, formatTimerDuration, minutesLeft, parseDeviceTimers, withTimer } from './deviceTimer';

const dt = (key: string, parameters: Record<string, string | number> = {}) =>
  `${key}(${Object.entries(parameters).map(([name, value]) => `${name}=${value}`).join(',')})`;
const model = (entityId: string, attributes: Record<string, unknown> = {}) => toDeviceModel(entityId, { state: 'on', rawAttributes: attributes })!;

describe('device timers', () => {
  it('belong to plugs, switches, fans and humidifiers', () => {
    expect(canHaveTimer(model('switch.tv', { device_class: 'outlet' }))).toBe(true);
    expect(canHaveTimer(model('switch.boiler'))).toBe(true);
    expect(canHaveTimer(model('fan.cappa'))).toBe(true);
    expect(canHaveTimer(model('humidifier.bagno'))).toBe(true);
    expect(canHaveTimer(model('cover.tapparella'))).toBe(false);
    expect(canHaveTimer(model('input_boolean.ospiti'))).toBe(false);
  });

  it('read the server answer on this device clock', () => {
    const received = Date.parse('2026-10-27T10:00:05Z');
    const timers = parseDeviceTimers(
      {
        now: '2026-10-27T10:00:00+00:00',
        timers: [
          { entity_id: 'switch.tv', minutes: 30, started_at: '2026-10-27T09:50:00+00:00', ends_at: '2026-10-27T10:20:00+00:00' },
          { entity_id: 'fan.cappa', minutes: 'x', ends_at: '2026-10-27T10:20:00+00:00' },
        ],
      },
      received,
    );
    expect(timers).toEqual({ 'switch.tv': { entityId: 'switch.tv', minutes: 30, endsAt: Date.parse('2026-10-27T10:20:05Z') } });
    expect(minutesLeft(timers!['switch.tv'], received)).toBe(20);
    expect(parseDeviceTimers({ code: 'unknown_command' })).toBeNull();
    expect(parseDeviceTimers(null)).toBeNull();
  });

  it('say how long, and add it to a card status while it runs', () => {
    expect(formatTimerDuration(15, dt as never)).toBe('durationMinutes(n=15)');
    expect(formatTimerDuration(60, dt as never)).toBe('durationHours(n=1)');
    expect(formatTimerDuration(80, dt as never)).toBe('durationHoursMinutes(h=1,m=20)');
    const timer = { entityId: 'switch.tv', minutes: 30, endsAt: 30 * 60_000 };
    expect(withTimer('86 W', timer, 0, dt as never)).toBe('timerCard(status=86 W,left=durationMinutes(n=30))');
    expect(withTimer('86 W', timer, 31 * 60_000, dt as never)).toBe('86 W');
    expect(withTimer('86 W', null, 0, dt as never)).toBe('86 W');
  });
});
