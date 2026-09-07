import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityAuthModal } from './SecurityAuthModal';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

const withI18n = (node: React.ReactNode) => <I18nProvider>{node}</I18nProvider>;

const baseProps = {
  isOpen: true,
  pendingAlarmState: 'armed_away',
  pendingStateRequiresCode: true,
  isAlarmCodeNumeric: true,
  alarmCodeTypeLabel: 'PIN allarme',
  authPinInput: '',
  onPinInputChange: vi.fn(),
  onVerifyWithPin: vi.fn(),
  onPushPinDigit: vi.fn(),
  onPopPinDigit: vi.fn(),
  onClearPin: vi.fn(),
  onClose: vi.fn(),
};

describe('SecurityAuthModal safety messaging', () => {
  afterEach(cleanup);
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));

  it('does not show invalid-code feedback before a submitted attempt', () => {
    const { queryByText } = render(withI18n(<SecurityAuthModal {...baseProps} />));

    expect(queryByText(/non valido|impossibile autorizzare/i)).toBeNull();
  });

  it('shows auth errors only when the parent reports a failed verification', () => {
    const onVerifyWithPin = vi.fn();
    const { getByRole, queryByText, rerender } = render(withI18n(
      <SecurityAuthModal {...baseProps} onVerifyWithPin={onVerifyWithPin} />,
    ));

    fireEvent.click(getByRole('button', { name: 'Conferma' }));
    expect(onVerifyWithPin).toHaveBeenCalledOnce();
    expect(queryByText('Impossibile autorizzare il comando.')).toBeNull();

    rerender(withI18n(
      <SecurityAuthModal
        {...baseProps}
        onVerifyWithPin={onVerifyWithPin}
        authError="Impossibile autorizzare il comando."
      />,
    ));
    expect(queryByText('Impossibile autorizzare il comando.')).not.toBeNull();
  });

  it('shows the PIN keypad when device verification is cancelled or times out', async () => {
    const onVerifyWithDevice = vi.fn(async () => false);
    const { findByRole } = render(withI18n(
      <SecurityAuthModal
        {...baseProps}
        preferDeviceAuth
        onVerifyWithDevice={onVerifyWithDevice}
      />,
    ));

    expect(await findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(onVerifyWithDevice).toHaveBeenCalledOnce();
  });

  it('keeps the active device attempt across parent rerenders', async () => {
    let resolveVerification: ((verified: boolean) => void) | undefined;
    const firstVerifier = vi.fn(
      () => new Promise<boolean>((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const { findByRole, rerender } = render(withI18n(
      <SecurityAuthModal
        {...baseProps}
        preferDeviceAuth
        onVerifyWithDevice={firstVerifier}
      />,
    ));

    await waitFor(() => expect(firstVerifier).toHaveBeenCalledOnce());

    rerender(withI18n(
      <SecurityAuthModal
        {...baseProps}
        preferDeviceAuth
        isAuthBusy
        onVerifyWithDevice={async () => false}
      />,
    ));

    await act(async () => {
      resolveVerification?.(false);
    });

    expect(await findByRole('button', { name: 'Riprova' })).toBeTruthy();
  });
});
