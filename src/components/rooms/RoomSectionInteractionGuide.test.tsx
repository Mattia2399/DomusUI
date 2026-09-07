import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomSectionInteractionGuide } from './RoomSectionInteractionGuide';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

function renderGuide(onDismiss = vi.fn()) {
  render(
    <I18nProvider>
      <RoomSectionInteractionGuide onDismiss={onDismiss} />
    </I18nProvider>,
  );
  return onDismiss;
}

describe('RoomSectionInteractionGuide', () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  });

  it('explains the real selection gesture and available actions', () => {
    const onDismiss = vi.fn();
    renderGuide(onDismiss);

    expect(screen.getByText('Tieni premuto per organizzare')).not.toBeNull();
    expect(screen.getByText('Aggiungi')).not.toBeNull();
    expect(screen.getByText('Sposta')).not.toBeNull();
    expect(screen.getByText('Rimuovi')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nascondi guida gestione dispositivi' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('uses the selected supported language', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    renderGuide();

    expect(screen.getByText('Press and hold to organize')).not.toBeNull();
    expect(screen.getByText('Move')).not.toBeNull();
  });
});
