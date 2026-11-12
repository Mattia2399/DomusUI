import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GlassTiles, type GlassTileOption } from './GlassTiles';

afterEach(cleanup);

type Mode = 'away' | 'home' | 'night' | 'vacation';
const MODES: readonly GlassTileOption<Mode>[] = [
  { value: 'away', label: 'Fuori casa', note: 'Tutti i sensori e i movimenti', icon: <span /> },
  { value: 'home', label: 'In casa', note: 'Solo porte e finestre', icon: <span /> },
  { value: 'night', label: 'Notte', note: 'Porte, finestre e piano terra', icon: <span /> },
  { value: 'vacation', label: 'Vacanza', note: 'Come Fuori casa, più luci di presenza', icon: <span /> },
];

function Choice() {
  const [mode, setMode] = useState<Mode>('away');
  return <GlassTiles<Mode> size="choice" ariaLabel="Modalità" options={MODES} value={mode} onChange={setMode} />;
}

describe('GlassTiles, the choices of a sheet', () => {
  it('is one radio group of separate tiles, each with its note', () => {
    render(<Choice />);
    const group = screen.getByRole('radiogroup', { name: 'Modalità' });
    expect(group.className).toContain('is-choice');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByText('Come Fuori casa, più luci di presenza')).toBeTruthy();
  });

  it('marks the chosen one with ✓, and only that one', () => {
    render(<Choice />);
    const away = screen.getByRole('radio', { name: /^Fuori casa/ });
    expect(away.getAttribute('aria-checked')).toBe('true');
    expect(away.querySelector('.glass-tile-check')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /^In casa/ }).querySelector('.glass-tile-check')).toBeNull();
  });

  it('reaches every choice with the arrows, with one stop for Tab', () => {
    render(<Choice />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1]);

    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: 'ArrowDown' });
    const home = screen.getByRole('radio', { name: /^In casa/ });
    expect(home.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(home);

    fireEvent.keyDown(home, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^Vacanza/ }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^Fuori casa/ }));
  });

  it('leaves the tiles of the panels as they are', () => {
    render(<GlassTiles ariaLabel="Modo" options={MODES} value="away" onChange={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Modo' });
    expect(group.className).not.toContain('is-choice');
    expect(screen.queryByText('Tutti i sensori e i movimenti')).toBeNull();
    expect(document.querySelector('.glass-tile-check')).toBeNull();
  });
});
