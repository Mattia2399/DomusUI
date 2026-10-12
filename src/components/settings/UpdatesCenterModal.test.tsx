import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import UpdatesCenterModal, { type UpdateEntity } from './UpdatesCenterModal';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const core: UpdateEntity = {
  entityId: 'update.core',
  title: 'Home Assistant Core',
  available: true,
  installed: '2026.2.3',
  latest: '2026.3.0',
  releaseSummary: 'Nuove dashboard e correzioni.',
  releaseUrl: 'https://www.home-assistant.io/blog/2026/03/04/release-20263/',
  supportsBackup: true,
};
const esphome: UpdateEntity = { entityId: 'update.esphome', title: 'ESPHome', available: true, installed: '1.0', latest: '2.0' };
const mosquitto: UpdateEntity = {
  entityId: 'update.mosquitto',
  title: 'Mosquitto broker',
  available: false,
  installed: '6.4',
  latest: '6.5',
  skippedVersion: '6.5',
};

function renderCenter(props: Partial<Parameters<typeof UpdatesCenterModal>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onInstall: vi.fn(async () => true),
    onSkip: vi.fn(async () => true),
    onClearSkipped: vi.fn(async () => true),
    onUpdateAll: vi.fn(),
  };
  render(
    <UpdatesCenterModal
      isOpen
      updates={[core, esphome]}
      skipped={[mosquitto]}
      isConnected
      isBusy={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('UpdatesCenterModal', () => {
  it('installs one component from its own button', async () => {
    const { onInstall } = renderCenter();

    expect(screen.getByText('2 aggiornamenti disponibili')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna ESPHome' }));

    await waitFor(() => expect(onInstall).toHaveBeenCalledWith('update.esphome', undefined));
  });

  it('shows the release notes and backs up first when asked', async () => {
    const { onInstall } = renderCenter();

    fireEvent.click(screen.getByRole('button', { name: /Home Assistant Core/, expanded: false }));
    expect(screen.getByText('Nuove dashboard e correzioni.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Note di rilascio/ }).getAttribute('href')).toContain('release-20263');
    fireEvent.click(screen.getByRole('switch', { name: 'Backup prima di aggiornare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna Home Assistant Core' }));

    await waitFor(() => expect(onInstall).toHaveBeenCalledWith('update.core', { backup: true }));
  });

  it('offers the backup only to components that support it', () => {
    renderCenter();

    fireEvent.click(screen.getByRole('button', { name: /ESPHome/, expanded: false }));
    expect(screen.queryByRole('switch', { name: 'Backup prima di aggiornare' })).toBeNull();
  });

  it('skips a version and offers a skipped one again', async () => {
    const { onSkip, onClearSkipped } = renderCenter();

    fireEvent.click(screen.getByRole('button', { name: /ESPHome/, expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Salta questa versione' }));
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith('update.esphome'));

    expect(screen.getByText('Versione 6.5 saltata')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ripristina Mosquitto broker' }));
    await waitFor(() => expect(onClearSkipped).toHaveBeenCalledWith('update.mosquitto'));
  });

  it('shows the progress of an update being installed', () => {
    renderCenter({ updates: [{ ...core, inProgress: true, percentage: 40 }] });

    expect(screen.getByText('Aggiornamento in corso · 40%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aggiorna Home Assistant Core' })).toBeNull();
    // A single update has its own button: no "update all".
    expect(screen.queryByRole('button', { name: /Aggiorna tutto/ })).toBeNull();
  });

  it('says everything is up to date and still lists skipped versions', () => {
    renderCenter({ updates: [] });

    expect(screen.getAllByText('Tutto aggiornato').length).toBeGreaterThan(0);
    expect(screen.getByText('Versioni saltate')).toBeTruthy();
  });
});
