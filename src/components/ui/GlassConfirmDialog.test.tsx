import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlassConfirmDialog from './GlassConfirmDialog';

afterEach(cleanup);

function renderDialog(overrides: Partial<React.ComponentProps<typeof GlassConfirmDialog>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Spegnere Frigorifero?',
    description: 'È una presa protetta.',
    cancelLabel: 'Annulla',
    confirmLabel: 'Spegni',
    icon: <svg data-testid="mark" />,
    ...overrides,
  };
  render(<GlassConfirmDialog {...props} />);
  return props;
}

describe('GlassConfirmDialog', () => {
  it('asks with a mark, the question and what happens, and no close button', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Spegnere Frigorifero?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('È una presa protetta.')).toBeTruthy();
    expect(screen.getByTestId('mark').closest('.glass-confirm-mark')?.className).toContain('is-warning');
    expect(screen.queryByRole('button', { name: /Chiudi/ })).toBeNull();
  });

  it('confirms with the action in its colour, or cancels', () => {
    const props = renderDialog();
    const confirm = screen.getByRole('button', { name: 'Spegni' });
    expect(confirm.className).toContain('glass-button-danger');
    fireEvent.click(confirm);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('holds the action while it is busy', () => {
    renderDialog({ busy: true, confirmTone: 'accent' });
    const confirm = screen.getByRole('button', { name: 'Spegni' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.className).toContain('glass-button-accent');
  });
});
