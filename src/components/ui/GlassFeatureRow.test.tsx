import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassFeatureRow } from './GlassFeatureRow';

afterEach(cleanup);

describe('GlassFeatureRow', () => {
  it('is one button: the colour of its function, its name, its state and ›', () => {
    const onPress = vi.fn();
    render(<GlassFeatureRow title="Sicurezza" status="Disinserito · tutto chiuso" icon={<svg />} tone="security" onPress={onPress} />);
    const row = screen.getByRole('button', { name: /Sicurezza/ });
    expect(row.className).toContain('page-glass');
    expect((row.querySelector('.glass-feature-row-icon') as HTMLElement).style.background).toBe('var(--fn-security)');
    expect(row.querySelector('.glass-feature-row-opens')).not.toBeNull();
    expect(row.querySelector('button, a, input')).toBeNull();
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('turns its state to the colour of attention when it asks for a look', () => {
    render(<GlassFeatureRow title="Irrigazione" status="Guasto da controllare" warn icon={<svg />} tone="irrigation" onPress={vi.fn()} />);
    expect(screen.getByRole('button').className).toContain('is-warn');
  });

  it('has a transparent version that adds, without ›', () => {
    render(<GlassFeatureRow variant="add" title="Aggiungi una funzione" icon={<svg />} onPress={vi.fn()} />);
    const row = screen.getByRole('button');
    expect(row.className).toContain('is-add');
    expect(row.className).not.toContain('page-glass');
    expect(row.querySelector('.glass-feature-row-opens')).toBeNull();
  });
});
