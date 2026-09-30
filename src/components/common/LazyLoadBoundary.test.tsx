// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { LazyLoadBoundary } from './LazyLoadBoundary';

function BrokenChunk(): ReactElement {
  throw new Error('chunk unavailable');
}

function OptionalBrokenChunk({ broken }: { broken: boolean }) {
  if (broken) throw new Error('chunk unavailable');
  return <div>Workspace disponibile</div>;
}

describe('LazyLoadBoundary', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('contains a lazy render failure and offers an explicit reload', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    const onReload = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <I18nProvider>
        <LazyLoadBoundary fallback={<div>Caricamento</div>} onReload={onReload}>
          <BrokenChunk />
        </LazyLoadBoundary>
      </I18nProvider>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Contenuto non caricato' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ricarica Domus UI' }));
    expect(onReload).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('recovers locally when navigation selects another lazy workspace', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <I18nProvider>
        <LazyLoadBoundary fallback={null} resetKey="rooms">
          <OptionalBrokenChunk broken />
        </LazyLoadBoundary>
      </I18nProvider>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <I18nProvider>
        <LazyLoadBoundary fallback={null} resetKey="settings">
          <OptionalBrokenChunk broken={false} />
        </LazyLoadBoundary>
      </I18nProvider>,
    );

    expect(screen.getByText('Workspace disponibile')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    consoleError.mockRestore();
  });
});
