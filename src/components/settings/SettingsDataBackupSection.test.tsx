import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import {
  createDashboardSecurityValue,
} from '../../security/dashboardAccess';
import { SensitiveActionGateProvider } from '../../security/SensitiveActionGate';
import SettingsDataBackupSection from './SettingsDataBackupSection';
import { defaultAccessFor } from '../../test/accessFixtures';
import { AccessTestProviders } from '../../test/AccessTestProviders';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });
beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const ownerSecurity = createDashboardSecurityValue({
  runtimeMode: 'real',
  haStatus: 'connected',
  user: { id: 'owner-1', isOwner: true },
  access: defaultAccessFor({ id: 'owner-1', isOwner: true }),
});

const limitedSecurity = createDashboardSecurityValue({
  runtimeMode: 'real',
  haStatus: 'connected',
  user: { id: 'limited-1' },
  access: defaultAccessFor({ id: 'limited-1' }),
});

const baseProps = {
  appearance: 'dark' as const,
  scope: 'all' as 'all' | 'layout' | 'data',
  onDownloadBackup: vi.fn(),
  onRestoreBackup: vi.fn(async () => undefined),
  onResetAll: vi.fn(async () => undefined),
  onRestoreStarterTemplate: undefined as (() => Promise<void>) | undefined,
  onOpenLayoutVersions: undefined as (() => void) | undefined,
  onOpenSharing: undefined as (() => void) | undefined,
};

function renderSection({
  security = ownerSecurity,
  props = {},
}: {
  security?: typeof ownerSecurity;
  props?: Partial<typeof baseProps>;
} = {}) {
  return render(
    <AccessTestProviders security={security}>
      <SensitiveActionGateProvider user={{ id: security.user?.id ?? 'test-user' }}>
        <SettingsDataBackupSection {...baseProps} {...props} />
      </SensitiveActionGateProvider>
    </AccessTestProviders>,
  );
}

describe('SettingsDataBackupSection', () => {
  it('shows administrative actions only when the centralized policy allows them', () => {
    renderSection({ security: limitedSecurity });

    expect(screen.queryByRole('button', { name: 'Scarica backup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ripristina da file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset totale' })).toBeNull();
  });

  it('keeps the download controlled by the parent and leaves Developer Mode to Advanced', () => {
    const onDownloadBackup = vi.fn();
    renderSection({ props: { onDownloadBackup } });

    fireEvent.click(screen.getByRole('button', { name: 'Scarica backup' }));

    expect(onDownloadBackup).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('switch', { name: 'Modalità sviluppatore' })).toBeNull();
  });

  it('shows only the layout actions on the Dashboard page', () => {
    const onOpenSharing = vi.fn();
    renderSection({
      props: {
        scope: 'layout',
        onRestoreStarterTemplate: vi.fn(async () => undefined),
        onOpenLayoutVersions: vi.fn(),
        onOpenSharing,
      },
    });

    expect(screen.getByRole('button', { name: /Ripristina layout iniziale/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Versioni del layout/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Scarica backup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset totale' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Condividi dashboard/ }));
    expect(onOpenSharing).toHaveBeenCalledTimes(1);
  });

  it('shows only export, restore and reset on Data and backup', () => {
    renderSection({
      props: {
        scope: 'data',
        onRestoreStarterTemplate: vi.fn(async () => undefined),
        onOpenLayoutVersions: vi.fn(),
      },
    });

    expect(screen.getByRole('button', { name: 'Scarica backup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset totale' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ripristina layout iniziale/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Versioni del layout/ })).toBeNull();
  });

  it('opens the shared layout version history from data settings', () => {
    const onOpenLayoutVersions = vi.fn();
    renderSection({ props: { onOpenLayoutVersions } });

    fireEvent.click(screen.getByRole('button', { name: /Versioni del layout/ }));
    expect(onOpenLayoutVersions).toHaveBeenCalledTimes(1);
  });

  it('requires sensitive confirmation before restoring a backup', async () => {
    const onRestoreBackup = vi.fn(async () => undefined);
    const { container } = renderSection({ props: { onRestoreBackup } });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(['{"version":1}'], 'backup.json', { type: 'application/json' });

    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByRole('heading', { name: 'Ripristinare questo backup?' })).toBeTruthy();
    expect(onRestoreBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(onRestoreBackup).toHaveBeenCalledWith(file));
  });

  it('requires the RESET phrase before invoking a total reset', async () => {
    const onResetAll = vi.fn(async () => undefined);
    renderSection({ props: { onResetAll } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset totale' }));
    expect(await screen.findByRole('heading', { name: 'Ripristinare Domus UI?' })).toBeTruthy();

    const confirmButton = screen.getByRole('button', { name: 'Conferma' });
    expect(confirmButton.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RESET' } });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onResetAll).toHaveBeenCalledTimes(1));
  });

  it('restores the starter template only after sensitive confirmation', async () => {
    const onRestoreStarterTemplate = vi.fn(async () => undefined);
    renderSection({ props: { onRestoreStarterTemplate } });

    fireEvent.click(screen.getByRole('button', { name: /Ripristina layout iniziale/ }));
    expect(await screen.findByRole('heading', { name: 'Ripristinare il layout iniziale?' })).toBeTruthy();
    expect(onRestoreStarterTemplate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(onRestoreStarterTemplate).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Layout iniziale ripristinato.')).toBeTruthy();
  });

  it('shows non-dismissible reset progress reported by the persistence layer', async () => {
    let releaseReset: (() => void) | undefined;
    const onResetAll = vi.fn(async (reportProgress?: (stage: 'clearing_history') => void) => {
      reportProgress?.('clearing_history');
      await new Promise<void>((resolve) => {
        releaseReset = resolve;
      });
    });
    renderSection({ props: { onResetAll } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset totale' }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'RESET' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));

    expect(await screen.findByRole('heading', { name: 'Ripristino di Domus UI' })).toBeTruthy();
    expect(screen.getByText('Eliminazione delle versioni')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Avanzamento reset' }).getAttribute('aria-valuenow'))
      .toBe('35');
    expect(screen.queryByRole('button', { name: /chiudi/i })).toBeNull();

    releaseReset?.();
  });
});
