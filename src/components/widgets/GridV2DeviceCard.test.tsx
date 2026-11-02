import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import { accessFor } from '../../test/accessFixtures';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { WidgetCardRenderer } from './CardRenderer';
import { resolveGridV2BoxFormat } from './cardCapabilityRegistry';

/*
 * On a Home with the v2 metrics the device cards are the cards of a room, in
 * the format of their box, and their actions reach the callbacks the Home
 * already had (docs/home-cards-grid-engine-2.md §7).
 */

function renderCard(ui: React.ReactElement) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  return render(
    <I18nProvider>
      <AccessControlProvider access={accessFor('admin')}>{ui}</AccessControlProvider>
    </I18nProvider>,
  );
}

// The room cards load on demand: a busy parallel run needs more than the default second.
const LAZY = { timeout: 10_000 };

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const climate: Widget = {
  id: 'climate.living',
  kind: 'climate',
  title: 'Clima Soggiorno',
  entityId: 'climate.living',
  status: 'heat',
  isOn: true,
  layout: { i: 'climate.living', x: 0, y: 0, w: 4, h: 4 },
};
const climateEntity = {
  state: 'heat',
  rawAttributes: {
    friendly_name: 'Climatizzatore',
    hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
    current_temperature: 20.5,
    temperature: 22,
    target_temp_step: 0.5,
  },
} as MockEntityState;

describe('Home cards with the v2 metrics', () => {
  it('reads the size from the box: the widest class whose sizes fit, then the tallest of them', () => {
    expect(resolveGridV2BoxFormat({ kind: 'climate', breakpoint: 'xl', width: 4, height: 4 })).toBe('W×4');
    expect(resolveGridV2BoxFormat({ kind: 'climate', breakpoint: 'xl', width: 8, height: 5 })).toBe('X×4');
    expect(resolveGridV2BoxFormat({ kind: 'camera', breakpoint: 'xs', width: 2, height: 4 })).toBe('W×4');
    // A wide but low box is a Mini, never a card taller than its box.
    expect(resolveGridV2BoxFormat({ kind: 'switch', breakpoint: 'xl', width: 8, height: 2 })).toBe('W×2');
    expect(resolveGridV2BoxFormat({ kind: 'sensor', breakpoint: 'xl', width: 2, height: 4 })).toBe('U×4');
    expect(resolveGridV2BoxFormat({ kind: 'light', breakpoint: 'xl', width: 2, height: 3 })).toBe('U×3');
  });

  it('draws the room climate card and sends − and + to the existing target callback', async () => {
    const onClimateTargetTempChange = vi.fn();
    renderCard(
      <WidgetCardRenderer
        widget={climate}
        dashboardState={{} as never}
        isEditMode={false}
        isSelected={false}
        onClick={vi.fn()}
        liveEntity={climateEntity}
        gridBreakpoint="xl"
        gridMetricsVersion="v2"
        onClimateTargetTempChange={onClimateTargetTempChange}
      />,
    );
    const card = await screen.findByTestId('climate-card', {}, LAZY);
    expect(card.getAttribute('data-format')).toBe('W×4');
    expect(card.textContent).toContain('Clima Soggiorno');
    fireEvent.click(screen.getByRole('button', { name: /alza/i }));
    expect(onClimateTargetTempChange).toHaveBeenCalledWith(climate, 22.5);
  });

  it('keeps the legacy Home card without the v2 metrics', () => {
    renderCard(
      <WidgetCardRenderer
        widget={climate}
        dashboardState={{} as never}
        isEditMode={false}
        isSelected={false}
        onClick={vi.fn()}
        liveEntity={climateEntity}
        gridBreakpoint="xl"
      />,
    );
    expect(screen.queryByTestId('climate-card')).toBeNull();
  });

  it('sends nothing while the Home is being edited, and the card selects instead', async () => {
    const onClick = vi.fn();
    const onClimateTargetTempChange = vi.fn();
    const { container } = renderCard(
      <WidgetCardRenderer
        widget={climate}
        dashboardState={{} as never}
        isEditMode
        isSelected
        onClick={onClick}
        liveEntity={climateEntity}
        gridBreakpoint="xl"
        gridMetricsVersion="v2"
        onClimateTargetTempChange={onClimateTargetTempChange}
      />,
    );
    await screen.findByTestId('climate-card', {}, LAZY);
    fireEvent.click(container.querySelector('.dv-tile-body')!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClimateTargetTempChange).not.toHaveBeenCalled();
  });

  it('keeps the Home card for an entity the room cards do not know', async () => {
    const sensor: Widget = {
      id: 'sensor.unknown',
      kind: 'sensor',
      title: 'Contatore',
      entityId: 'counter.visits',
      status: '4',
      isOn: false,
      value: 4,
      layout: { i: 'sensor.unknown', x: 0, y: 0, w: 2, h: 3 },
    };
    const { container } = renderCard(
      <WidgetCardRenderer
        widget={sensor}
        dashboardState={{} as never}
        isEditMode={false}
        isSelected={false}
        onClick={vi.fn()}
        liveEntity={{ state: '4', rawAttributes: { friendly_name: 'Contatore' } } as MockEntityState}
        gridBreakpoint="xl"
        gridMetricsVersion="v2"
      />,
    );
    await vi.waitFor(() => expect(container.textContent).toContain('Contatore'), LAZY);
    expect(container.querySelector('.dv-sensor')).toBeNull();
  });
});
