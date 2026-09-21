import { describe, expect, it } from 'vitest';
import { resolveBinarySensorPresentation } from './binarySensorPresentation';

describe('binary sensor presentation', () => {
  it('distinguishes positive connection from a hazardous smoke state', () => {
    expect(resolveBinarySensorPresentation('on', 'connectivity', 'it')).toMatchObject({
      state: 'on', label: 'Connesso', tone: 'success', available: true,
    });
    expect(resolveBinarySensorPresentation('on', 'smoke', 'it')).toMatchObject({
      state: 'on', label: 'Fumo rilevato', tone: 'alert', available: true,
    });
    expect(resolveBinarySensorPresentation('off', 'smoke', 'it')).toMatchObject({
      state: 'off', label: 'Nessun fumo', tone: 'success', available: true,
    });
  });

  it('localizes common device classes in all supported languages', () => {
    expect(resolveBinarySensorPresentation('on', 'door', 'it').label).toBe('Aperta');
    expect(resolveBinarySensorPresentation('on', 'door', 'en').label).toBe('Open');
    expect(resolveBinarySensorPresentation('on', 'door', 'fr').label).toBe('Ouverte');
    expect(resolveBinarySensorPresentation('off', 'motion', 'it').label).toBe('Nessun movimento');
  });

  it('keeps unknown and unavailable distinct from off', () => {
    expect(resolveBinarySensorPresentation('unknown', 'door', 'it')).toMatchObject({
      state: 'unknown', label: 'Stato sconosciuto', available: false,
    });
    expect(resolveBinarySensorPresentation('unavailable', 'door', 'it')).toMatchObject({
      state: 'unavailable', label: 'Non disponibile', available: false,
    });
    expect(resolveBinarySensorPresentation('off', 'door', 'it')).toMatchObject({
      state: 'off', label: 'Chiusa', available: true,
    });
  });

  it('falls back safely when device class is missing', () => {
    expect(resolveBinarySensorPresentation('on', undefined, 'fr').label).toBe('Actif');
  });
});
