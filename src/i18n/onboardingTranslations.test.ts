import { describe, expect, it } from 'vitest';
import { translateOnboarding } from './onboardingTranslations';

describe('onboarding translations', () => {
  it('provides localized first-run copy in every supported language', () => {
    expect(translateOnboarding('it', 'welcome.start')).toBe('Inizia ora');
    expect(translateOnboarding('en', 'welcome.start')).toBe('Get started');
    expect(translateOnboarding('fr', 'welcome.start')).toBe('Commencer');
    expect(translateOnboarding('en', 'complete.open')).toBe('Open the dashboard');
    expect(translateOnboarding('fr', 'organizer.tab.rooms')).toBe('Pièces');
  });

  it('interpolates user and progress values', () => {
    expect(translateOnboarding('en', 'scan.found', { name: ', Alex' })).toBe('Home found, Alex');
    expect(translateOnboarding('fr', 'wizard.counter', { current: 2, total: 4 })).toBe('2 sur 4');
  });
});
