import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlassDropdown from './GlassDropdown';

const options = [
  { id: 'weekly', name: 'Ogni settimana' },
  { id: 'biweekly', name: 'Ogni 2 settimane' },
];

afterEach(cleanup);

describe('GlassDropdown', () => {
  it('gives the portalled list the theme of the surrounding dashboard', async () => {
    render(
      <div className="dashboard-theme-light">
        <GlassDropdown ariaLabel="Frequenza" options={options} selected={options[0]} onChange={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Frequenza' }));
    const list = await screen.findByRole('listbox');

    expect(list.closest('.dashboard-theme-light')).toBe(list);
    expect(list.className).not.toContain('dashboard-theme-dark');
  });

  it('reports the chosen option', async () => {
    const onChange = vi.fn();
    render(
      <div className="dashboard-theme-dark">
        <GlassDropdown ariaLabel="Frequenza" options={options} selected={options[0]} onChange={onChange} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Frequenza' }));
    expect((await screen.findByRole('listbox')).className).toContain('dashboard-theme-dark');
    fireEvent.click(screen.getByRole('option', { name: 'Ogni 2 settimane' }));

    expect(onChange).toHaveBeenCalledWith(options[1]);
  });
});
