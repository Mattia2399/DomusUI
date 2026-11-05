import React from 'react';
import { GlassAreaChart } from '../../../components/ui/GlassAreaChart';
import { GlassBarChart } from '../../../components/ui/GlassBarChart';
import { GlassCompareChart } from '../../../components/ui/GlassCompareChart';
import { GlassHistoryChart } from '../../../components/ui/GlassHistoryChart';
import { GlassLineChart } from '../../../components/ui/GlassLineChart';
import { GlassMultiChart } from '../../../components/ui/GlassMultiChart';
import { GlassSparkline } from '../../../components/ui/GlassSparkline';
import { GlassStats } from '../../../components/ui/GlassStats';
import { LabCard, LabHero, LabNamed } from './labShared';

type Form = { size: 'compact' | 'group' | 'hero' };
const POINTS = [58, 60, 61, 59, 57, 60, 62, 64, 63, 61, 60, 62];
const HOURS = [1, 1.4, 0.8, 0.6, 0.5, 1.8, 3.1, 2.4, 1.2, 0.9, 1.1, 2.2, 1.6, null, null, null, null, null];
const AXIS = ['0:00', '6:00', '12:00', '18:00', 'ora'];

function Forms({ id, title, make }: { id: string; title: string; make: (form: Form) => React.ReactNode }) {
  return (
    <LabCard id={id} title={title}>
      <LabNamed name="compatta">{make({ size: 'compact' })}</LabNamed>
      <LabNamed name="di gruppo">{make({ size: 'group' })}</LabNamed>
      <LabHero>{make({ size: 'hero' })}</LabHero>
    </LabCard>
  );
}

export function LabCharts() {
  return (
    <>
      <Forms id="CH-01" title="GlassSparkline" make={(form) => <GlassSparkline points={POINTS} title="Acqua oggi" value="62 °C" {...form} />} />
      <Forms id="CH-02" title="GlassLineChart" make={(form) => <GlassLineChart points={POINTS} title="Ultime 24 ore" value="21,4°" axis={AXIS} {...form} />} />
      <Forms id="CH-03" title="GlassAreaChart" make={(form) => <GlassAreaChart points={POINTS} band={[59, 61]} title="Umidità oggi" value="48%" {...form} />} />
      <Forms id="CH-04" title="GlassBarChart" make={(form) => <GlassBarChart bars={HOURS} current={12} title="Consumo per ora" value="6,4 kWh" {...form} />} />
      <Forms id="CH-05" title="GlassHistoryChart" make={(form) => <GlassHistoryChart ariaLabel="Periodo" title="Storico fumi" periods={[{ id: 'day', label: '24 ore', points: POINTS, note: 'ultime 24 ore' }, { id: 'week', label: '7 giorni', points: POINTS.slice(0, 7), note: 'ultimi 7 giorni' }, { id: 'month', label: '30 giorni', points: [], note: 'ultimi 30 giorni' }]} emptyLabel="Nessun dato" {...form} />} />
      <Forms id="CH-06" title="GlassMultiChart, solo qui: più entità" make={(form) => <GlassMultiChart ariaLabel="Acqua" title="Acqua" series={[{ id: 'in', label: 'Mandata', points: POINTS }, { id: 'out', label: 'Ritorno', points: POINTS.map((point) => point - 6) }, { id: 'acs', label: 'Boiler ACS', points: POINTS.map((point) => point - 12 + (point % 3)) }]} {...form} />} />
      <Forms id="CH-07" title="GlassCompareChart" make={(form) => <GlassCompareChart current={{ label: 'Oggi', value: 6.2, text: '6,2 kg' }} previous={{ label: 'Ieri', value: 7, text: '7,0 kg' }} difference="−11% rispetto a ieri" lowerIsBetter {...form} />} />
      <Forms id="CH-08" title="GlassStats" make={(form) => <GlassStats title="Oggi" items={[{ label: 'Minimo', value: '19,3°' }, { label: 'Massimo', value: '21,8°' }, { label: 'Media', value: '20,6°' }]} {...form} />} />
      <LabCard id="CH-empty" title="Senza dati">
        <LabNamed name="linea"><GlassLineChart points={[]} title="Ultime 24 ore" emptyLabel="Nessun dato" size="compact" /></LabNamed>
        <LabNamed name="barre"><GlassBarChart bars={[]} title="Consumo" emptyLabel="Nessun dato" size="compact" /></LabNamed>
      </LabCard>
    </>
  );
}
