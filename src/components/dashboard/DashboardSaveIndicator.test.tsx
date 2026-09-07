import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardSaveIndicator } from './DashboardSaveIndicator';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

function renderIndicator(node: React.ReactNode) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  return render(<I18nProvider>{node}</I18nProvider>);
}

describe('DashboardSaveIndicator', () => {
  it('shows a pending draft before the edit session is committed', () => {
    const { getByRole } = renderIndicator(<DashboardSaveIndicator status={{ phase: 'dirty' }} />);

    expect(getByRole('status').textContent).toContain('Modifiche non salvate');
    expect(getByRole('status').getAttribute('title')).toContain('uscirai');
  });

  afterEach(cleanup);

  it('shows the successful-save label briefly while keeping an accessible status', () => {
    vi.useFakeTimers();
    const { getByRole, getByText, queryByText } = renderIndicator(
      <DashboardSaveIndicator status={{ phase: 'saved', savedAt: Date.now() }} />,
    );

    expect(getByRole('status').getAttribute('aria-label')).toBe('Salvato');
    expect(getByText('Salvato')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(queryByText('Salvato')).toBeNull();
    expect(getByRole('status').getAttribute('aria-label')).toBe('Salvato');
    vi.useRealTimers();
  });

  it('exposes storage failures as an assertive alert', () => {
    const { getByRole } = renderIndicator(
      <DashboardSaveIndicator
        status={{ phase: 'error', attemptedAt: Date.now(), code: 'quota_exceeded' }}
      />,
    );

    expect(getByRole('alert').textContent).toContain('Modifiche non salvate');
    expect(getByRole('alert').getAttribute('title')).toBe('Spazio di salvataggio esaurito');
  });
});
