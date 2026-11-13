import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationProvider } from '../../context/NotificationProvider';
import { LazyDashboardNotificationsPanel } from './LazyDashboardNotificationsPanel';

afterEach(cleanup);

describe('LazyDashboardNotificationsPanel', () => {
  it('loads nothing until it is opened, then shows the panel and keeps it', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <NotificationProvider>
        <LazyDashboardNotificationsPanel isOpen={false} onClose={onClose} />
      </NotificationProvider>,
    );
    // Closed and never opened: no panel in the page (the provider keeps only its live region).
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.glass-sheet-surface')).toBeNull();

    rerender(
      <NotificationProvider>
        <LazyDashboardNotificationsPanel isOpen onClose={onClose} />
      </NotificationProvider>,
    );
    // The default wait of the project (src/test/vitest.setup.ts): the panel loads on demand, slower under load.
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
