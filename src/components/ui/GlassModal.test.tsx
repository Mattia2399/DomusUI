import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlassModal from './GlassModal';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('GlassModal', () => {
  it('provides dialog semantics, locks scrolling and closes with Escape', async () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <GlassModal isOpen onClose={onClose} title="Conferma" description="Controlla l'operazione">
        <button type="button">Azione</button>
      </GlassModal>,
    );

    expect(getByRole('dialog', { name: 'Conferma' })).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(document.activeElement).toBe(getByRole('button', { name: 'Chiudi finestra' })));
  });

  it('takes the dashboard theme of the control that opened it', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div className="dashboard-theme-light">
          <button type="button" onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}>Apri</button>
          <GlassModal isOpen={open} onClose={() => setOpen(false)} title="Uscire senza salvare?" />
        </div>
      );
    }
    const { getByRole } = render(<Harness />);

    fireEvent.click(getByRole('button', { name: 'Apri' }));
    const dialog = getByRole('dialog', { name: 'Uscire senza salvare?' });

    expect(dialog.closest('.dashboard-theme-light')?.parentElement).toBe(document.body);
  });

  it('keeps a non-dismissible modal open and exposes its busy close state', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <GlassModal isOpen onClose={onClose} title="Operazione" dismissible={false}>
        <span>Attendi</span>
      </GlassModal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(getByRole('button', { name: 'Chiudi finestra' }).hasAttribute('disabled')).toBe(true);
  });

  it('anchors confirmation actions to the bottom of responsive layouts', () => {
    const { getByText } = render(
      <GlassModal
        isOpen
        onClose={() => undefined}
        title="Conferma"
        variant="responsive"
        footer={<button type="button">Continua</button>}
      />,
    );

    expect(getByText('Continua').closest('footer')?.className).toContain('mt-auto');
  });
});
