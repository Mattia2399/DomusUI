import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingOrganizer } from './OnboardingOrganizer';
import { I18nProvider } from '../../i18n/I18nProvider';

function renderOrganizer(ui: React.ReactNode) {
  window.localStorage.setItem('domusui.language.v1', 'it');
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('OnboardingOrganizer', () => {
  afterEach(cleanup);

  it('keeps edits local until the final confirmation', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      switch (message.type) {
        case 'config/floor_registry/list':
          return [{ floor_id: 'ground', name: 'Piano terra', level: 0 }];
        case 'config/area_registry/list':
          return [{ area_id: 'living', name: 'Soggiorno', floor_id: 'ground' }];
        case 'config/entity_registry/list':
          return [{ entity_id: 'light.living', name: 'Luce soggiorno', area_id: 'living' }];
        case 'config/device_registry/list':
          return [];
        case 'config/device_registry/list_for_display':
          return { devices: [] };
        case 'config/floor_registry/update':
          return { floor_id: 'ground', name: message.name, level: message.level };
        default:
          return {};
      }
    });
    const onComplete = vi.fn();
    const { findByLabelText, getByRole } = renderOrganizer(
      <OnboardingOrganizer callApi={callApi as never} canManage onBack={vi.fn()} onComplete={onComplete} onReconnect={vi.fn()} />,
    );

    const floorName = await findByLabelText('Nome piano Piano terra');
    fireEvent.change(floorName, { target: { value: 'Ingresso' } });
    expect(callApi.mock.calls.some(([message]) => message.type === 'config/floor_registry/update')).toBe(false);

    fireEvent.click(getByRole('radio', { name: 'Riepilogo' }));
    fireEvent.click(getByRole('button', { name: /Conferma organizzazione/ }));

    await waitFor(() => expect(callApi.mock.calls.some(([message]) => message.type === 'config/floor_registry/update')).toBe(true));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
  });

  it('does not read or mutate registries without administrative permission', async () => {
    const callApi = vi.fn(async () => null);
    const { findByText } = renderOrganizer(
      <OnboardingOrganizer callApi={callApi} canManage={false} onBack={vi.fn()} onComplete={vi.fn()} onReconnect={vi.fn()} />,
    );

    await findByText('Permessi insufficienti');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('offers registry retry and full reconnection when organization data cannot be loaded', async () => {
    const callApi = vi.fn(async () => null);
    const onReconnect = vi.fn();
    const { container, findByRole } = renderOrganizer(
      <OnboardingOrganizer
        callApi={callApi}
        canManage
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onReconnect={onReconnect}
      />,
    );

    const retryButton = await findByRole('button', { name: 'Riprova lettura' });
    const firstAttemptCalls = callApi.mock.calls.length;
    fireEvent.click(retryButton);
    await waitFor(() => expect(callApi.mock.calls.length).toBeGreaterThan(firstAttemptCalls));

    const reconnectButton = await findByRole('button', { name: 'Riconnetti Home Assistant' });
    expect(container.querySelector('.onboarding-actions')?.contains(reconnectButton)).toBe(true);
    fireEvent.click(reconnectButton);
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('accepts the area, entity and device registries returned through the panel bridge', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      switch (message.type) {
        case 'config/floor_registry/list':
          return [];
        case 'config/area_registry/list':
          return [{ area_id: 'living_room', name: 'Soggiorno', floor_id: null }];
        case 'config/entity_registry/list':
          return [{
            entity_id: 'light.living_room',
            name: 'Luce soggiorno',
            area_id: 'living_room',
          }];
        case 'config/device_registry/list':
          return [];
        case 'config/device_registry/list_for_display':
          return { devices: [] };
        default:
          return null;
      }
    });

    renderOrganizer(
      <OnboardingOrganizer
        callApi={callApi as never}
        canManage
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onReconnect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Nessun piano configurato. Puoi crearne uno ora.')).toBeTruthy();
    });
    expect(screen.queryByText(/non ha restituito tutti i registri necessari/i)).toBeNull();
    expect(callApi).toHaveBeenCalledWith(
      { type: 'config/area_registry/list' },
      { reportError: false },
    );
  });
});
