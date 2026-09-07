import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { XsProfileChip } from './XsProfileChip';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

const renderChip = (node: React.ReactNode) => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  return render(<I18nProvider>{node}</I18nProvider>);
};

describe('XsProfileChip', () => {
  it('opens the existing profile flow and falls back to user initials', () => {
    const onOpenProfile = vi.fn();

    renderChip(
      <XsProfileChip
        userName="Mattia Ticconi"
        haStatus="connected"
        onOpenProfile={onOpenProfile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apri profilo di Mattia Ticconi' }));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText('MT')).toBeTruthy();
    expect(screen.queryByText('Mattia')).toBeNull();
    expect(document.querySelector('[data-ha-status="connected"]')).toBeTruthy();
  });

  it('uses the Home Assistant avatar when one is available', () => {
    renderChip(
      <XsProfileChip
        userAvatarUrl="/api/image/serve/avatar"
        userName="Mattia"
        haStatus="reconnecting"
        onOpenProfile={() => undefined}
      />,
    );

    const image = document.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/api/image/serve/avatar');
    expect(document.querySelector('[data-ha-status="reconnecting"]')).toBeTruthy();
  });
});
