import { cleanup, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../i18n/I18nProvider';
import {
  DashboardSecurityProvider,
  createDashboardSecurityValue,
} from '../security/dashboardAccess';
import SettingsDashboard from './SettingsDashboard';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', 'test');
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const security = createDashboardSecurityValue({
  runtimeMode: 'real',
  haStatus: 'connected',
  user: { id: 'owner-1', isOwner: true },
});

const baseProps = {
  developerMode: false,
  haStatus: 'connected' as const,
  haError: null,
  haStates: {},
  haAreas: [],
  sections: [],
  widgets: [],
  houseMembers: [
    {
      id: 'person.mattia',
      name: 'Mattia',
      avatarUrl: '/avatars/mattia.jpg',
      isCurrent: true,
    },
  ],
  onDeveloperModeChange: vi.fn(),
  onDownloadBackup: vi.fn(),
  onRestoreBackup: vi.fn(async () => undefined),
  onResetAll: vi.fn(async () => undefined),
  onCallService: vi.fn(async () => true),
};

describe('SettingsDashboard', () => {
  it('renders the overview in English when selected on this device', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Home settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Home\b/ })).toBeTruthy();
  });

  it('uses a navigable bento overview for house settings', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Impostazioni Casa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Casa\b/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sistema/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Mattia' })).toBeTruthy();
    expect(screen.queryByText('Nessuna stanza configurata')).toBeNull();
    expect(screen.getByRole('button', { name: /^Casa\b/ }).parentElement?.className).toContain(
      'grid-cols-2',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Casa\b/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/home');
  });

  it('opens administrative destinations as stable nested URLs', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Persone e accessi/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/access');
  });

  it('opens the system page at the top after scrolling the settings overview', () => {
    const { container, rerender } = render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
        />
      </DashboardSecurityProvider>,
    );

    const overviewScroller = container.querySelector<HTMLElement>('.dashboard-page-scroll');
    expect(overviewScroller).toBeTruthy();
    overviewScroller!.scrollTop = 420;

    rerender(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
        />
      </DashboardSecurityProvider>,
    );

    const systemScroller = container.querySelector<HTMLElement>('.dashboard-page-scroll');
    expect(systemScroller).toBeTruthy();
    expect(systemScroller).not.toBe(overviewScroller);
    expect(systemScroller?.scrollTop).toBe(0);
    expect(screen.getByRole('heading', { name: 'Stato del sistema' })).toBeTruthy();
  });

  it('opens shared alert preferences as a nested page', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Avvisi e attenzione/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/attention');

    rerender(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/attention"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Avvisi e attenzione' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Mostra il Centro Attenzione' })).toBeTruthy();
  });

  it('renders managed settings inside the routed page instead of opening a popup', () => {
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/access"
          managedSectionContent={<div>Contenuto membri incorporato</div>}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Persone e accessi' })).toBeTruthy();
    expect(screen.getByText('Contenuto membri incorporato')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the five-version layout history as a nested settings page', () => {
    const dashboard = {
      storageVersion: 14,
      sections: [],
      widgets: [],
      widgetTypeLayoutOverrides: {},
      widgetLayoutOverrides: {},
      responsiveLayouts: {},
    };
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/data/history"
          layoutRevisionHistoryStatus="ready"
          layoutRevisions={[{
            revision: 2,
            createdAt: '2026-08-05T10:00:00.000Z',
            createdByUserId: 'owner-1',
            source: 'edit',
            dashboard,
          }]}
          onRefreshLayoutRevisions={vi.fn(async () => true)}
          onRestoreLayoutRevision={vi.fn(async () => ({
            ok: true as const,
            savedAt: Date.now(),
            storageKey: 'test',
            bytes: 1,
          }))}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Versioni del layout' })).toBeTruthy();
    expect(screen.getByText('Versione 2')).toBeTruthy();
    expect(screen.getByText('Attuale')).toBeTruthy();
  });

  it('opens the complete entity catalogue from the house page', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/home"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.queryByText('Membri')).toBeNull();
    expect(screen.queryByRole('button', { name: /Persone e accessi/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Entità / }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/entities');
  });

  it('keeps device health inside the house inventory', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          haDeviceRegistry={[{ id: 'kitchen-light', name: 'Luce cucina' }]}
          navigationRoute="/settings/home"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Dispositivi / }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/devices');
  });

  it('downloads aggregate support diagnostics from Advanced settings', () => {
    const createObjectURL = vi.fn(() => 'blob:support-diagnostics');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/advanced"
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scarica diagnostica' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/Diagnostica scaricata/),
    ).toBeTruthy();
  });

  it('renders the routed support center with separate public and private channels', () => {
    const onNavigate = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:support-diagnostics');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/support"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Supporto e feedback' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Apri una segnalazione/ }).getAttribute('href'),
    ).toContain('bug_report.yml');
    expect(
      screen.getByRole('link', { name: /Proponi un’idea/ }).getAttribute('href'),
    ).toContain('/discussions/new?category=ideas');
    expect(
      screen.getByRole('link', { name: /Segnala in privato/ }).getAttribute('href'),
    ).toContain('/security/advisories/new');

    fireEvent.click(screen.getByRole('button', { name: 'Scarica diagnostica' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(screen.getByText(/non viene inviato automaticamente/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onNavigate).toHaveBeenCalledWith('/profile');
  });
});
