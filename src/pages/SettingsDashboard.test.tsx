import { cleanup, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
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
      id: 'user:u-mattia',
      name: 'Mattia',
      userId: 'u-mattia',
      personEntityId: 'person.mattia',
      hasAccount: true,
      avatarUrl: '/avatars/mattia.jpg',
      isCurrent: true,
    },
  ],
  onDeveloperModeChange: vi.fn(),
  onDownloadBackup: vi.fn(),
  onRestoreBackup: vi.fn(async () => undefined),
  onResetAll: vi.fn(async () => undefined),
  onCallService: vi.fn(async () => true),
  cardSizingEngine: 'adaptive' as const,
  onCardSizingEngineChange: vi.fn(),
};

describe('SettingsDashboard', () => {
  it('renders the overview in English when selected on this device', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Home Assistant' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Floors and rooms/ })).toBeTruthy();
  });

  it('groups the overview into home, dashboard, Home Assistant and data', () => {
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

    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeTruthy();
    const groups = screen.getAllByRole('region').map((group) => group.getAttribute('aria-label'));
    expect(groups).toEqual(['Casa', 'Dashboard', 'Home Assistant', 'Dati e supporto']);
    expect(screen.getByRole('img', { name: 'Mattia' })).toBeTruthy();

    const home = within(screen.getByRole('region', { name: 'Casa' }));
    expect(home.getAllByRole('button').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Piani e stanze'),
      expect.stringContaining('Persone e accessi'),
      expect.stringContaining('Sicurezza'),
      expect.stringContaining('Raccolta rifiuti'),
    ]);
    const homeAssistant = within(screen.getByRole('region', { name: 'Home Assistant' }));
    expect(homeAssistant.getByRole('button', { name: /^Connessioni/ })).toBeTruthy();
    expect(homeAssistant.getByRole('button', { name: /^Sistema/ })).toBeTruthy();

    fireEvent.click(home.getByRole('button', { name: /^Piani e stanze/ }));
    expect(onNavigate).toHaveBeenCalledWith('/rooms');
    fireEvent.click(home.getByRole('button', { name: /^Sicurezza/ }));
    expect(onNavigate).toHaveBeenCalledWith('/security');
    fireEvent.click(homeAssistant.getByRole('button', { name: /^Entità/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/entities');
  });

  it('keeps the old house page address on the overview', () => {
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/home" />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeTruthy();
  });

  it('sends the old security settings address to the Security center', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/security" onNavigate={onNavigate} />
      </DashboardSecurityProvider>,
    );

    expect(onNavigate).toHaveBeenCalledWith('/security');
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

  it('renders house access subpages with a single page header that goes back to access', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/access/members"
          onNavigate={onNavigate}
          managedSectionContent={<div>Elenco membri</div>}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getAllByRole('heading', { name: 'Membri della casa' })).toHaveLength(1);
    expect(screen.getByText('Elenco membri')).toBeTruthy();
    const backButtons = screen.getAllByRole('button', { name: 'Indietro' });
    expect(backButtons).toHaveLength(1);
    expect(backButtons[0].textContent).toContain('Persone e accessi');
    fireEvent.click(backButtons[0]);
    expect(onNavigate).toHaveBeenCalledWith('/settings/access');
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

  it('opens devices from the Home Assistant group and comes back to the overview', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          haDeviceRegistry={[{ id: 'kitchen-light', name: 'Luce cucina' }]}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Dispositivi / }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/devices');

    rerender(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/devices" onNavigate={onNavigate} />
      </DashboardSecurityProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/settings');
  });

  it('keeps layout actions and sharing on the Dashboard page', () => {
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/dashboard"
          managedSectionContent={<div>Azioni del layout</div>}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Azioni del layout')).toBeTruthy();
  });

  it('brings sharing and layout versions back to the Dashboard page', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/access/sharing"
          onNavigate={onNavigate}
          managedSectionContent={<div>Condivisione</div>}
        />
      </DashboardSecurityProvider>,
    );

    let back = screen.getByRole('button', { name: 'Indietro' });
    expect(back.textContent).toContain('Dashboard');
    fireEvent.click(back);
    expect(onNavigate).toHaveBeenLastCalledWith('/settings/dashboard');

    rerender(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/data/history" onNavigate={onNavigate} />
      </DashboardSecurityProvider>,
    );
    back = screen.getByRole('button', { name: 'Indietro' });
    fireEvent.click(back);
    expect(onNavigate).toHaveBeenLastCalledWith('/settings/dashboard');
  });

  it('starts the Home Assistant backup from Data and backup', () => {
    const onCallService = vi.fn(async () => true);
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          onCallService={onCallService}
          navigationRoute="/settings/data"
          managedSectionContent={<div>Esportazione</div>}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Backup di Home Assistant' })).toBeTruthy();
    expect(screen.getByText('Esportazione')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Forza backup ora' }));
    expect(onCallService).toHaveBeenCalledWith('backup', 'create', {});
  });

  it('shows the latest backup on the system page without its actions', () => {
    const onNavigate = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/system" onNavigate={onNavigate} />
      </DashboardSecurityProvider>,
    );

    const backup = screen.getByRole('button', { name: /Ultimo backup/ });
    expect(backup.textContent).toContain('Nessun backup rilevato');
    expect(screen.queryByRole('button', { name: 'Forza backup ora' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Modalità sviluppatore' })).toBeNull();
    fireEvent.click(backup);
    expect(onNavigate).toHaveBeenCalledWith('/settings/data');
  });

  it('groups the system status and shows only the values Home Assistant reports', () => {
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
          haStates={{
            'sensor.processor_use': { state: '23', unit: '%' },
            'sensor.memory_use_percent': { state: '48', unit: '%' },
            'update.home_assistant_core_update': {
              state: 'on',
              rawAttributes: { installed_version: '2026.2.3', latest_version: '2026.3.0' },
            },
          }}
        />
      </DashboardSecurityProvider>,
    );

    const groups = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(groups).toEqual(['Aggiornamenti', 'Salute', 'Backup', 'Riavvio e spegnimento']);
    expect(screen.getByRole('button', { name: /Home Assistant Core/ }).textContent).toContain('2026.2.3 → 2026.3.0');
    expect(screen.getByRole('button', { name: 'Aggiorna tutto (1)' })).toBeTruthy();
    expect(screen.getByText('Processore')).toBeTruthy();
    expect(screen.getByText('Memoria')).toBeTruthy();
    // No disk, temperature or network sensor: no empty placeholders.
    expect(screen.queryByText('Spazio su disco')).toBeNull();
    expect(screen.queryByText(/Temperatura/)).toBeNull();
    expect(screen.queryByText('Rete')).toBeNull();
  });

  it('lists at most four updates and opens the update center for the rest', () => {
    const pending = Object.fromEntries(
      ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map((name) => [
        `update.${name}`,
        { state: 'on', rawAttributes: { installed_version: '1.0', latest_version: '2.0' } },
      ]),
    );
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
          haStates={{ ...pending, 'update.zulu': { state: 'off', rawAttributes: { installed_version: '3.0' } } }}
        />
      </DashboardSecurityProvider>,
    );

    const updates = within(screen.getByRole('heading', { name: 'Aggiornamenti' }).closest('section')!);
    expect(updates.getAllByText('1.0 → 2.0')).toHaveLength(4);
    expect(updates.getByText('Un componente aggiornato')).toBeTruthy();
    fireEvent.click(updates.getByRole('button', { name: /Altri 2 aggiornamenti disponibili/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('explains how to get the system health when no sensor is available', () => {
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/system" />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByText('Telemetria non disponibile')).toBeTruthy();
    expect(screen.getByText(/System Monitor/)).toBeTruthy();
  });

  it('restarts Home Assistant only after the confirmation', () => {
    const onCallService = vi.fn(async () => true);
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard {...baseProps} onCallService={onCallService} navigationRoute="/settings/system" />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Riavvia Home Assistant/ }));
    expect(screen.getByRole('heading', { name: 'Riavviare Home Assistant?' })).toBeTruthy();
    expect(onCallService).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onCallService).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Spegni sistema/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));
    expect(onCallService).toHaveBeenCalledWith('hassio', 'host_shutdown', {});
  });

  it('downloads aggregate support diagnostics from Advanced and support', () => {
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

    expect(screen.getByRole('heading', { name: 'Avanzate e supporto' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Apri una segnalazione/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Scarica diagnostica' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Scarica diagnostica' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/Diagnostica scaricata/),
    ).toBeTruthy();
  });

  it('hides the card sizing engine selector from Advanced settings until Developer Mode is enabled', () => {
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/advanced"
          developerMode={false}
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.queryByRole('switch', { name: /Dimensionamento adattivo/ })).toBeNull();
  });

  it('lets developers switch the local card sizing engine from Advanced settings', () => {
    const onCardSizingEngineChange = vi.fn();
    render(
      <DashboardSecurityProvider value={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/advanced"
          developerMode
          cardSizingEngine="adaptive"
          onCardSizingEngineChange={onCardSizingEngineChange}
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('switch', { name: /Dimensionamento adattivo/ }));

    expect(onCardSizingEngineChange).toHaveBeenCalledWith('legacy');
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
