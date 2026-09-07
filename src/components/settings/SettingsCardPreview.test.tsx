import { cleanup, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import SettingsCardPreview from './SettingsCardPreview';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('SettingsCardPreview', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
  it('uses real member images and exposes their presence', () => {
    render(
      <SettingsCardPreview
        variant="people"
        members={[
          {
            id: 'person.mattia',
            name: 'Mattia',
            avatarUrl: '/avatar.jpg',
            presence: 'home',
          },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Mattia' })).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('A casa')).toBeTruthy();
  });

  it('keeps missing Home Assistant data explicit', () => {
    const { rerender } = render(
      <SettingsCardPreview variant="home" areas={[]} entityCount={0} />,
    );
    expect(screen.getByText('Nessuna stanza configurata')).toBeTruthy();

    rerender(
      <SettingsCardPreview
        variant="system"
        statusLabel="Operativo"
        tone="ok"
        cpuPercent={null}
        ramPercent={null}
      />,
    );
    expect(screen.getAllByText('ND')).toHaveLength(2);
  });

  it('summarizes alarm and lock state without adding controls', () => {
    render(
      <SettingsCardPreview
        variant="security"
        alarmCount={2}
        armedAlarmCount={1}
        lockCount={3}
        lockedLockCount={2}
      />,
    );

    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
