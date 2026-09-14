import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sprout } from 'lucide-react';
import {
  IrrigationConsumptionSnapshotCard,
  IrrigationHero,
  IrrigationMoistureCard,
  IrrigationScheduleSnapshotCard,
  IrrigationUsageCard,
  IrrigationZoneCard,
  IrrigationZonesSnapshotCard,
} from './IrrigationDashboardCards';

afterEach(() => cleanup());

describe('Irrigation dashboard cards', () => {
  it('renders the photographic hero and exposes the operational controls', () => {
    const onPrimaryAction = vi.fn();
    const onRainSensorToggle = vi.fn();

    const { container } = render(
      <IrrigationHero
        masterTitle="Sistema fermo"
        masterIsRunning={false}
        masterIsStopped
        masterIsPaused={false}
        temperature={18}
        humidity={54}
        rainProbability={12}
        rainStatusLabel="Sereno"
        rainSummaryTitle="Nessuna pioggia rilevata"
        rainSummaryDescription="Sensore pioggia disponibile"
        rainSensorEnabled
        rainSensorSyncing={false}
        onRainSensorToggle={onRainSensorToggle}
        onPrimaryAction={onPrimaryAction}
        onStop={vi.fn()}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toContain('irrigation-smart-hero');
    expect(screen.getByRole('heading', { name: 'Il giardino è pronto' })).toBeTruthy();
    expect(screen.getByText('Protezione pioggia')).toBeTruthy();
    expect(screen.getByText('Sensore attivo sui cicli')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Avvia irrigazione' }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it('shows a paused session with a frozen precise countdown and a resume action', () => {
    render(
      <>
        <IrrigationHero
          masterTitle="Sistema in pausa"
          masterIsRunning={false}
          masterIsStopped={false}
          masterIsPaused
          temperature={18}
          humidity={54}
          rainStatusLabel="Sereno"
          rainSummaryTitle="Nessuna pioggia"
          rainSummaryDescription="Sensore disponibile"
          rainSensorEnabled={false}
          rainSensorSyncing={false}
          onRainSensorToggle={vi.fn()}
          onPrimaryAction={vi.fn()}
          onStop={vi.fn()}
        />
        <IrrigationZoneCard
          zone={{
            id: 'north', name: 'Prato Nord', detail: 'Ciclo in pausa', status: 'scheduled',
            progress: 78, icon: Sprout, manualDurationMin: 5, manualRemainingSeconds: 279,
            isManualActive: true, manualSessionState: 'paused', entityId: 'switch.prato_nord',
          }}
          onProgram={vi.fn()}
          onDurationChange={vi.fn()}
          onManualToggle={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText('Ciclo sospeso · tempo residuo conservato')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Riprendi irrigazione' })).toBeTruthy();
    expect(screen.getByText('4:39')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Arresta Prato Nord e azzera il tempo residuo' })).toBeTruthy();
  });

  it('keeps zone, moisture and usage data explicit without inventing measurements', () => {
    const onManualToggle = vi.fn();

    render(
      <>
        <IrrigationMoistureCard value={45} description="Nel range ideale" />
        <IrrigationZoneCard
          zone={{
            id: 'north',
            name: 'Prato Nord',
            detail: 'Pronto',
            status: 'idle',
            progress: 0,
            icon: Sprout,
            manualDurationMin: 15,
            manualRemainingSeconds: 0,
            isManualActive: false,
            entityId: 'switch.prato_nord',
          }}
          onProgram={vi.fn()}
          onDurationChange={vi.fn()}
          onManualToggle={onManualToggle}
        />
        <IrrigationUsageCard
          usage={1240}
          average={1450}
          savingsLabel="-14% Risparmio"
          positiveSavings
          bars={[40, 60, 80]}
        />
      </>,
    );

    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('86%')).toBeTruthy();
    expect(screen.getByText('della media')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Avvia Prato Nord' }));
    expect(onManualToggle).toHaveBeenCalledTimes(1);
  });

  it('summarizes zones and consumption and opens their detailed routes', () => {
    const onOpenZones = vi.fn();
    const onOpenConsumption = vi.fn();

    render(
      <>
        <IrrigationZonesSnapshotCard
          zones={[
            {
              id: 'north',
              name: 'Prato Nord',
              detail: 'Irrigazione in corso',
              status: 'active',
              progress: 50,
              icon: Sprout,
              manualDurationMin: 15,
              manualRemainingSeconds: 420,
              isManualActive: true,
              entityId: 'switch.prato_nord',
            },
          ]}
          nextCycleLabel="Prato Nord · oggi alle 18:30"
          onOpen={onOpenZones}
        />
        <IrrigationConsumptionSnapshotCard
          usage={1240}
          average={1450}
          savingsLabel="-14% Risparmio"
          positiveSavings
          bars={[40, 60, 80, 55, 35, 70, 45]}
          onOpen={onOpenConsumption}
        />
        <IrrigationScheduleSnapshotCard
          items={[{ id: 'north', name: 'Prato Nord', when: 'domani 05:30', durationMin: 15 }]}
          onOpen={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText('Prato Nord · oggi alle 18:30')).toBeTruthy();
    expect(screen.getByText('1 attiva')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apri riepilogo idrico' }).textContent).toContain('1240 L');
    expect(screen.getByText('domani 05:30')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apri riepilogo settori irrigui' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apri riepilogo idrico' }));
    expect(onOpenZones).toHaveBeenCalledTimes(1);
    expect(onOpenConsumption).toHaveBeenCalledTimes(1);
  });
});
