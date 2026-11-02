import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { DashboardCatalogModal } from './DashboardCatalogModal';

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('DashboardCatalogModal', () => {
  it('adds the selected card to the main canvas without closing the Builder', () => {
    const onAddWidget = vi.fn(() => 'widget-light');

    render(
      <DashboardCatalogModal
        isOpen
        onClose={vi.fn()}
        sections={[]}
        widgets={[]}
        selectedSectionId={null}
        onAddWidget={onAddWidget}
        onAddSection={vi.fn(() => 'section-id')}
      />,
      { wrapper: I18nProvider },
    );

    fireEvent.click(screen.getByRole('button', { name: /Luce/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi al canvas' }));

    expect(onAddWidget).toHaveBeenCalledWith('light', { type: 'canvas' });
    expect(screen.getByRole('status').textContent).toContain(
      'Luce aggiunta a Dashboard principale.',
    );
  });

  it('offers no Stack to create and no Stack as a destination while Stacks are suspended', () => {
    const onAddWidget = vi.fn(() => 'widget-light');
    render(
      <DashboardCatalogModal
        isOpen
        onClose={vi.fn()}
        sections={[{ id: 'stack', kind: 'stack-grid', title: 'Soggiorno', layout: { i: 'stack', x: 0, y: 0, w: 4, h: 4 } }]}
        widgets={[]}
        selectedSectionId="stack"
        onAddWidget={onAddWidget}
        onAddSection={vi.fn(() => 'section-id')}
      />,
      { wrapper: I18nProvider },
    );

    // Even with a saved Stack selected, a new card goes to the main canvas.
    fireEvent.click(screen.getByRole('button', { name: /Luce/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi al canvas' }));
    expect(onAddWidget).toHaveBeenCalledWith('light', { type: 'canvas' });
    expect(screen.queryByText(/Soggiorno · /)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Sezioni' }));
    expect(screen.queryByText('Stack verticale')).toBeNull();
    expect(screen.queryByText('Stack orizzontale')).toBeNull();
    expect(screen.queryByText('Stack a griglia')).toBeNull();
    expect(screen.getByRole('button', { name: /Scenari/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Stack/ })).toBeNull();
  });
});
