import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShieldCheck } from 'lucide-react';
import { GlassList } from './GlassList';
import { GlassListRow } from './GlassListRow';

afterEach(cleanup);

describe('GlassList', () => {
  it('puts the rows in one block of glass, under the title of the section', () => {
    render(
      <GlassList title="Porte e finestre" detail="tutte chiuse">
        <GlassListRow title="Ingresso" note="Porta" opens onPress={vi.fn()} />
        <GlassListRow title="Cucina" note="Finestra" opens onPress={vi.fn()} />
      </GlassList>,
    );
    const section = screen.getByRole('region', { name: 'Porte e finestre' });
    expect(screen.getByRole('heading', { level: 2, name: 'Porte e finestre' })).toBeTruthy();
    expect(screen.getByText('tutte chiuse')).toBeTruthy();
    const block = section.querySelector('.glass-list.page-glass')!;
    expect(block.querySelectorAll(':scope > .glass-list-row')).toHaveLength(2);
  });

  it('opens the whole list from "Tutte ›"', () => {
    const onPress = vi.fn();
    render(
      <GlassList title="Eventi" more={{ label: 'Tutti', onPress }}>
        <GlassListRow title="Porta aperta" />
      </GlassList>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tutti' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has a caption and a note when it has no title, and is named by ariaLabel', () => {
    render(
      <GlassList caption="La casa" footer="Funzioni e strumenti stanno in Casa." ariaLabel="La casa">
        <GlassListRow title="Piani e stanze" opens onPress={vi.fn()} />
      </GlassList>,
    );
    expect(screen.getByRole('region', { name: 'La casa' })).toBeTruthy();
    expect(screen.getByText('Funzioni e strumenti stanno in Casa.')).toBeTruthy();
  });

  it('makes the whole row one button, with no button inside it', () => {
    const onPress = vi.fn();
    render(
      <GlassList title="Sensori">
        <GlassListRow title="Movimento" note="Soggiorno" value="Nessun movimento" icon={<ShieldCheck />} iconShape="square" tone="security" opens onPress={onPress} />
      </GlassList>,
    );
    const row = screen.getByRole('button', { name: /Movimento/ });
    expect(row.querySelector('button, a, input, [role="button"]')).toBeNull();
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('GlassListRow in a grouped list', () => {
  it('draws a square icon in the colour of a function', () => {
    render(<GlassListRow title="Allarme" icon={<ShieldCheck />} iconShape="square" tone="security" />);
    const icon = document.querySelector('.glass-list-row-icon') as HTMLElement;
    expect(icon.className).toContain('is-square');
    expect(icon.dataset.tone).toBe('security');
    expect(icon.style.getPropertyValue('--row-tone')).toBe('var(--fn-security)');
    // The drawing is white in both themes (glassListRow.css, --fn-on-fill), not the ink of the theme.
    expect(icon.style.getPropertyValue('--row-tone-ink')).toBe('');
  });

  it('stays round and uncoloured when nothing is asked: the rows that exist do not change', () => {
    render(<GlassListRow title="Luce" icon={<ShieldCheck />} />);
    const icon = document.querySelector('.glass-list-row-icon') as HTMLElement;
    expect(icon.className).toBe('glass-list-row-icon');
    expect(icon.dataset.tone).toBeUndefined();
    expect(icon.getAttribute('style')).toBeNull();
  });
});

describe('GlassList, the last row that opens everything', () => {
  it('is one button inside the block, with its number and ›', () => {
    const onPress = vi.fn();
    render(
      <GlassList title="Porte e finestre" allRow={{ label: 'Tutti i sensori', count: 12, onPress }}>
        <GlassListRow title="Ingresso" value="Chiusa" />
      </GlassList>,
    );
    const all = screen.getByRole('button', { name: /Tutti i sensori/ });
    expect(all.className).toContain('glass-list-all');
    expect(all.parentElement!.className).toContain('glass-list');
    expect(all.querySelector('em')!.textContent).toBe('12');
    expect(all.querySelector('.glass-list-row-opens')).not.toBeNull();
    fireEvent.click(all);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
