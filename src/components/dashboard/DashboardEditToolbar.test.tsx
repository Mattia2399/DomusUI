import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardEditToolbar } from './DashboardEditToolbar';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

function renderToolbar(node: React.ReactNode) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  return render(<I18nProvider>{node}</I18nProvider>);
}

describe('DashboardEditToolbar', () => {
  afterEach(cleanup);

  it('exposes accessible undo and redo controls beside save status', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { getByRole } = renderToolbar(
      <DashboardEditToolbar
        saveStatus={{ phase: 'saved', savedAt: Date.now() }}
        canUndo
        canRedo={false}
        onUndo={onUndo}
        onRedo={onRedo}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Annulla ultima modifica' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect((getByRole('button', { name: 'Ripeti ultima modifica' }) as HTMLButtonElement).disabled).toBe(true);
    expect(getByRole('status').textContent).toContain('Salvato');
  });

  it('exposes a compact warning when another client publishes a newer revision', () => {
    const onRemoteUpdateClick = vi.fn();
    const { getByRole } = renderToolbar(
      <DashboardEditToolbar
        saveStatus={{ phase: 'dirty' }}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        remoteRevision={36}
        onRemoteUpdateClick={onRemoteUpdateClick}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Versione 36 disponibile da Home Assistant' }));
    expect(onRemoteUpdateClick).toHaveBeenCalledOnce();
  });
});
