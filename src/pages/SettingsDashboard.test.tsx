import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../i18n/I18nProvider';
import {
  createDashboardSecurityValue,
} from '../security/dashboardAccess';
import SettingsDashboard from './SettingsDashboard';
import { accessFor, defaultAccessFor } from '../test/accessFixtures';
import { AccessTestProviders } from '../test/AccessTestProviders';

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
  access: defaultAccessFor({ id: 'owner-1', isOwner: true }),
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
  appearanceMode: 'auto' as const,
  onAppearanceModeChange: vi.fn(),
  background: 'neutral' as const,
  onBackgroundChange: vi.fn(),
};

// Compiling a lazy part on its first import can take longer than a test waits for it: it happens here, off the clock.
beforeAll(async () => {
  await Promise.all([
    import('../components/settings/SettingsMiniSparkline'),
    import('../components/settings/KioskSettings'),
    import('../components/settings/ScreensaverSettings'),
    import('../components/settings/DevicePowerSettings'),
  ]);
}, 120_000);

describe('SettingsDashboard', () => {
  it('opens the lazy Climate shell as a house setting without controlling entities', async () => {
    const onCallService = vi.fn(async () => true);
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} onCallService={onCallService} onCallApi={async <T,>() => ({ state: 'absent', revision: 0, config: null }) as T} navigationRoute="/settings/climate" />
      </AccessTestProviders>,
    );
    expect(screen.getByRole('heading', { name: 'Clima' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Clima non ancora configurato')).toBeTruthy(), { timeout: 10_000 });
    fireEvent.click(screen.getByRole('button', { name: /Esplora l’anteprima/ }));
    expect(screen.getByText('Anteprima dimostrativa · dati fittizi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apri Camera' }));
    expect(screen.getByText('Questa è la temperatura che Domus userà per decidere per la zona.')).toBeTruthy();
    expect(onCallService).not.toHaveBeenCalled();
  }, 15_000);

  it('lists Power and charging in This device for administrators only', async () => {
    const onNavigate = vi.fn();
    const member = createDashboardSecurityValue({
      runtimeMode: 'real',
      haStatus: 'connected',
      user: { id: 'member-1' },
      access: defaultAccessFor({ id: 'member-1' }),
    });
    const { unmount } = render(
      <AccessTestProviders security={member}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </AccessTestProviders>,
    );
    expect(screen.queryByRole('button', { name: /Alimentazione e ricarica/ })).toBeNull();
    unmount();

    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" onNavigate={onNavigate} />
      </AccessTestProviders>,
    );
    const device = within(screen.getByRole('region', { name: 'Questo dispositivo' }));
    fireEvent.click(device.getByRole('button', { name: /^Alimentazione e ricarica/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/device/power');
  });

  it('lists the Screensaver of this device with its state, for everyone', async () => {
    const onNavigate = vi.fn();
    const member = createDashboardSecurityValue({ runtimeMode: 'real', haStatus: 'connected', user: { id: 'member-1' }, access: defaultAccessFor({ id: 'member-1' }) });
    const { unmount } = render(
      <AccessTestProviders security={member}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" onNavigate={onNavigate} />
      </AccessTestProviders>,
    );
    const row = within(screen.getByRole('region', { name: 'Questo dispositivo' })).getByRole('button', { name: /^Screensaver/ });
    expect(row.textContent).toContain('No');
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledWith('/settings/device/screensaver');
    unmount();

    window.localStorage.setItem(
      'domusui.screensaver.v1',
      JSON.stringify({ version: 1, enabled: true, timeoutMinutes: 10, mode: 'minimal', showDate: true }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'domusui.screensaver.v1' }));
    render(
      <AccessTestProviders security={member}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </AccessTestProviders>,
    );
    expect(
      within(screen.getByRole('region', { name: 'Questo dispositivo' })).getByRole('button', { name: /^Screensaver/ }).textContent,
    ).toContain('10 min');
  });

  it('draws the CPU trend of System with the chart library loaded only for it', async () => {
    const { container } = render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
          haStates={{
            'sensor.processor_use': {
              state: '23',
              unit: '%',
              numericValue: 23,
              rawAttributes: { friendly_name: 'Processor use', unit_of_measurement: '%' },
            } as never,
          }}
          sensorHistoryByEntity={{ 'sensor.processor_use': [12, 18, 23, 31] }}
        />
      </AccessTestProviders>,
    );

    // The chart library is a lazy chunk of its own.
    await waitFor(() => expect(container.ownerDocument.querySelector('.recharts-responsive-container')).not.toBeNull(), {
      timeout: 15_000,
    });
  }, 20_000);

  it('opens Kiosk mode as its own page, loaded only then, with the start pages of the navigation', async () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/device/kiosk"
          kioskStartRoutes={[{ path: '/home', label: 'Home' }, { path: '/rooms', label: 'Stanze' }]}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Modalità Kiosk' })).toBeTruthy();
    expect(await screen.findByRole('switch', { name: 'Modalità Kiosk' })).toBeTruthy();
  });

  it('opens the Screensaver as its own page, loaded only then', async () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/device/screensaver" />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Screensaver' })).toBeTruthy();
    expect(await screen.findByRole('switch', { name: 'Screensaver' })).toBeTruthy();
  });

  it('opens Power and charging as its own page, loaded only then', async () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/device/power" />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Alimentazione e ricarica' })).toBeTruthy();
    // Without the bridge capability the page says so and asks nothing.
    expect(await screen.findByText('Gestione alimentazione non disponibile con questa versione di DomusOS.')).toBeTruthy();
  });

  it('renders the overview in English when selected on this device', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'System' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'This device' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'This device' }).getAttribute('aria-describedby')).toBe(
      screen.getByText('Preferences for this device only').id,
    );
    expect(screen.getByRole('button', { name: /^Floors and rooms/ })).toBeTruthy();
  });

  it('opens with the person, then groups the settings by scope', () => {
    const onNavigate = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          account={{ name: 'Mattia', email: 'mattia@example.com', roleLabel: 'Owner' }}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeTruthy();
    const regions = screen.getAllByRole('region');
    expect(regions[0].getAttribute('aria-label')).toBe('Profilo');
    expect(regions.slice(1).map((group) => group.querySelector('h2')?.textContent)).toEqual([
      'Casa',
      'Sistema',
      'Questo dispositivo',
    ]);
    expect(screen.getByText('Impostazioni condivise da tutta la casa')).toBeTruthy();
    expect(screen.getByText('Connessione e configurazione di Domus')).toBeTruthy();
    expect(screen.getByText('Preferenze valide solo su questo dispositivo')).toBeTruthy();

    // The account card opens the Profile; My devices is one tap away.
    const profile = within(regions[0]);
    const account = profile.getByRole('button', { name: /Mattia/ });
    expect(account.textContent).toContain('mattia@example.com · Owner');
    fireEvent.click(account);
    expect(onNavigate).toHaveBeenCalledWith('/settings/profile');
    fireEvent.click(profile.getByRole('button', { name: /I miei dispositivi/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/profile/devices');

    const home = within(screen.getByRole('region', { name: 'Casa' }));
    expect(home.getAllByRole('button').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Dashboard'),
      expect.stringContaining('Clima'),
      expect.stringContaining('Piani e stanze'),
      expect.stringContaining('Persone e accessi'),
      expect.stringContaining('Sicurezza'),
      expect.stringContaining('Raccolta rifiuti'),
    ]);
    const system = within(screen.getByRole('region', { name: 'Sistema' }));
    expect(system.getAllByRole('button').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Connessioni'),
      expect.stringContaining('Dispositivi'),
      expect.stringContaining('Entità'),
      expect.stringContaining('Sistema'),
      expect.stringContaining('Dati e backup'),
    ]);
    const device = within(screen.getByRole('region', { name: 'Questo dispositivo' }));
    expect(device.getAllByRole('button').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Aspetto'),
      expect.stringContaining('Lingua'),
      expect.stringContaining('Screensaver'),
      expect.stringContaining('Modalità Kiosk'),
      expect.stringContaining('Alimentazione e ricarica'),
      expect.stringContaining('Avvisi e attenzione'),
      expect.stringContaining('Avanzate e supporto'),
    ]);

    fireEvent.click(home.getByRole('button', { name: /^Clima/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/climate');
    fireEvent.click(home.getByRole('button', { name: /^Piani e stanze/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/floors');
    fireEvent.click(home.getByRole('button', { name: /^Sicurezza/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/safety');
    fireEvent.click(home.getByRole('button', { name: /^Raccolta rifiuti/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/home/waste-collection');
    fireEvent.click(system.getByRole('button', { name: /^Connessioni/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/connections');
    fireEvent.click(system.getByRole('button', { name: /^Entità/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/entities');
    fireEvent.click(device.getByRole('button', { name: /^Aspetto/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/device/appearance');
    fireEvent.click(device.getByRole('button', { name: /^Lingua/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/device/language');
  });

  it('starts with the person instead of a title, and moves them into a bar while scrolling', () => {
    const { container } = render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} account={{ name: 'Mattia' }} navigationRoute="/settings" />
      </AccessTestProviders>,
    );

    // The title stays for assistive technology only; no connection badge.
    expect(screen.getByRole('heading', { name: 'Impostazioni', level: 1 }).className).toContain('sr-only');
    expect(screen.queryByText(/Home Assistant ·/)).toBeNull();

    const bar = screen.getByTestId('settings-account-bar');
    const person = within(screen.getByRole('region', { name: 'Profilo' })).getByRole('button', { name: /Mattia/ });
    expect(bar.getAttribute('data-progress')).toBe('0.00');
    expect(person.style.opacity).toBe('1');

    const scroller = container.querySelector<HTMLElement>('.dashboard-page-scroll')!;
    scroller.scrollTop = 400;
    fireEvent.scroll(scroller);
    expect(bar.getAttribute('data-progress')).toBe('1.00');
    expect(person.style.opacity).toBe('0');
    expect(bar.textContent).toContain('Mattia');
  });

  it('leaves the Energy and Irrigation configuration to their apps, even for an Owner', () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </AccessTestProviders>,
    );

    expect(security.can('manage_energy')).toBe(true);
    expect(screen.queryByRole('button', { name: /Energia/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Irrigazione/ })).toBeNull();
    expect(screen.queryByText(/Impianto, sensori e tariffa|Sorgenti, consumi e regole/)).toBeNull();
  });

  it('shows a member only the entries their current permissions open', () => {
    const member = createDashboardSecurityValue({
      runtimeMode: 'real',
      haStatus: 'connected',
      user: { id: 'member-1' },
      access: defaultAccessFor({ id: 'member-1' }),
    });
    render(
      <AccessTestProviders security={member}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </AccessTestProviders>,
    );

    const cards = (name: string) =>
      within(screen.getByRole('region', { name })).getAllByRole('button').map((card) => card.textContent);
    // What a member's Domus role opens (access-control-capabilities.md): the people of the house,
    // the system status and this device; managing floors, collection, devices or the connection is an administrator's.
    expect(cards('Casa')).toEqual([expect.stringContaining('Clima'), expect.stringContaining('Persone e accessi')]);
    expect(cards('Sistema')).toEqual([expect.stringContaining('Sistema')]);
    expect(cards('Questo dispositivo')).toEqual([
      expect.stringContaining('Aspetto'),
      expect.stringContaining('Lingua'),
      expect.stringContaining('Screensaver'),
      expect.stringContaining('Modalità Kiosk'),
    ]);
  });

  it('changes the theme and background of this device and goes back to Settings', async () => {
    const onNavigate = vi.fn();
    const onAppearanceModeChange = vi.fn();
    const onBackgroundChange = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/device/appearance"
          onNavigate={onNavigate}
          onAppearanceModeChange={onAppearanceModeChange}
          onBackgroundChange={onBackgroundChange}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Aspetto', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('radiogroup', { name: 'Tema del dispositivo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Scuro' }));
    expect(onAppearanceModeChange).toHaveBeenCalledWith('dark');
    fireEvent.click(screen.getByRole('button', { name: /Sunset Amber/ }));
    expect(onBackgroundChange).toHaveBeenCalledWith('sunset-amber');

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/settings');
  });

  it('keeps the language of this device in the same browser preference', async () => {
    const onNavigate = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/device/language" onNavigate={onNavigate} />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Lingua', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Italiano/, pressed: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Auto/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /English/ }));

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'Language', level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/settings');
  });

  it('opens the overview at This device when the Profile links to it', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      render(
        <AccessTestProviders security={security}>
          <SettingsDashboard {...baseProps} navigationRoute="/settings/device" />
        </AccessTestProviders>,
      );

      expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeTruthy();
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('region', { name: 'Questo dispositivo' }));
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
  });

  it('keeps the old house page address on the overview', () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/home" />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeTruthy();
  });

  it('opens the security settings from the Home group', () => {
    const onNavigate = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/safety" onNavigate={onNavigate} />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Sicurezza della casa' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apri il Centro sicurezza/ }));
    expect(onNavigate).toHaveBeenCalledWith('/security');
  });

  it('opens administrative destinations as stable nested URLs', () => {
    const onNavigate = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </AccessTestProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Persone e accessi/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/access');
  });

  it('opens the system page at the top after scrolling the settings overview', () => {
    const { container, rerender } = render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
        />
      </AccessTestProviders>,
    );

    const overviewScroller = container.querySelector<HTMLElement>('.dashboard-page-scroll');
    expect(overviewScroller).toBeTruthy();
    overviewScroller!.scrollTop = 420;

    rerender(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
        />
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </AccessTestProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Avvisi e attenzione/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/attention');

    rerender(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/attention"
          onNavigate={onNavigate}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Avvisi e attenzione' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Mostra il Centro Attenzione' })).toBeTruthy();
  });

  it('renders managed settings inside the routed page instead of opening a popup', () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/access"
          managedSectionContent={<div>Contenuto membri incorporato</div>}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Persone e accessi' })).toBeTruthy();
    expect(screen.getByText('Contenuto membri incorporato')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders house access subpages with a single page header that goes back to access', () => {
    const onNavigate = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/access/members"
          onNavigate={onNavigate}
          managedSectionContent={<div>Elenco membri</div>}
        />
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
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
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Versioni del layout' })).toBeTruthy();
    expect(screen.getByText('Versione 2')).toBeTruthy();
    expect(screen.getByText('Attuale')).toBeTruthy();
  });

  it('opens devices from the System group and comes back to the overview', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          haDeviceRegistry={[{ id: 'kitchen-light', name: 'Luce cucina' }]}
          navigationRoute="/settings"
          onNavigate={onNavigate}
        />
      </AccessTestProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Dispositivi / }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/devices');

    rerender(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/devices" onNavigate={onNavigate} />
      </AccessTestProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/settings');
  });

  it('keeps layout actions and sharing on the Dashboard page', () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/dashboard"
          managedSectionContent={<div>Azioni del layout</div>}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Azioni del layout')).toBeTruthy();
  });

  it('brings sharing and layout versions back to the Dashboard page', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/access/sharing"
          onNavigate={onNavigate}
          managedSectionContent={<div>Condivisione</div>}
        />
      </AccessTestProviders>,
    );

    let back = screen.getByRole('button', { name: 'Indietro' });
    expect(back.textContent).toContain('Dashboard');
    fireEvent.click(back);
    expect(onNavigate).toHaveBeenLastCalledWith('/settings/dashboard');

    rerender(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/data/history" onNavigate={onNavigate} />
      </AccessTestProviders>,
    );
    back = screen.getByRole('button', { name: 'Indietro' });
    fireEvent.click(back);
    expect(onNavigate).toHaveBeenLastCalledWith('/settings/dashboard');
  });

  it('starts the Home Assistant backup from Data and backup', () => {
    const onCallService = vi.fn(async () => true);
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          onCallService={onCallService}
          navigationRoute="/settings/data"
          managedSectionContent={<div>Esportazione</div>}
        />
      </AccessTestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Backup di Home Assistant' })).toBeTruthy();
    expect(screen.getByText('Esportazione')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Forza backup ora' }));
    expect(onCallService).toHaveBeenCalledWith('backup', 'create', {});
  });

  it('shows the latest backup on the system page without its actions', () => {
    const onNavigate = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/system" onNavigate={onNavigate} />
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
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
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
          haStates={{ ...pending, 'update.zulu': { state: 'off', rawAttributes: { installed_version: '3.0' } } }}
        />
      </AccessTestProviders>,
    );

    const updates = within(screen.getByRole('heading', { name: 'Aggiornamenti' }).closest('section')!);
    expect(updates.getAllByText('1.0 → 2.0')).toHaveLength(4);
    expect(updates.getByText('Un componente aggiornato')).toBeTruthy();
    fireEvent.click(updates.getByRole('button', { name: /Altri 2 aggiornamenti disponibili/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('counts skipped versions apart from the components up to date', () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/system"
          haStates={{
            'update.mosquitto': { state: 'off', rawAttributes: { installed_version: '6.4', latest_version: '6.5', skipped_version: '6.5' } },
            'update.esphome': { state: 'off', rawAttributes: { installed_version: '2.0', latest_version: '2.0' } },
          }}
        />
      </AccessTestProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Una versione saltata/ }));
    expect(screen.getByText('Versione 6.5 saltata')).toBeTruthy();
    expect(screen.getAllByText('Aggiornato · 2.0')).toHaveLength(1);
  });

  it('explains how to get the system health when no sensor is available', () => {
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings/system" />
      </AccessTestProviders>,
    );

    expect(screen.getByText('Telemetria non disponibile')).toBeTruthy();
    expect(screen.getByText(/System Monitor/)).toBeTruthy();
  });

  it('restarts Home Assistant only after the confirmation', () => {
    const onCallService = vi.fn(async () => true);
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} onCallService={onCallService} navigationRoute="/settings/system" />
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/advanced"
        />
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/advanced"
          developerMode={false}
        />
      </AccessTestProviders>,
    );

    expect(screen.queryByRole('switch', { name: /Dimensionamento adattivo/ })).toBeNull();
  });

  it('lets developers switch the local card sizing engine from Advanced settings', () => {
    const onCardSizingEngineChange = vi.fn();
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/settings/advanced"
          developerMode
          cardSizingEngine="adaptive"
          onCardSizingEngineChange={onCardSizingEngineChange}
        />
      </AccessTestProviders>,
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
      <AccessTestProviders security={security}>
        <SettingsDashboard
          {...baseProps}
          navigationRoute="/support"
          onNavigate={onNavigate}
        />
      </AccessTestProviders>,
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
    expect(onNavigate).toHaveBeenCalledWith('/settings/profile');
  });
  it('lets every signed-in account sign out, whatever its role, after a confirmation', async () => {
    const onSignOut = vi.fn();
    const member = createDashboardSecurityValue({
      runtimeMode: 'real',
      haStatus: 'connected',
      user: { id: 'member-1' },
      access: accessFor('wall_panel', { userId: 'member-1' }),
    });
    const { unmount } = render(
      <AccessTestProviders security={member}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" onSignOut={onSignOut} />
      </AccessTestProviders>,
    );
    // A panel account has no profile of its own: no My devices, but signing out is always there.
    expect(screen.queryByRole('button', { name: /I miei dispositivi/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Esci/ }));
    const confirm = within(screen.getByRole('dialog'));
    fireEvent.click(confirm.getByRole('button', { name: 'Esci' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    unmount();

    // Inside the Home Assistant panel the session is Home Assistant's: Domus offers nothing to sign out.
    render(
      <AccessTestProviders security={security}>
        <SettingsDashboard {...baseProps} navigationRoute="/settings" />
      </AccessTestProviders>,
    );
    expect(screen.queryByRole('button', { name: /^Esci/ })).toBeNull();
  });
});
