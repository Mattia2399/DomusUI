import { useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../../../i18n/I18nProvider';
import { COMMAND_TIMEOUT_MS } from '../panelLiveState';
import {
  PANEL_COMMAND_LIMIT_MS,
  PanelGroups,
  PanelHeader,
  PanelHero,
  PanelNavBar,
  PanelPage,
  PanelShell,
  PanelStates,
  usePanelNav,
  type PanelStateValue,
} from './index';

const css = readFileSync(resolve(process.cwd(), 'src/components/devices/panels/shell/panelShell.css'), 'utf8');
const accent = { color: '#ff9f0a', ink: '#2a1a00', rgb: '255 159 10' };

const shell = (surface: 'sheet' | 'column' | 'dialog', tint?: boolean) => (
  <PanelShell
    surface={surface}
    accent={accent}
    tint={tint}
    header={<PanelHeader action={{ kind: 'power', label: 'Spegni', onPress: vi.fn() }} name="Lampada" status="Accesa" closeLabel="Chiudi" onClose={vi.fn()} />}
    hero={<PanelHero>hero</PanelHero>}
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
    expect(css).toContain('height: var(--panel-sheet-height)');
    expect(css).toContain('height: var(--panel-head-control-size)');
    // The tint is written where the colour is set: a variable would keep the colour of the page.
    expect(css).toContain('background-image: linear-gradient(rgb(var(--device-accent-rgb)');
  });
});

describe('PanelHeader', () => {
  it('says the name and the state, and closes', () => {
    const onClose = vi.fn();
    render(<PanelHeader name="Lampada" status="Accesa · 40%" closeLabel="Chiudi" onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Lampada' })).toBeTruthy();
    expect(screen.getByText('Accesa · 40%').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('has the power at its left, which can say Stop, Play or +, or nothing', () => {
    const onPress = vi.fn();
    const props = { name: 'Lampada', status: '', closeLabel: 'Chiudi', onClose: vi.fn() };
    const { rerender } = render(<PanelHeader {...props} action={{ kind: 'power', on: true, label: 'Spegni', onPress }} />);
    const power = screen.getByRole('button', { name: 'Spegni' });
    expect(power.getAttribute('aria-pressed')).toBe('true');
    expect(power.className).toContain('is-on');
    fireEvent.click(power);
    expect(onPress).toHaveBeenCalled();
    rerender(<PanelHeader {...props} action={{ kind: 'stop', label: 'Ferma', onPress }} />);
    expect(screen.getByRole('button', { name: 'Ferma' }).className).toContain('is-stop');
    expect(screen.getByRole('button', { name: 'Ferma' }).getAttribute('aria-pressed')).toBeNull();
    rerender(<PanelHeader {...props} action={{ kind: 'add', label: 'Nuovo', onPress }} />);
    expect(screen.getByRole('button', { name: 'Nuovo' }).className).toContain('is-add');
    rerender(<PanelHeader {...props} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('blocks the action when it cannot run', () => {
    render(<PanelHeader name="L" status="" closeLabel="Chiudi" onClose={vi.fn()} action={{ kind: 'power', label: 'Spegni', onPress: vi.fn(), pending: true }} />);
    const button = screen.getByRole('button', { name: 'Spegni' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('PanelHero', () => {
  it('has the pill that goes back only when it is given, and what stands under it', () => {
    const onPress = vi.fn();
    const { rerender } = render(<PanelHero>il protagonista</PanelHero>);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<PanelHero back={{ label: 'Luminosità 72%', onPress }} below={<p>Aperta</p>}>il colore</PanelHero>);
    fireEvent.click(screen.getByRole('button', { name: 'Luminosità 72%' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('Aperta')).toBeTruthy();
  });
});

describe('PanelNavBar', () => {
  it('is not there without shortcuts, and has few of them spaced out', () => {
    const { container, rerender } = render(<PanelNavBar ariaLabel="Controlli" items={[]} />);
    expect(container.querySelector('nav')).toBeNull();
    const item = { key: 'a', kind: 'action' as const, icon: <svg />, label: 'A', onPress: vi.fn() };
    rerender(<PanelNavBar ariaLabel="Controlli" items={[item, { ...item, key: 'b', label: 'B' }]} />);
    expect(screen.getByRole('navigation', { name: 'Controlli' }).className).toContain('is-few');
    rerender(<PanelNavBar ariaLabel="Controlli" items={['a', 'b', 'c'].map((key) => ({ ...item, key, label: key }))} />);
    expect(screen.getByRole('navigation', { name: 'Controlli' }).className).not.toContain('is-few');
  });

  it('tells where you are from what is on', () => {
    const item = { key: 'a', kind: 'control' as const, icon: <svg />, label: 'Timer', onPress: vi.fn() };
    render(<PanelNavBar ariaLabel="C" items={[{ ...item, selected: true }, { ...item, key: 'b', label: 'Effetti', lit: true }]} />);
    expect(screen.getByRole('button', { name: 'Timer' }).className).toContain('is-selected');
    expect(screen.getByRole('button', { name: 'Effetti' }).className).toContain('is-on');
    expect(screen.getByRole('button', { name: 'Effetti' }).className).not.toContain('is-selected');
  });
});

describe('usePanelNav', () => {
  it('goes back when the same is touched again', () => {
    const { result } = renderHook(() => usePanelNav('a', ['color', 'timer']));
    act(() => result.current.toggle('color'));
    expect(result.current.open).toBe('color');
    act(() => result.current.toggle('timer'));
    expect(result.current.open).toBe('timer');
    act(() => result.current.toggle('timer'));
    expect(result.current.open).toBeNull();
  });

  it('goes back one step, to the list it was opened from', () => {
    const { result } = renderHook(() => usePanelNav('a', ['more', 'info']));
    act(() => result.current.toggle('more'));
    act(() => result.current.toggle('info', 'more'));
    act(() => result.current.back());
    expect(result.current.open).toBe('more');
    act(() => result.current.back());
    expect(result.current.open).toBeNull();
  });

  it('forgets what is open when the panel moves to another device, or the shortcut goes', () => {
    const { result, rerender } = renderHook(({ owner, keys }) => usePanelNav(owner, keys), { initialProps: { owner: 'a', keys: ['color', 'timer'] } });
    act(() => result.current.toggle('color'));
    rerender({ owner: 'b', keys: ['color', 'timer'] });
    expect(result.current.open).toBeNull();
    rerender({ owner: 'a', keys: ['color', 'timer'] });
    expect(result.current.open).toBe('color');
    rerender({ owner: 'a', keys: ['timer'] });
    expect(result.current.open).toBeNull();
  });
});

describe('PanelPage', () => {
  it('has its title, what it is set to, and goes back', () => {
    const onBack = vi.fn();
    render(
      <PanelPage title="Effetti" sub="Nessuno" backLabel="Indietro" onBack={onBack}>
        <p>Arcobaleno</p>
      </PanelPage>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Effetti' })).toBeTruthy();
    expect(screen.getByText('Nessuno')).toBeTruthy();
    expect(screen.getByText('Arcobaleno')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onBack).toHaveBeenCalled();
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
