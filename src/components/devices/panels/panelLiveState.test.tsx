// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockEntityState } from '../../../types/ha';
import { PanelHeader } from './shell/PanelHeader';
import { PanelShell } from './shell/PanelShell';
import { COMMAND_TIMEOUT_MS, isEntityAway, staleAfterMs, usePanelLiveState, type PanelLiveInput } from './panelLiveState';
import { PanelServicesProvider } from './panelServicesContext';

const HOUR = 3_600_000;

vi.mock('../../../services/haLive', () => ({ loadHassAuthTokensFromStorage: async () => ({ hassUrl: 'https://casa.test/' }) }));

const entity = (state: string, attributes: Record<string, unknown> = {}) => ({ state, rawAttributes: attributes }) as unknown as MockEntityState;

function Panel(input: PanelLiveInput) {
  const { off, notice, stale } = usePanelLiveState(input);
  return (
    <PanelShell off={off} states={notice} className={stale ? 'is-stale-panel' : undefined} header={<PanelHeader name="Lampada" status="" closeLabel="Chiudi" onClose={vi.fn()} />}>
      <button type="button">Controllo</button>
    </PanelShell>
  );
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-02T20:00:00Z') }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the device does not answer', () => {
  it('turns the controls off and says for how long', () => {
    const changed = new Date(Date.now() - 20 * 60_000).toISOString();
    render(<Panel entityId="light.a" entity={entity('unavailable', { __last_changed: changed })} />);
    expect(screen.getByText('Non risponde da 20 min.')).toBeTruthy();
    expect(document.querySelector('.panel-shell.is-off')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Controllo' }).closest('[inert]')).toBeTruthy();
  });

  it('tells a device that is there from one that is not', () => {
    expect(isEntityAway(entity('on'))).toBe(false);
    expect(isEntityAway(entity('unavailable'))).toBe(true);
    expect(isEntityAway(entity('unknown'))).toBe(true);
    expect(isEntityAway(entity('unknown'), false)).toBe(false);
    expect(isEntityAway(entity('unavailable'), false)).toBe(true);
    render(<Panel entityId="light.a" entity={entity('on')} />);
    expect(document.querySelector('.panel-shell.is-off')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('offers to try again, reads the last known state and opens Home Assistant', async () => {
    const callApi = vi.fn().mockResolvedValue({ 'light.a': [{ s: 'on', lu: (Date.now() - HOUR) / 1000 }, { s: 'unavailable', lu: (Date.now() - 60_000) / 1000 }] });
    const callService = vi.fn().mockResolvedValue(true);
    render(
      <PanelServicesProvider value={{ callApi: callApi as never, callService }}>
        <Panel entityId="light.a" entity={entity('unavailable')} />
      </PanelServicesProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Ultimo stato noto: on/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(callService).toHaveBeenCalledWith('homeassistant', 'update_entity', { entity_id: 'light.a' });
    expect(screen.getByRole('link', { name: 'Apri in Home Assistant' }).getAttribute('href')).toBe('https://casa.test/history?entity_id=light.a');
  });

  it('has no buttons when there is nothing to call', () => {
    render(<Panel entityId={null} entity={undefined} away />);
    expect(screen.getByText('Non risponde.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('old data', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('has a limit for each family, shorter on a battery', () => {
    expect(staleAfterMs('temperature', true)).toBe(2 * HOUR);
    expect(staleAfterMs('temperature', false)).toBe(6 * HOUR);
    for (const family of ['opening', 'motion', 'safety', 'device', 'state', 'time', 'price', 'water', 'battery'] as const) {
      expect(staleAfterMs(family, true), family).toBeNull();
    }
    expect(staleAfterMs(null, true)).toBeNull();
  });

  it('says it with the time and the probable cause', () => {
    render(<Panel entityId="sensor.t" entity={entity('20', { __last_updated: ago(3 * HOUR) })} family="temperature" battery={12} />);
    expect(screen.getByText('Non invia dati da 3 h.')).toBeTruthy();
    expect(screen.getByText(/La batteria è al 12%/)).toBeTruthy();
    expect(document.querySelector('.is-stale-panel')).toBeTruthy();
  });

  it('stays quiet before the limit, and without a battery waits longer', () => {
    render(<Panel entityId="sensor.t" entity={entity('20', { __last_updated: ago(HOUR) })} family="temperature" battery={80} />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    render(<Panel entityId="sensor.t" entity={entity('20', { __last_updated: ago(3 * HOUR) })} family="temperature" />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    render(<Panel entityId="sensor.t" entity={entity('20', { __last_updated: ago(7 * HOUR) })} family="temperature" />);
    expect(screen.getByText(/Controlla che sia alimentato/)).toBeTruthy();
  });
});

describe('a command under way', () => {
  const waiting = entity('off', { __dashboard_command_phase: 'awaiting_confirmation' });

  it('shows the wait, and says when the device has not answered after 10 seconds', () => {
    render(<Panel entityId="light.a" entity={waiting} />);
    expect(screen.getByText('Comando inviato')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(COMMAND_TIMEOUT_MS - 1);
    });
    expect(screen.getByText('Comando inviato')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Comando inviato')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/Il dispositivo non ha risposto\. Riprova/);
  });

  it('is quiet when the device obeys', () => {
    const { rerender } = render(<Panel entityId="light.a" entity={waiting} />);
    rerender(<Panel entityId="light.a" entity={entity('on')} />);
    expect(screen.queryByText('Comando inviato')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(COMMAND_TIMEOUT_MS + 1000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says it also when the Home gives up first and nothing has moved', () => {
    const { rerender } = render(<Panel entityId="light.a" entity={waiting} />);
    rerender(<Panel entityId="light.a" entity={entity('off')} />);
    expect(screen.getByRole('alert').textContent).toMatch(/non ha risposto/);
  });

  it('clears the error when a new command starts', () => {
    const { rerender } = render(<Panel entityId="light.a" entity={waiting} />);
    rerender(<Panel entityId="light.a" entity={entity('off')} />);
    rerender(<Panel entityId="light.a" entity={waiting} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Comando inviato')).toBeTruthy();
  });
});
