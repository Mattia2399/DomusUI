// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateConsumption } from '../../i18n/consumptionCopy';

/*
 * The Water and Gas charts load on demand (docs/performance-energy-bundle.md):
 * the rest of the detail is there at once, the chart space waits for them,
 * a failure stays inside that space, and leaving never waits for a chart.
 */

const CHARTS = './consumptionCharts';

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function renderGas() {
  const { GasDetail } = await import('./GasDetail');
  return render(<GasDetail title="Dettaglio Gas" interval="30G" onIntervalChange={vi.fn()} onBack={vi.fn()} />);
}

describe('LazyConsumptionChart', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock(CHARTS);
    vi.restoreAllMocks();
  });

  it('shows the detail at once and the chart once its code has arrived', async () => {
    const arrival = deferred();
    const loaded = vi.fn();
    vi.doMock(CHARTS, async () => {
      await arrival.promise;
      loaded();
      return vi.importActual(CHARTS);
    });
    const { container } = await renderGas();

    expect(screen.getByRole('heading', { name: 'Dettaglio Gas' })).toBeTruthy();
    expect(screen.getByText('Consumo mensile')).toBeTruthy();
    expect(screen.getByText('Anteprima dimostrativa.')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Caricamento del grafico…' })).toBeTruthy();
    expect(loaded).not.toHaveBeenCalled();
    expect(container.querySelector('.recharts-responsive-container')).toBeNull();

    arrival.release();
    await waitFor(() => expect(container.querySelector('.recharts-responsive-container')).not.toBeNull());
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status', { name: 'Caricamento del grafico…' })).toBeNull();
  });

  it('keeps a chart that cannot load inside its card, with the reload offer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock(CHARTS, () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const { preloadTranslationCatalog } = await import('../../i18n/I18nProvider');
    await preloadTranslationCatalog('it');
    await renderGas();

    expect(await screen.findByText('Grafico non caricato')).toBeTruthy();
    // The rest of the detail stays usable, and no page error screen replaces it.
    expect(screen.getByRole('heading', { name: 'Dettaglio Gas' })).toBeTruthy();
    expect(screen.getByText('Anteprima dimostrativa.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Torna a Consumi' })).toBeTruthy();
    expect(screen.queryByText('Contenuto non caricato')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ricarica Domus UI' })).toBeTruthy();
  });

  it('reloads when asked after a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock(CHARTS, () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const [{ LazyConsumptionChart }, { preloadTranslationCatalog }] = await Promise.all([
      import('./LazyConsumptionChart'),
      import('../../i18n/I18nProvider'),
    ]);
    await preloadTranslationCatalog('it');
    const onReload = vi.fn();
    render(
      <div style={{ height: 200 }}>
        <LazyConsumptionChart onReload={onReload}>{({ GasMonthChart }) => <GasMonthChart data={[]} />}</LazyConsumptionChart>
      </div>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ricarica Domus UI' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('leaves a detail at once even while its chart is still loading', async () => {
    vi.doMock(CHARTS, () => new Promise(() => undefined));
    const { ConsumptionDashboardPage } = await import('../Consumi');
    window.history.replaceState({}, '', '/consumi/gas');
    render(
      <ConsumptionDashboardPage
        embedded
        energy={{ callApi: vi.fn().mockResolvedValue(null), mode: 'real', connected: true, canManage: true, haStates: {} }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Dettaglio Gas' })).toBeTruthy();

    await act(async () => {
      window.history.pushState({}, '', '/consumi');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('heading', { name: 'Consumi' })).toBeTruthy();
  });

  it('has its words in every language', () => {
    expect(translateConsumption('en', 'Grafico non caricato')).toBe('Chart could not be loaded');
    expect(translateConsumption('fr', 'Grafico non caricato')).toBe('Graphique non chargé');
    expect(translateConsumption('en', 'Caricamento del grafico…')).toBe('Loading chart…');
    expect(translateConsumption('fr', 'Caricamento del grafico…')).toBe('Chargement du graphique…');
  });
});
