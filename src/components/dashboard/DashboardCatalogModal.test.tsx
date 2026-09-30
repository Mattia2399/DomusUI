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
});
