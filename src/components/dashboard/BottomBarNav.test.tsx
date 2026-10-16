import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { BottomBarNav } from './BottomBarNav';

const renderNavigation = (node: ReactElement) => render(node, { wrapper: I18nProvider });

describe('BottomBarNav', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  it('uses the adaptive navigation material and exposes the active route', () => {
    window.history.replaceState({}, '', '/home');
    const onPathClick = vi.fn();
    const onPrefetchRoute = vi.fn();

    const { container } = renderNavigation(
      <BottomBarNav
        isEditMode={false}
        quickPaths={[]}
        onPathClick={onPathClick}
        onOpenSettings={vi.fn()}
        onPrefetchRoute={onPrefetchRoute}
      />,
    );

    expect(container.querySelector('nav.liquid-glass-navigation')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apri Dashboard' }).getAttribute('aria-current')).toBe('page');

    const roomsButton = screen.getByRole('button', { name: 'Apri Stanze' });
    fireEvent.pointerEnter(roomsButton);
    expect(onPrefetchRoute).toHaveBeenCalledWith('/rooms');

    fireEvent.click(roomsButton);
    expect(onPathClick).toHaveBeenCalledWith(expect.objectContaining({ path: '/rooms' }));
  });

  it('uses the internal route when the dashboard runs inside the Home Assistant iframe', () => {
    window.history.replaceState({}, '', '/local/ha-dashboard-builder/index.html?dashboard_mode=embedded');

    renderNavigation(
      <BottomBarNav
        isEditMode={false}
        quickPaths={[]}
        activeRoute="/rooms"
        onPathClick={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Apri Stanze' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Apri Dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('exposes Settings as the active destination', () => {
    renderNavigation(
      <BottomBarNav
        isEditMode={false}
        quickPaths={[]}
        activeRoute="/settings"
        isSettingsActive
        onPathClick={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Apri Impostazioni' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Apri Dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('slides a drop of glass under the active tab, and hides it when no tab is active', () => {
    window.history.replaceState({}, '', '/home');
    const { rerender } = renderNavigation(
      <BottomBarNav isEditMode={false} quickPaths={[]} onPathClick={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    const drop = screen.getByTestId('bottom-bar-drop');
    expect(drop.getAttribute('data-index')).toBe('0');
    expect(drop.style.transform).toBe('translateX(0%)');
    // Icons only: the names stay for assistive technology.
    expect(screen.getByRole('button', { name: 'Apri Dashboard' }).textContent).toBe('');

    rerender(
      <BottomBarNav
        isEditMode={false}
        quickPaths={[]}
        activeRoute="/settings"
        isSettingsActive
        onPathClick={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(drop.getAttribute('data-index')).toBe('4');
    expect(drop.style.transform).toBe('translateX(400%)');
    expect(drop.style.opacity).toBe('1');

    window.history.replaceState({}, '', '/appgallery');
    rerender(
      <BottomBarNav isEditMode={false} quickPaths={[]} activeRoute="/appgallery" onPathClick={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(drop.style.opacity).toBe('0');
  });

  it('shows the person on the Settings tab, which opens with them at its top', () => {
    const onOpenSettings = vi.fn();
    const { rerender } = renderNavigation(
      <BottomBarNav
        isEditMode={false}
        quickPaths={[]}
        onPathClick={vi.fn()}
        onOpenSettings={onOpenSettings}
        userName="Mattia Ticconi"
        haStatus="connected"
      />,
    );

    const settings = screen.getByRole('button', { name: 'Apri Impostazioni' });
    expect(settings.querySelector('svg.lucide-settings')).toBeNull();
    // Only the photo (here the initials): no written label under it.
    expect(settings.textContent).toBe('MT');
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledOnce();

    rerender(
      <BottomBarNav
        isEditMode={false}
        quickPaths={[]}
        onPathClick={vi.fn()}
        onOpenSettings={onOpenSettings}
        userName="Mattia Ticconi"
        userAvatarUrl="/avatars/mattia.jpg"
        haStatus="connected"
      />,
    );
    expect(screen.getByRole('button', { name: 'Apri Impostazioni' }).querySelector('img')?.getAttribute('src')).toBe(
      '/avatars/mattia.jpg',
    );
  });
});
