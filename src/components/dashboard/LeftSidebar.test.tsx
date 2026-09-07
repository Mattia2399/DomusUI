import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationProvider } from '../../context/NotificationProvider';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { createDefaultSidebarPaths } from '../../navigation/applicationRoutes';
import { LeftSidebar } from './LeftSidebar';

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('LeftSidebar tablet density', () => {
  it('keeps every route and Edit Mode directly available in the compact rail', () => {
    setViewport(1024, 600);
    const onPathClick = vi.fn();

    render(
      <I18nProvider>
        <NotificationProvider>
          <LeftSidebar
          isEditMode={false}
          haStatus="connected"
          quickPaths={createDefaultSidebarPaths()}
          activeRoute="/home"
          canToggleEditMode
          onPathClick={onPathClick}
          onToggleEditMode={vi.fn()}
          onOpenProfile={vi.fn()}
          onOpenSettings={vi.fn()}
          />
        </NotificationProvider>
      </I18nProvider>,
    );

    for (const label of ['Dashboard', 'Stanze', 'Sicurezza', 'Consumi', 'Automazioni', 'App Gallery']) {
      expect(screen.getByRole('button', { name: `Apri ${label}` })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Attiva o disattiva modalità modifica' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apri altre sezioni' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apri App Gallery' }));
    expect(onPathClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'appgallery' }));
  });
});
