import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GridEngineLab } from './GridEngineLab';

afterEach(cleanup);

function expectGeometry(
  testId: string,
  expected: Partial<Record<'x' | 'y' | 'w' | 'h', number>>,
) {
  const card = screen.getByTestId(testId);
  for (const [field, value] of Object.entries(expected)) {
    expect(card.getAttribute(`data-${field}`)).toBe(String(value));
  }
}

describe('GridEngineLab', () => {
  it('offers five deterministic scenarios and visualizes manual versus automatic gaps', () => {
    render(<GridEngineLab />);

    expect(screen.getAllByText(/Scenario 0[1-5]/)).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /Spazi manuali/ }));
    expectGeometry('result-card-gap-a', { x: 0, y: 0, w: 2, h: 1 });
    expectGeometry('result-card-gap-b', { x: 0, y: 4, w: 2, h: 1 });
    expectGeometry('result-card-gap-c', { x: 0, y: 6, w: 2, h: 1 });
    expect(screen.getByTestId('mode-effect').textContent).toContain('spazi non coinvolti');

    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    expectGeometry('result-card-gap-a', { x: 0, y: 0 });
    expectGeometry('result-card-gap-b', { x: 0, y: 1 });
    expectGeometry('result-card-gap-c', { x: 0, y: 2 });
    expect(screen.getByTestId('solver-mode-status').textContent).toBe('automatic');
    expect(screen.getByTestId('mode-effect').textContent).toContain('COMPACT: 2 geometrie');

    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    expectGeometry('result-card-gap-b', { x: 0, y: 4 });
    expectGeometry('result-card-gap-c', { x: 0, y: 6 });
  });

  it('previews explicit COMPACT and directional REORDER as distinct operations', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: /Spazi manuali/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatta layout' }));
    expectGeometry('result-card-gap-b', { y: 1 });
    expectGeometry('result-card-gap-c', { y: 2 });
    expect(screen.getByText('COMPACT', { selector: 'dd' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Collisione a catena/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona chain-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    fireEvent.change(screen.getByLabelText('Destinazione Y'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));

    expectGeometry('result-card-chain-b', { y: 0 });
    expectGeometry('result-card-chain-c', { y: 1 });
    expectGeometry('result-card-chain-a', { y: 2 });
    expectGeometry('result-card-mover', { y: 5 });
    expect(screen.getByTestId('final-selected-position').textContent).toContain('chain-a · x0 y2');
  });

  it('commits the exact MOVE preview without a second repositioning', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expectGeometry('result-card-move-a', { x: 0, y: 0, w: 4, h: 1 });
    expectGeometry('result-card-target-b', { x: 0, y: 1, w: 4, h: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expectGeometry('result-card-move-a', { x: 0, y: 0, w: 4, h: 1 });
    expectGeometry('result-card-target-b', { x: 0, y: 1, w: 4, h: 2 });
    expectGeometry('reference-card-target-b', { x: 0, y: 1, w: 4, h: 2 });
    expect(screen.getByRole('button', { name: 'Conferma' }).hasAttribute('disabled')).toBe(true);
  });

  it('makes the three-card collision chain visible in both solver modes', () => {
    render(<GridEngineLab />);

    const loadChain = () => fireEvent.click(screen.getByRole('button', { name: /Collisione a catena/ }));
    const expectChain = () => {
      expectGeometry('result-card-mover', { x: 0, y: 0 });
      expectGeometry('result-card-chain-a', { x: 0, y: 1 });
      expectGeometry('result-card-chain-b', { x: 0, y: 2 });
      expectGeometry('result-card-chain-c', { x: 0, y: 3 });
    };

    loadChain();
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expectChain();

    loadChain();
    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expectChain();
  });

  it('uses RESIZE to push partially overlapping neighbors', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: 'Seleziona target-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resize' }));
    fireEvent.change(screen.getByLabelText('Larghezza W'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Altezza H'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));

    expectGeometry('result-card-target-b', { x: 0, y: 0, w: 8, h: 2 });
    expectGeometry('result-card-side-c', { x: 6, y: 2, w: 4, h: 1 });
  });

  it('derives runtime expansion from the reference and restores it exactly when disabled', () => {
    render(<GridEngineLab />);

    expectGeometry('result-card-move-a', { x: 8, y: 3, w: 4, h: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Simula espansione dispositivo/ }));
    expectGeometry('result-card-move-a', { x: 7, y: 3, w: 5, h: 2 });
    expectGeometry('reference-card-move-a', { x: 8, y: 3, w: 4, h: 1 });

    fireEvent.click(screen.getByRole('button', { name: /Simula espansione dispositivo/ }));
    expectGeometry('result-card-move-a', { x: 8, y: 3, w: 4, h: 1 });
  });

  it('reports solver validation errors and reset restores the selected fixture', () => {
    render(<GridEngineLab />);

    fireEvent.change(screen.getByLabelText('Destinazione X'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expect(screen.getByRole('alert').textContent).toContain('INVALID_NUMBER');

    fireEvent.change(screen.getByLabelText('Destinazione X'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expectGeometry('result-card-move-a', { x: 0, y: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Reset fixture' }));
    expectGeometry('result-card-move-a', { x: 8, y: 3, w: 4, h: 1 });
    expectGeometry('result-card-target-b', { x: 0, y: 0, w: 4, h: 2 });
  });
});
