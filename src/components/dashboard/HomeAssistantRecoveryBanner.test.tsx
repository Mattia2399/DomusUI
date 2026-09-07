import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistantRecoveryBanner } from './HomeAssistantRecoveryBanner';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

describe('HomeAssistantRecoveryBanner', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
  afterEach(() => { cleanup(); window.localStorage.removeItem(LANGUAGE_STORAGE_KEY); });

  it('offers both transient retry and a new authentication flow', () => {
    const onRetry = vi.fn();
    const onReconnect = vi.fn();
    const { getByRole } = render(
      <HomeAssistantRecoveryBanner
        status="error"
        error="Sessione scaduta"
        onRetry={onRetry}
        onReconnect={onReconnect}
      />,
      { wrapper: I18nProvider },
    );

    expect(getByRole('alert').textContent).toContain('Sessione scaduta');
    fireEvent.click(getByRole('button', { name: 'Riprova' }));
    fireEvent.click(getByRole('button', { name: 'Accedi di nuovo' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('keeps transient outages separate from expired authentication', () => {
    const onRetry = vi.fn();
    const onReconnect = vi.fn();
    const { getByRole, queryByRole, rerender } = render(
      <HomeAssistantRecoveryBanner
        status="offline"
        onRetry={onRetry}
        onReconnect={onReconnect}
        lastUpdatedAt={Date.now()}
      />,
      { wrapper: I18nProvider },
    );

    expect(getByRole('alert').textContent).toContain('non raggiungibile');
    expect(getByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Accedi di nuovo' })).toBeNull();

    rerender(
      <HomeAssistantRecoveryBanner
        status="reauth_required"
        onRetry={onRetry}
        onReconnect={onReconnect}
      />,
    );
    expect(getByRole('dialog').textContent).toContain('Sessione scaduta');
    expect(queryByRole('button', { name: 'Riprova' })).toBeNull();
    expect(getByRole('button', { name: 'Accedi di nuovo' })).toBeTruthy();
  });
});
