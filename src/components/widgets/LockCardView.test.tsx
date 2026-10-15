import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LockCardView, type LockCardRingState } from './LockCardView';
import { buildLockCardModel, type LockCardModel } from './lockCardModel';
import type { Widget } from '../../types/dashboardModels';

const baseModel: LockCardModel = {
  title: 'Porta ingresso',
  state: 'locked',
  stateLabel: 'Bloccata',
  compactStateLabel: 'Protetta',
  caption: 'Accesso protetto',
  hint: 'Tieni premuto per sbloccare',
  supportsOpen: false,
  isLocked: true,
  isUnlocked: false,
  isOpen: false,
  isJammed: false,
  isTransitioning: false,
  isUnavailable: false,
  primaryAction: 'unlock',
  primaryActionLabel: 'Sblocca',
  primaryActionHint: 'Scorri per sbloccare',
  tone: 'secure',
  headline: 'Bloccata',
  ringIcon: 'lock',
  solidCore: true,
  canOpenLatch: false,
};

const idleRing: LockCardRingState = {
  lap1: 0,
  lap2: 0,
  stage: 'idle',
  isPressing: false,
  isNudging: false,
  outcome: null,
  bindings: {},
};

function renderCard(model: LockCardModel, variant: 'mini' | 'compact' | 'standard' | 'full', ring = idleRing) {
  return render(
    <LockCardView
      model={model}
      layoutVariant={variant}
      isSelected={false}
      isEditMode={false}
      ring={ring}
      onOpen={vi.fn()}
      onResetHold={vi.fn()}
    />,
  );
}

describe('LockCardView presentation', () => {
  afterEach(cleanup);

  it('shows no battery or connection placeholders when the lock reports none', () => {
    const { queryByText, queryByLabelText } = renderCard(baseModel, 'full');

    expect(queryByLabelText(/Batteria/i)).toBeNull();
    expect(queryByLabelText(/Connessione/i)).toBeNull();
    expect(queryByText(/^(ND|n\/d)$/i)).toBeNull();
  });

  it('shows the real battery, door and auto-lock values in the expanded card', () => {
    const { getByLabelText, getByText } = renderCard(
      { ...baseModel, batteryLevel: 82, doorState: 'closed', autoLock: { enabled: true, delaySeconds: 30 } },
      'full',
    );

    expect(getByLabelText('Batteria 82%')).toBeTruthy();
    expect(getByText('Porta')).toBeTruthy();
    expect(getByText('Chiusa')).toBeTruthy();
    expect(getByText('Dopo 30 s')).toBeTruthy();
  });

  it('names the two-stage gesture on the ring when the lock has a latch', () => {
    const { getByRole } = renderCard({ ...baseModel, supportsOpen: true, canOpenLatch: true }, 'standard');

    expect(getByRole('button', { name: /Tieni premuto per sbloccare Porta ingresso, continua per aprire la porta/ })).toBeTruthy();
  });

  it('asks to keep holding during the second lap', () => {
    const { getByText } = renderCard(
      { ...baseModel, supportsOpen: true, canOpenLatch: true },
      'mini',
      { ...idleRing, stage: 'open', isPressing: true, lap1: 1, lap2: 0.4 },
    );

    expect(getByText('Continua per aprire')).toBeTruthy();
  });
});

describe('buildLockCardModel ring data', () => {
  const widget = { id: 'lock-1', kind: 'lock', title: 'Porta', entityId: 'lock.porta', layout: { x: 0, y: 0, w: 2, h: 2 } } as unknown as Widget;

  it('reads battery, door and auto-lock from the entity attributes', () => {
    const model = buildLockCardModel(widget, {
      state: 'unlocked',
      supportedFeatures: 1,
      rawAttributes: { battery_level: 64, door_sensor_state_name: 'door closed', auto_relock_time: 30 },
    });

    expect(model.canOpenLatch).toBe(true);
    expect(model.batteryLevel).toBe(64);
    expect(model.doorState).toBe('closed');
    expect(model.autoLock).toEqual({ enabled: true, delaySeconds: 30 });
    expect(model.ringIcon).toBe('unlock');
    expect(model.solidCore).toBe(false);
  });

  it('leaves the details out when the entity does not report them', () => {
    const model = buildLockCardModel(widget, { state: 'locked' });

    expect(model.batteryLevel).toBeUndefined();
    expect(model.doorState).toBeUndefined();
    expect(model.autoLock).toBeUndefined();
    expect(model.canOpenLatch).toBe(false);
    expect(model.solidCore).toBe(true);
  });
});
