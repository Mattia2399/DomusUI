import { describe, expect, it } from 'vitest';
import { formatEntityState, formatRelativeTime } from './entityStateFormat';

const labels = { disabled: 'Disabilitata', unavailable: 'Non disponibile', unknown: 'Sconosciuto' };
const NOW = Date.parse('2026-10-12T12:00:00Z');

const format = (entityId: string, state: string, extra: Record<string, unknown> = {}, unit?: string) =>
  formatEntityState({
    entityId,
    entity: { state, unit, rawAttributes: extra },
    translations: {},
    locale: 'it',
    labels,
    nowMs: NOW,
  });

describe('formatEntityState', () => {
  it('writes numbers in the user format with their unit', () => {
    expect(format('sensor.temperatura', '21.5', {}, '°C').text).toBe('21,5 °C');
    expect(format('sensor.disco', '61', {}, '%').text).toBe('61%');
    expect(format('sensor.consumo', '1234.567', {}, 'kWh').text).toBe('1234,57 kWh');
  });

  it('shows times as how long ago', () => {
    expect(format('sensor.ultimo_avvio', '2026-10-09T12:00:00Z', { device_class: 'timestamp' }).text).toBe('3 giorni fa');
    expect(format('button.riavvia', '2026-10-12T10:00:00Z').text).toBe('2 ore fa');
  });

  it('falls back to its own words when Home Assistant has none', () => {
    expect(format('person.giulia', 'not_home').text).toBe('Fuori casa');
    expect(format('binary_sensor.portone', 'on', { device_class: 'door' }).text).toBe('Aperta');
    expect(format('binary_sensor.movimento', 'off', { device_class: 'motion' }).text).toBe('Non rilevato');
    expect(format('update.core', 'on').text).toBe('Aggiornamento disponibile');
    expect(format('sensor.modo', 'eco_plus').text).toBe('Eco plus');
  });

  it('colours the states that need a look', () => {
    expect(format('light.cucina', 'on').tone).toBe('warning');
    expect(format('person.giulia', 'home').tone).toBe('success');
    expect(format('alarm_control_panel.casa', 'triggered').tone).toBe('danger');
    expect(format('binary_sensor.fumo', 'on', { device_class: 'smoke' }).tone).toBe('danger');
    expect(format('light.cucina', 'off').tone).toBe('default');
  });

  it('marks unavailable, unknown and disabled entities', () => {
    expect(format('lock.porta', 'unavailable')).toEqual({ text: 'Non disponibile', tone: 'default', unavailable: true });
    expect(format('sensor.x', 'unknown').text).toBe('Sconosciuto');
    expect(
      formatEntityState({
        entityId: 'switch.irrigazione',
        entity: undefined,
        registry: { entityId: 'switch.irrigazione', disabledBy: 'user' },
        translations: {},
        locale: 'it',
        labels,
      }).text,
    ).toBe('Disabilitata');
  });

  it('formats relative times in the chosen language', () => {
    expect(formatRelativeTime(NOW - 7_200_000, 'en', NOW)).toBe('2 hours ago');
    expect(formatRelativeTime(NOW - 86_400_000, 'fr', NOW)).toBe('hier');
  });
});
