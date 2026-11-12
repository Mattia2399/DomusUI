import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GlassSheet } from './GlassSheet';
import { PAGE_COLUMN_MIN_WIDTH, PageFrame } from './PageFrame';
import { SubPage } from './SubPage';

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

function Page({ withSheet = false }: { withSheet?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <PageFrame
      fn="security"
      subPage={
        open ? (
          <SubPage title="Sensori" detail="3 sensori" onClose={() => setOpen(false)}>
            <button type="button" onClick={() => setSheet(true)}>
              Apri foglio
            </button>
          </SubPage>
        ) : null
      }
    >
      <h1>Sicurezza</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Tutte
      </button>
      {withSheet ? (
        <GlassSheet isOpen={sheet} onClose={() => setSheet(false)} title="Inserisci">
          <p>Modalità</p>
        </GlassSheet>
      ) : null}
    </PageFrame>
  );
}

const main = () => document.querySelector('.page-frame-main') as HTMLElement;

describe('SubPage', () => {
  it('opens with its title in focus, and gives the focus back to what opened it', async () => {
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Tutte' });
    opener.focus();
    fireEvent.click(opener);

    const title = screen.getByRole('heading', { level: 2, name: 'Sensori' });
    expect(document.activeElement).toBe(title);
    expect(screen.getByRole('region', { name: 'Sensori' })).toBeTruthy();
    expect(screen.getByText('3 sensori')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sensori' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tutte' }));
  });

  it('closes with Esc', async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Tutte' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sensori' })).toBeNull());
  });

  it('covers the page on a narrow page: the page under it is out of reach', () => {
    givePageWidth(390);
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Tutte' }));
    expect(screen.getByTestId('sub-page').dataset.layout).toBe('sheet');
    expect(main().hasAttribute('inert')).toBe(true);
    expect(main().dataset.covered).toBe('true');
  });

  it('opens beside the page on a wide one, and the page stays usable', () => {
    givePageWidth(1280);
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Tutte' }));
    expect(screen.getByTestId('sub-page').dataset.layout).toBe('column');
    expect(main().hasAttribute('inert')).toBe(false);
    // As in the prototype: no veil, and the page answers while the subpage is open.
    expect(document.querySelector('.page-sheet-scrim, [role="dialog"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tutte' }));
    expect(screen.getAllByTestId('sub-page')).toHaveLength(1);
  });

  it('lets Esc close a sheet opened from it first, then itself', async () => {
    render(<Page withSheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Tutte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apri foglio' }));
    expect(screen.getByRole('dialog', { name: 'Inserisci' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inserisci' })).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: 'Sensori' })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sensori' })).toBeNull());
  });

  it('changes shape at the same width in the CSS (container query) and in the code', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/pageFrame.css'), 'utf8');
    expect(css).toContain(`@container page (min-width: ${PAGE_COLUMN_MIN_WIDTH}px)`);
    expect(css).toContain(`@container page (max-width: ${PAGE_COLUMN_MIN_WIDTH - 0.02}px)`);
    expect(css).toMatch(/\.page-frame \{[^}]*container-name: page;/);
  });

  it('comes in with the curve and the time of the pages that push', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/pageFrame.css'), 'utf8');
    expect(css).toContain('460ms cubic-bezier(0.32, 0.72, 0, 1)');
  });
});

describe('PageFrame without a subpage', () => {
  it('leaves the page usable', () => {
    render(<Page />);
    expect(main().hasAttribute('inert')).toBe(false);
    expect(main().dataset.covered).toBeUndefined();
  });
});
