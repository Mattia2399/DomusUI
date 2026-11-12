import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassSheet } from './GlassSheet';
import { PAGE_COLUMN_MIN_WIDTH, PageFrame, pageLayoutFor } from './PageFrame';

const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

function givePageWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return (this as HTMLElement).dataset?.testid === 'page-frame' ? width : 0;
    },
  });
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});

const overlayOf = (dialog: HTMLElement) => dialog.parentElement as HTMLElement;

describe('PageFrame', () => {
  it('opens things as a column from 760 px of the page', () => {
    expect(PAGE_COLUMN_MIN_WIDTH).toBe(760);
    expect(pageLayoutFor(759)).toBe('sheet');
    expect(pageLayoutFor(760)).toBe('column');
  });

  it('writes its shape and its function on itself', () => {
    givePageWidth(1280);
    render(
      <PageFrame fn="security">
        <p>Pagina</p>
      </PageFrame>,
    );
    const frame = screen.getByTestId('page-frame');
    expect(frame.dataset.layout).toBe('column');
    expect(frame.dataset.fn).toBe('security');
  });
});

describe('GlassSheet', () => {
  it('rises from the bottom when there is no page around it', () => {
    render(
      <GlassSheet isOpen onClose={vi.fn()} title="Inserisci" detail="Scegli come">
        <p>Modalità</p>
      </GlassSheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Inserisci' });
    expect(overlayOf(dialog).dataset.layout).toBe('sheet');
    expect(overlayOf(dialog).dataset.fn).toBeUndefined();
    expect(dialog.className).toContain('page-sheet');
    expect(screen.getByText('Scegli come')).toBeTruthy();
  });

  it('takes its shape from the page, not from the window, and the colour of its function', () => {
    givePageWidth(390);
    const { unmount } = render(
      <PageFrame fn="security">
        <GlassSheet isOpen onClose={vi.fn()} title="Inserisci">
          <p>Modalità</p>
        </GlassSheet>
      </PageFrame>,
    );
    expect(overlayOf(screen.getByRole('dialog')).dataset.layout).toBe('sheet');
    unmount();

    givePageWidth(1280);
    render(
      <PageFrame fn="security">
        <GlassSheet isOpen onClose={vi.fn()} title="Inserisci">
          <p>Modalità</p>
        </GlassSheet>
      </PageFrame>,
    );
    const overlay = overlayOf(screen.getByRole('dialog'));
    expect(overlay.dataset.layout).toBe('column');
    expect(overlay.dataset.fn).toBe('security');
    // In the portal: over the bar of the app too, outside the page.
    expect(screen.getByTestId('page-frame').contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
  });

  it('has a main command as wide as the sheet, and a note under it', () => {
    const onPress = vi.fn();
    render(
      <GlassSheet isOpen onClose={vi.fn()} title="Inserisci" action={{ label: 'Inserisci · Fuori casa', icon: <span />, onPress }} note="Hai 45 secondi per uscire.">
        <p>Modalità</p>
      </GlassSheet>,
    );
    const command = screen.getByRole('button', { name: 'Inserisci · Fuori casa' });
    expect(command.className).toContain('page-sheet-action');
    fireEvent.click(command);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Hai 45 secondi per uscire.').className).toContain('page-sheet-note');
  });

  it('shows no note and no command when it is given none', () => {
    render(
      <GlassSheet isOpen onClose={vi.fn()} title="Inserisci">
        <p>Modalità</p>
      </GlassSheet>,
    );
    expect(document.querySelector('.page-sheet-action, .page-sheet-note, .page-sheet-footer')).toBeNull();
  });

  it('puts the focus on the sheet when it opens, not on the X', async () => {
    render(
      <GlassSheet isOpen onClose={vi.fn()} title="Inserisci">
        <p>Modalità</p>
      </GlassSheet>,
    );
    await waitFor(() => expect(document.activeElement?.className).toContain('page-sheet-content'));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Chiudi finestra' }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('closes with the X, with Esc and with a tap outside', () => {
    const onClose = vi.fn();
    render(
      <GlassSheet isOpen onClose={onClose} title="Inserisci">
        <p>Modalità</p>
      </GlassSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi finestra' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(overlayOf(screen.getByRole('dialog')).querySelector('.page-sheet-scrim')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('GlassSheet in a column', () => {
  it('leaves the page in view: only a very light veil, and only in the column; the phone keeps its scrim', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/pageFrame.css'), 'utf8');
    expect(css).toMatch(/\.page-sheet-overlay\[data-layout='column'\] \.page-sheet-scrim \{\s*background: color-mix\(in srgb, var\(--ui-scrim\) 10%, transparent\);/);
    expect(css).toMatch(/\.page-sheet-scrim \{\s*background: var\(--ui-scrim\);[^}]*backdrop-filter: none;/);
  });
});
