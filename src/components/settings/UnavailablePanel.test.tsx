import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnavailablePanel } from './UnavailablePanel';

afterEach(cleanup);

describe('a card whose entity the Home cannot read', () => {
  it('says the device does not answer, with only Close to press', () => {
    const onClose = vi.fn();
    render(<UnavailablePanel name="Ventola" inSheet={false} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'Ventola' })).toBeTruthy();
    expect(screen.getByText('Non risponde.')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
