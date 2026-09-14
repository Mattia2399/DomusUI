import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { StarterLayoutChoiceModal } from './StarterLayoutChoiceModal';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('StarterLayoutChoiceModal', () => {
  it('offers both choices to an authorized user', () => {
    const onKeep = vi.fn();
    const onStartEmpty = vi.fn();
    render(
      <StarterLayoutChoiceModal
        isOpen
        sectionCount={2}
        widgetCount={6}
        canStartEmpty
        onKeep={onKeep}
        onStartEmpty={onStartEmpty}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mantieni dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Parti da zero' }));
    expect(onKeep).toHaveBeenCalledOnce();
    expect(onStartEmpty).toHaveBeenCalledOnce();
  });

  it('hides the destructive choice without edit permission and renders English', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(
      <I18nProvider>
        <StarterLayoutChoiceModal
          isOpen
          sectionCount={1}
          widgetCount={4}
          canStartEmpty={false}
          onKeep={vi.fn()}
          onStartEmpty={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Choose your starting point' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start from scratch' })).toBeNull();
  });
});
