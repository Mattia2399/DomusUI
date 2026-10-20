import { beforeEach, describe, expect, it } from 'vitest';
import {
  isOnboardingTranslationsLoaded,
  loadOnboardingTranslations,
  resetOnboardingTranslations,
  translateOnboarding,
} from './onboardingTranslations';
import italian from './onboarding/it';
import english from './onboarding/en';
import french from './onboarding/fr';

describe('onboarding translations', () => {
  beforeEach(() => {
    resetOnboardingTranslations();
  });

  it('provides localized first-run copy in every supported language', async () => {
    await Promise.all([loadOnboardingTranslations('it'), loadOnboardingTranslations('en'), loadOnboardingTranslations('fr')]);
    expect(translateOnboarding('it', 'welcome.start')).toBe('Inizia ora');
    expect(translateOnboarding('en', 'welcome.start')).toBe('Get started');
    expect(translateOnboarding('fr', 'welcome.start')).toBe('Commencer');
    expect(translateOnboarding('en', 'complete.open')).toBe('Open the dashboard');
    expect(translateOnboarding('fr', 'organizer.tab.rooms')).toBe('Pièces');
  });

  it('interpolates user and progress values', async () => {
    await Promise.all([loadOnboardingTranslations('en'), loadOnboardingTranslations('fr')]);
    expect(translateOnboarding('en', 'scan.found', { name: ', Alex' })).toBe('Home found, Alex');
    expect(translateOnboarding('fr', 'wizard.counter', { current: 2, total: 4 })).toBe('2 sur 4');
  });

  it('loads only the language asked for, once', async () => {
    const first = loadOnboardingTranslations('en');
    expect(loadOnboardingTranslations('en')).toBe(first);
    await first;
    expect(isOnboardingTranslationsLoaded('en')).toBe(true);
    expect(isOnboardingTranslationsLoaded('it')).toBe(false);
    expect(isOnboardingTranslationsLoaded('fr')).toBe(false);
  });

  it('keeps the previous language until the new one has arrived', async () => {
    expect(translateOnboarding('it', 'welcome.start')).toBe('welcome.start');
    await loadOnboardingTranslations('it');
    expect(translateOnboarding('fr', 'welcome.start')).toBe('Inizia ora');
    await loadOnboardingTranslations('fr');
    expect(translateOnboarding('fr', 'welcome.start')).toBe('Commencer');
  });

  it('has every word in every language, with the same placeholders', () => {
    const keys = Object.keys(italian).sort() as (keyof typeof italian)[];
    const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
    for (const messages of [english, french]) {
      expect(Object.keys(messages).sort()).toEqual(keys);
      for (const key of keys) expect(placeholders(messages[key]), key).toEqual(placeholders(italian[key]));
    }
  });
});
