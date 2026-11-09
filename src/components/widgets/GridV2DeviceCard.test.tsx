import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import { accessFor } from '../../test/accessFixtures';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { WidgetCardRenderer } from './CardRenderer';
import { resolveGridV2BoxFormat } from './cardCapabilityRegistry';
import { DeviceExtrasProvider } from '../devices/cards/deviceExtrasContext';

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

  describe('as in Rooms', () => {
    const light: Widget = {
      id: 'light.sala',
      kind: 'light',
      title: 'Faretti',
      entityId: 'light.sala',
      status: 'on',
      isOn: true,
      layout: { i: 'light.sala', x: 0, y: 0, w: 2, h: 4 },
    };
    const liveLight = { state: 'on', rawAttributes: { friendly_name: 'Faretti', brightness: 128, supported_color_modes: ['brightness'], color_mode: 'brightness' } } as unknown as MockEntityState;
    const plug: Widget = { ...light, id: 'switch.lampada', kind: 'switch', title: 'Lampada', entityId: 'switch.lampada', layout: { i: 'switch.lampada', x: 0, y: 0, w: 2, h: 4 } };
    const livePlug = { state: 'on', rawAttributes: { friendly_name: 'Lampada' } } as unknown as MockEntityState;

    const card = (widget: Widget, liveEntity: MockEntityState) => {
      const callbacks = { onClick: vi.fn(), onOpenPanel: vi.fn(), onToggleOnly: vi.fn(), onSwitchToggle: vi.fn() };
      const view = renderCard(
        <WidgetCardRenderer widget={widget} dashboardState={{} as never} isEditMode={false} isSelected={false} isInteractive liveEntity={liveEntity} gridBreakpoint="xl" gridMetricsVersion="v2" {...callbacks} />,
      );
      return { ...callbacks, view };
    };

    it('the icon of a light only toggles it, and its surface only opens the panel', async () => {
      const { onOpenPanel, onToggleOnly, onClick, onSwitchToggle, view } = card(light, liveLight);
      const icon = await screen.findByRole('button', { name: 'Spegni Faretti' }, LAZY);
      fireEvent.click(icon);
      expect(onToggleOnly).toHaveBeenCalledWith(light);
      expect(onOpenPanel).not.toHaveBeenCalled();
      fireEvent.click(view.container.querySelector('.dv-tile-body')!);
      expect(onOpenPanel).toHaveBeenCalledTimes(1);
      expect(onToggleOnly).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
      expect(onSwitchToggle).not.toHaveBeenCalled();
    });

    it('a plug opens its panel from the surface and commands from the icon, as in Rooms', async () => {
      const { onOpenPanel, onToggleOnly, view } = card(plug, livePlug);
      await waitFor(() => expect(view.container.querySelector('.dv-tile-body')).toBeTruthy(), LAZY);
      fireEvent.click(view.container.querySelector('.dv-tile-body')!);
      expect(onOpenPanel).toHaveBeenCalledTimes(1);
      expect(onToggleOnly).not.toHaveBeenCalled();
    }, 15_000);

    it('a virtual switch, with nothing to show in a panel, toggles from its surface too', async () => {
      const virtual: Widget = { ...plug, id: 'input_boolean.ospiti', entityId: 'input_boolean.ospiti' };
      const { onOpenPanel, onToggleOnly, view } = card(virtual, livePlug);
      await waitFor(() => expect(view.container.querySelector('.dv-tile-body')).toBeTruthy(), LAZY);
      fireEvent.click(view.container.querySelector('.dv-tile-body')!);
      expect(onToggleOnly).toHaveBeenCalledWith(virtual);
      expect(onOpenPanel).not.toHaveBeenCalled();
    }, 15_000);

    it('a protected plug asks before turning off, and shows what it draws', async () => {
      const guardTurnOff = vi.fn();
      const extras = {
        wattsOf: () => 42,
        isProtected: () => true,
        canProtect: true,
        setProtected: vi.fn(),
        guardTurnOff,
        timers: {},
        timerNow: 0,
        timersAvailable: false,
        timerDomains: new Set(['switch', 'fan', 'humidifier']),
        setTimer: vi.fn(),
      };
      const onToggleOnly = vi.fn();
      renderCard(
        <DeviceExtrasProvider value={extras}>
          <WidgetCardRenderer widget={plug} dashboardState={{} as never} isEditMode={false} isSelected={false} isInteractive liveEntity={livePlug} gridBreakpoint="xl" gridMetricsVersion="v2" onClick={vi.fn()} onOpenPanel={vi.fn()} onToggleOnly={onToggleOnly} />
        </DeviceExtrasProvider>,
      );
      const [turnOff] = await screen.findAllByLabelText(/^Spegni Lampada/, undefined, LAZY);
      fireEvent.click(turnOff);
      expect(guardTurnOff).toHaveBeenCalledWith('switch.lampada', 'Lampada', expect.any(Function));
      expect(onToggleOnly).not.toHaveBeenCalled();
      expect(screen.getByText(/42/)).toBeTruthy();
    }, 15_000);
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
