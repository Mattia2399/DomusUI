import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearHaStateTranslationsCache,
  loadHaStateTranslations,
  translateHaState,
} from './haStateTranslations';

afterEach(() => clearHaStateTranslationsCache());

describe('haStateTranslations', () => {
  it('asks Home Assistant once per language for the state words only', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => ({
      resources: message.category === 'entity_component'
        ? { 'component.light.entity_component._.state.on': 'Acceso', 'component.light.title': 'Luce' }
        : { 'component.hue.entity.sensor.mode.state.relax': 'Rilassante' },
    }));

    const first = await loadHaStateTranslations(callApi as never, 'it');
    await loadHaStateTranslations(callApi as never, 'it');

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenCalledWith(
      { type: 'frontend/get_translations', language: 'it', category: 'entity_component' },
      { reportError: false },
    );
    expect(first).toEqual({
      'component.light.entity_component._.state.on': 'Acceso',
      'component.hue.entity.sensor.mode.state.relax': 'Rilassante',
    });
  });

  it('answers with nothing and tries again later when Home Assistant fails', async () => {
    const callApi = vi.fn(async () => {
      throw new Error('offline');
    });

    expect(await loadHaStateTranslations(callApi as never, 'it')).toEqual({});
    await loadHaStateTranslations(callApi as never, 'it');
    expect(callApi).toHaveBeenCalledTimes(4);
  });

  it('prefers the integration words, then the device class, then the domain', () => {
    const translations = {
      'component.hue.entity.sensor.mode.state.on': 'Integrazione',
      'component.binary_sensor.entity_component.door.state.on': 'Aperta',
      'component.binary_sensor.entity_component._.state.on': 'Attivo',
    };

    expect(translateHaState(translations, { domain: 'sensor', state: 'on', platform: 'hue', translationKey: 'mode' })).toBe('Integrazione');
    expect(translateHaState(translations, { domain: 'binary_sensor', state: 'on', deviceClass: 'door' })).toBe('Aperta');
    expect(translateHaState(translations, { domain: 'binary_sensor', state: 'on', deviceClass: 'motion' })).toBe('Attivo');
    expect(translateHaState(translations, { domain: 'light', state: 'on' })).toBeNull();
  });
});
