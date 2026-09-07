import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardRecoveryModal } from './DashboardRecoveryModal';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

describe('DashboardRecoveryModal', () => {
  afterEach(cleanup);

  it('requires an explicit choice between current and recovery layouts', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    const onKeepCurrent = vi.fn();
    const onRestore = vi.fn();
    const { getByRole } = render(
      <I18nProvider><DashboardRecoveryModal
        snapshot={{ runtimeMode: 'real', createdAt: Date.now() }}
        onKeepCurrent={onKeepCurrent}
        onRestore={onRestore}
      /></I18nProvider>,
    );

    expect(getByRole('dialog').textContent).toContain('Copia di recupero disponibile');
    fireEvent.click(getByRole('button', { name: /Mantieni attuale/i }));
    fireEvent.click(getByRole('button', { name: /Ripristina copia/i }));
    expect(onKeepCurrent).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
  });
});
