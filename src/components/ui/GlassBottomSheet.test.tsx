import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlassBottomSheet from './GlassBottomSheet';

afterEach(cleanup);

describe('GlassBottomSheet', () => {
  it('uses the shared themed sheet and dismisses from the backdrop', () => {
    const onClose = vi.fn();
    render(
      <GlassBottomSheet isOpen onClose={onClose} title="Filtri">
        <div>Contenuto</div>
      </GlassBottomSheet>,
    );

    // The sheet of the Rooms board: the shared surface, rounded all round, floating at the bottom on a phone.
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('glass-sheet-surface');
    expect(dialog.className).toContain('rounded-[30px]');
    expect(dialog.className).toContain('!max-w-none');
    expect(dialog.className).toContain('md:!max-w-md');
    expect(dialog.parentElement?.className).toContain('items-end');
    fireEvent.click(dialog.previousElementSibling as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports container-bound sheets with an accessible hidden heading', () => {
    render(
      <GlassBottomSheet
        isOpen
        onClose={vi.fn()}
        title="Gestisci dispositivi"
        position="container"
        usePortal={false}
        showHeader={false}
      >
        <div>Contenuto Rooms</div>
      </GlassBottomSheet>,
    );

    expect(screen.getByRole('heading', { name: 'Gestisci dispositivi' })).toBeTruthy();
    expect(screen.getByText('Contenuto Rooms')).toBeTruthy();
  });
});
