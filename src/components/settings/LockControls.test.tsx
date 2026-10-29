import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LockControls } from './LockControls';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import type { AccessSnapshot } from '../../security/accessControl';
import { accessFor } from '../../test/accessFixtures';
import type { LockActivityEntry, LockPanelData } from './lockPanelTypes';

const now = Date.now();
const timeline: LockActivityEntry[] = [
  { id: '1', text: '', timestampMs: now - 60_000, kind: 'lock', userActor: 'Mattia' },
  { id: '2', text: '', timestampMs: now - 120_000, kind: 'unlock', userActor: 'Giulia' },
  { id: '3', text: '', timestampMs: now - 180_000, kind: 'lock', source: { kind: 'automation', name: 'Blocco serale' } },
  { id: '4', text: '', timestampMs: now - 240_000, kind: 'open', source: { kind: 'lock' } },
  { id: '5', text: '', timestampMs: now - 300_000, kind: 'unlock', source: { kind: 'lock' } },
];

function renderPanel(
  lock: Partial<LockPanelData> = {},
  handlers: Partial<React.ComponentProps<typeof LockControls>> = {},
  access: AccessSnapshot = accessFor('admin'),
) {
  const props = {
    onLock: vi.fn(),
    onUnlock: vi.fn(() => true),
    onOpen: vi.fn(),
    ...handlers,
  };
  const view = render(
    <AccessControlProvider access={access}>
    <LockControls
      lock={{
        name: 'Porta ingresso',
        state: 'locked',
        supportedFeatures: 1,
        batteryLevel: 82,
        connection: { state: 'online', label: 'Online' },
        rawAttributes: { door_state: 'closed', auto_relock_time: 30 },
        activityTimeline: timeline,
        activityTimelineStatus: 'available',
        protection: 'device',
        ...lock,
      }}
      {...props}
    />
    </AccessControlProvider>,
  );
  return { ...view, ...props };
}

describe('LockControls', () => {
  afterEach(cleanup);

  it('offers plain commands next to the ring, through the same callbacks', () => {
    const { getByRole, onUnlock, onOpen } = renderPanel();

    fireEvent.click(getByRole('button', { name: 'Sblocca Porta ingresso' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onUnlock).toHaveBeenCalledWith();

    fireEvent.click(getByRole('button', { name: 'Apri porta Porta ingresso' }));
    expect(onOpen).toHaveBeenCalledWith();
  });

  it('says how an unlock is protected and keeps a connection that works out of the list', () => {
    const { getByText, queryByText } = renderPanel({ protection: 'code' });

    expect(getByText('Sblocco con codice')).toBeTruthy();
    expect(queryByText('Connessione')).toBeNull();
    expect(getByText('Dopo 30 s')).toBeTruthy();
  });

  it('explains a jammed bolt and retries the lock from the alert', () => {
    const { getByText, getByRole, onLock } = renderPanel({ state: 'jammed' });

    expect(getByText('Il chiavistello non ha completato la corsa')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Riprova a bloccare' }));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('marks details as last known and points at a low battery when the lock is offline', () => {
    const { getByText, getAllByText } = renderPanel({
      state: 'unavailable',
      batteryLevel: 12,
      connection: { state: 'offline', label: 'Offline' },
    });

    expect(getByText('Batteria al 12%')).toBeTruthy();
    expect(getAllByText('Ultimo valore noto').length).toBe(2);
    expect(getByText('Connessione')).toBeTruthy();
  });

  it('shows short activity rows and the full, filtered history on its own page', () => {
    const onSecondaryPageChange = vi.fn();
    const { getByText, getByRole, queryByText } = renderPanel({}, { onSecondaryPageChange });

    expect(getByText('Mattia ha bloccato')).toBeTruthy();
    expect(getByText('Giulia ha sbloccato')).toBeTruthy();
    expect(queryByText('Dalla serratura')).toBeNull();

    fireEvent.click(getByRole('button', { name: 'Mostra tutto' }));
    expect(onSecondaryPageChange).toHaveBeenLastCalledWith(true);
    expect(getByText('Automazione · Blocco serale')).toBeTruthy();
    expect(getByText('Porta aperta')).toBeTruthy();

    fireEvent.click(getByRole('radio', { name: 'Sblocchi' }));
    expect(queryByText('Mattia ha bloccato')).toBeNull();
    expect(getByText('Giulia ha sbloccato')).toBeTruthy();

    fireEvent.click(getByRole('button', { name: 'Serratura' }));
    expect(onSecondaryPageChange).toHaveBeenLastCalledWith(false);
  });
  it('shows a member the lock and its history, never a command', () => {
    const view = renderPanel({}, {}, accessFor('member'));
    expect(view.queryByRole('group', { name: /comandi/i })).toBeNull();
    expect(view.getByText('Porta ingresso')).not.toBeNull();
    expect(view.onUnlock).not.toHaveBeenCalled();
  });
});
