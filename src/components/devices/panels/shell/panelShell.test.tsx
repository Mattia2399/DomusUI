import { useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../../../i18n/I18nProvider';
import { COMMAND_TIMEOUT_MS } from '../panelLiveState';
import {
  PANEL_COMMAND_LIMIT_MS,
  PanelControlZone,
  PanelFooter,
  PanelGroups,
  PanelHeader,
  PanelHero,
  PanelShell,
  PanelStates,
  usePanelScreen,
  type PanelShortcutItem,
  type PanelStateValue,
} from './index';

const css = readFileSync(resolve(process.cwd(), 'src/components/devices/panels/shell/panelShell.css'), 'utf8');
const accent = { color: '#ff9f0a', ink: '#2a1a00', rgb: '255 159 10' };

const shell = (surface: 'sheet' | 'column' | 'dialog', tint?: boolean) => (
  <PanelShell
    surface={surface}
    accent={accent}
    tint={tint}
    header={<PanelHeader icon={<svg />} name="Lampada" status="Accesa" closeLabel="Chiudi" onClose={vi.fn()} />}
    hero={<PanelHero>hero</PanelHero>}
    footer={<PanelFooter action={{ kind: 'power', label: 'Spegni', onPress: vi.fn() }} />}
  />
);

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('PanelShell', () => {
  it('looks as the surface it is given, whatever its width', () => {
    (['sheet', 'column', 'dialog'] as const).forEach((surface) => {
      const { container, unmount } = render(shell(surface));
      expect(container.querySelector('.panel-shell')?.getAttribute('data-surface')).toBe(surface);
      unmount();
    });
  });

  it('has a handle only as a sheet', () => {
    const { container, rerender } = render(shell('sheet'));
    expect(container.querySelector('.panel-shell-handle')).toBeTruthy();
    rerender(shell('dialog'));
    expect(container.querySelector('.panel-shell-handle')).toBeNull();
  });

  it('takes the handle of whoever hosts it', () => {
    const { container } = render(
      <PanelShell surface="sheet" handle={<span data-testid="drag" />} header={null} hero={null} />,
    );
    expect(screen.getByTestId('drag')).toBeTruthy();
    expect(container.querySelector('.panel-shell-handle')).toBeNull();
  });

  it('passes the colour of the device, and tints a sheet and a dialog but never the column', () => {
    const { container, rerender } = render(shell('sheet'));
    const root = () => container.querySelector<HTMLElement>('.panel-shell')!;
    expect(root().style.getPropertyValue('--device-accent')).toBe('#ff9f0a');
    expect(root().style.getPropertyValue('--device-accent-ink')).toBe('#2a1a00');
    expect(root().className).toContain('is-tinted');
    rerender(shell('dialog'));
    expect(root().className).toContain('is-tinted');
    rerender(shell('column'));
    expect(root().className).not.toContain('is-tinted');
    expect(root().style.getPropertyValue('--device-accent')).toBe('#ff9f0a');
    rerender(shell('sheet', false));
    expect(root().className).not.toContain('is-tinted');
  });

  it('builds its layout on the tokens and changes columns only by width', () => {
    expect(css).toContain('container: panel-shell / inline-size');
    expect(css).toContain('@container panel-shell (min-width: 521px)');
    expect(css).toContain('height: var(--panel-controls-height)');
    expect(css).toContain('height: var(--panel-sheet-height)');
    expect(css).toContain('  height: var(--panel-footer-height)');
    // The tint is written where the colour is set: a variable would keep the colour of the page.
    expect(css).toContain('background-image: linear-gradient(rgb(var(--device-accent-rgb)');
  });
});

describe('PanelHeader', () => {
  it('says the name and the state, and closes', () => {
    const onClose = vi.fn();
    render(<PanelHeader icon={<svg />} name="Lampada" status="Accesa · 40%" closeLabel="Chiudi" onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Lampada' })).toBeTruthy();
    expect(screen.getByText('Accesa · 40%').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PanelControlZone', () => {
  const opensAndActs = (onPress = vi.fn()): PanelShortcutItem[] => [
    { key: 'color', kind: 'opens', icon: <svg />, label: 'Colore', content: <p>I colori</p> },
    { key: 'protect', kind: 'acts', icon: <svg />, label: 'Protetta', on: true, onPress },
  ];

  function Host({ shortcuts, owner = 'light.a' }: { shortcuts: PanelShortcutItem[]; owner?: string }) {
    const { open, onOpen, close } = usePanelScreen(owner, shortcuts);
    return (
      <>
        <PanelControlZone ariaLabel="Regolazioni" shortcuts={shortcuts} open={open} onOpen={onOpen} />
        {open ? <button onClick={close}>Indietro</button> : null}
      </>
    );
  }

  it('shows the shortcuts, or the controls of the one open in their place', () => {
    render(<Host shortcuts={opensAndActs()} />);
    expect(screen.getByRole('group', { name: 'Regolazioni' })).toBeTruthy();
    expect(screen.queryByText('I colori')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Colore' }));
    expect(screen.getByText('I colori')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Regolazioni' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('group', { name: 'Regolazioni' })).toBeTruthy();
  });

  it('runs at once what acts at once, and shows it on', () => {
    const onPress = vi.fn();
    render(<Host shortcuts={opensAndActs(onPress)} />);
    const button = screen.getByRole('button', { name: 'Protetta' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Regolazioni' })).toBeTruthy();
  });

  it('forgets the open screen when the panel moves to another device, or the shortcut goes', () => {
    const items = opensAndActs();
    const { result, rerender } = renderHook(({ owner, shortcuts }) => usePanelScreen(owner, shortcuts), { initialProps: { owner: 'a', shortcuts: items } });
    act(() => result.current.onOpen('color'));
    expect(result.current.open).toBe('color');
    rerender({ owner: 'b', shortcuts: items });
    expect(result.current.open).toBeNull();
    rerender({ owner: 'a', shortcuts: items });
    expect(result.current.open).toBe('color');
    rerender({ owner: 'a', shortcuts: items.slice(1) });
    expect(result.current.open).toBeNull();
  });

  it('holds controls always in view, with no shortcuts', () => {
    render(<PanelControlZone ariaLabel="R"><p>Aperta, Metà, Chiusa</p></PanelControlZone>);
    expect(screen.getByText('Aperta, Metà, Chiusa')).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('blocks its shortcuts when the device does not answer', () => {
    render(<PanelControlZone ariaLabel="R" shortcuts={opensAndActs()} disabled />);
    expect((screen.getByRole('button', { name: 'Colore' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PanelFooter', () => {
  it('has the power, which can say Stop or Play, or nothing', () => {
    const onPress = vi.fn();
    const { container, rerender } = render(<PanelFooter action={{ kind: 'power', on: true, label: 'Spegni', onPress }} />);
    const power = screen.getByRole('button', { name: 'Spegni' });
    expect(power.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(power);
    expect(onPress).toHaveBeenCalled();
    rerender(<PanelFooter action={{ kind: 'stop', label: 'Ferma', onPress }} />);
    expect(screen.getByRole('button', { name: 'Ferma' }).className).toContain('is-stop');
    expect(screen.getByRole('button', { name: 'Ferma' }).getAttribute('aria-pressed')).toBeNull();
    rerender(<PanelFooter action={{ kind: 'play', label: 'Avvia', onPress }} />);
    expect(screen.getByRole('button', { name: 'Avvia' }).className).toContain('is-play');
    rerender(<PanelFooter />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.panel-footer')).toBeTruthy();
  });

  it('has Back only on the screen of a shortcut', () => {
    const onPress = vi.fn();
    const { rerender } = render(<PanelFooter action={{ kind: 'power', label: 'Spegni', onPress: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Indietro' })).toBeNull();
    rerender(<PanelFooter action={{ kind: 'power', label: 'Spegni', onPress: vi.fn() }} back={{ label: 'Indietro', onPress }} />);
    const back = screen.getByRole('button', { name: 'Indietro' });
    expect(back.getAttribute('aria-pressed')).toBeNull();
    expect(back.getAttribute('aria-expanded')).toBeNull();
    fireEvent.click(back);
    expect(onPress).toHaveBeenCalled();
  });

  it('blocks the action when it cannot run', () => {
    render(<PanelFooter action={{ kind: 'power', label: 'Spegni', onPress: vi.fn(), pending: true }} />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('PanelGroups', () => {
  it('names each group, with its value and its controls', () => {
    render(<PanelGroups groups={[{ key: 'color', icon: <svg />, title: 'Colore', value: 'Blu', children: <p>Il disco</p> }, { key: 'timer', title: 'Timer' }]} />);
    const group = screen.getByRole('region', { name: 'Colore' });
    expect(group.textContent).toContain('Blu');
    expect(group.textContent).toContain('Il disco');
    expect(screen.getByRole('region', { name: 'Timer' })).toBeTruthy();
  });
});

describe('PanelStates', () => {
  const states = (state: PanelStateValue) => (
    <I18nProvider>
      <PanelStates state={state} />
    </I18nProvider>
  );

  it('has the same limit as the panels of today', () => {
    expect(PANEL_COMMAND_LIMIT_MS).toBe(COMMAND_TIMEOUT_MS);
    expect(PANEL_COMMAND_LIMIT_MS).toBe(10_000);
  });

  it('says nothing when all is well', () => {
    const { container } = render(states({ kind: 'none' }));
    expect(container.querySelector('.panel-state')).toBeNull();
  });

  it('says a device does not answer, what it last said, and offers to try again', () => {
    const onRetry = vi.fn();
    render(states({ kind: 'unavailable', since: '12 min', lastKnown: { state: 'on', time: '10:30' }, onRetry, homeAssistantHref: 'https://ha/history' }));
    expect(screen.getByRole('status').textContent).toContain('Non risponde da 12 min.');
    expect(screen.getByRole('status').textContent).toContain('10:30');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Apri in Home Assistant' }).getAttribute('href')).toBe('https://ha/history');
  });

  it('says its data are old, and blames the battery only when it is low', () => {
    const { rerender } = render(states({ kind: 'stale', since: '3 h', lastAt: '07:00', battery: 12 }));
    expect(screen.getByRole('status').textContent).toContain('Non invia dati da 3 h.');
    expect(screen.getByRole('status').textContent).toContain('12%');
    rerender(states({ kind: 'stale', since: '3 h', lastAt: '07:00' }));
    expect(screen.getByRole('status').textContent).not.toContain('batteria');
  });

  it('waits ten seconds for a command, then says the device has not answered', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    render(states({ kind: 'pending', startedAt }));
    expect(screen.getByRole('status').textContent).toContain('Comando inviato');
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.getByRole('status').textContent).toContain('Comando inviato');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('alert').textContent).toContain('non ha risposto');
  });

  it('starts the wait over for a new command', () => {
    vi.useFakeTimers();
    function Host() {
      const [startedAt, setStartedAt] = useState(() => Date.now());
      return (
        <>
          <button onClick={() => setStartedAt(Date.now())}>Di nuovo</button>
          {states({ kind: 'pending', startedAt })}
        </>
      );
    }
    render(<Host />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Di nuovo' }));
    expect(screen.getByRole('status').textContent).toContain('Comando inviato');
  });
});
