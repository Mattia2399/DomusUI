import React from 'react';
import { Check, DoorClosed, Flame, Droplets } from 'lucide-react';
import { GlassBattery } from '../../../components/ui/GlassBattery';
import { GlassConnection } from '../../../components/ui/GlassConnection';
import { GlassGauge } from '../../../components/ui/GlassGauge';
import { GlassHumidity } from '../../../components/ui/GlassHumidity';
import { GlassIconStatus } from '../../../components/ui/GlassIconStatus';
import { GlassLed } from '../../../components/ui/GlassLed';
import { GlassLevel } from '../../../components/ui/GlassLevel';
import { GlassMiniRing } from '../../../components/ui/GlassMiniRing';
import { GlassProgressBar } from '../../../components/ui/GlassProgressBar';
import { GlassRadialGauge } from '../../../components/ui/GlassRadialGauge';
import { GlassStatusBadge } from '../../../components/ui/GlassStatusBadge';
import { GlassStatusGlow } from '../../../components/ui/GlassStatusGlow';
import { GlassTemperature } from '../../../components/ui/GlassTemperature';
import { GlassTrend } from '../../../components/ui/GlassTrend';
import { GlassValueDisplay } from '../../../components/ui/GlassValueDisplay';
import { GlassValuePill } from '../../../components/ui/GlassValuePill';
import { LabCard, LabHero, LabNamed } from './labShared';

type Form = { size: 'compact' | 'group' | 'hero' };

function Forms({ id, title, children, make }: { id: string; title: string; children?: React.ReactNode; make: (form: Form) => React.ReactNode }) {
  return (
    <LabCard id={id} title={title}>
      <LabNamed name="compatta">{make({ size: 'compact' })}</LabNamed>
      <LabNamed name="di gruppo">{make({ size: 'group' })}</LabNamed>
      {children}
      <LabHero>{make({ size: 'hero' })}</LabHero>
    </LabCard>
  );
}

const ZONES = [
  { from: 0, to: 200, meaning: 'ok' as const },
  { from: 200, to: 240, meaning: 'warn' as const },
  { from: 240, to: 300, meaning: 'bad' as const },
];

export function LabIndicators() {
  return (
    <>
      <Forms id="IND-01" title="GlassValueDisplay" make={(form) => <GlassValueDisplay value={148} unit="°C" status="Normale" meaning="ok" {...form} />} />
      <Forms id="IND-02" title="GlassValuePill" make={(form) => <GlassValuePill label="Acqua" value="62°" icon={<Droplets size={14} />} meaning="info" {...form} />} />
      <Forms id="IND-03" title="GlassStatusBadge" make={(form) => <GlassStatusBadge label="In funzione" meaning="ok" icon={<Check size={14} />} {...form} />}>
        <LabNamed name="i toni">
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <GlassStatusBadge label="Pulizia necessaria" meaning="warn" />
            <GlassStatusBadge label="Blocco fiamma" meaning="bad" />
            <GlassStatusBadge label="Crono attivo" meaning="info" />
            <GlassStatusBadge label="Spenta" />
          </span>
        </LabNamed>
      </Forms>
      <Forms id="IND-04" title="GlassLed" make={(form) => <GlassLed label="Fiamma presente" note="Da 2 ore" meaning="ok" {...form} />}>
        <LabNamed name="lampeggia"><GlassLed label="Accensione in corso" meaning="warn" blink /></LabNamed>
        <LabNamed name="spenta"><GlassLed label="Resistenza" note="spenta" /></LabNamed>
      </Forms>
      <Forms id="IND-05" title="GlassStatusGlow" make={(form) => <GlassStatusGlow title="Serbatoio pellet quasi vuoto" note="18% · circa 3 giorni" meaning="warn" {...form} />} />
      <Forms id="IND-06" title="GlassGauge" make={(form) => <GlassGauge percent={64} value="64%" note="25 min" label="Avanzamento" {...form} />} />
      <Forms id="IND-07" title="GlassRadialGauge" make={(form) => <GlassRadialGauge value={148} min={0} max={300} zones={ZONES} display="148°" note="fumi" label="Fumi" {...form} />} />
      <Forms id="IND-08" title="GlassMiniRing" make={(form) => <GlassMiniRing percent={40} label="Filtro" value="40%" meaning="warn" {...form} />} />
      <Forms id="IND-09" title="GlassProgressBar" make={(form) => <GlassProgressBar percent={46} label="Aggiornamento" value="46%" note="Circa 5 minuti" {...form} />} />
      <Forms id="IND-10" title="GlassProgressBar verticale" make={(form) => <GlassProgressBar percent={70} label="Puffer" value="70%" vertical {...form} />} />
      <Forms id="IND-11" title="GlassBattery" make={(form) => <GlassBattery percent={18} label="Sensore finestra" note="Da cambiare presto" {...form} />}>
        <LabNamed name="quasi scarica"><GlassBattery percent={6} /></LabNamed>
        <LabNamed name="piena"><GlassBattery percent={92} /></LabNamed>
      </Forms>
      <Forms id="IND-12" title="GlassTemperature" make={(form) => <GlassTemperature value={62} min={30} max={90} ideal={[55, 70]} idealLabel="Ideale 55–70°" {...form} />} />
      <Forms id="IND-13" title="GlassHumidity" make={(form) => <GlassHumidity percent={48} status="Ideale" {...form} />} />
      <Forms id="IND-14" title="GlassLevel" make={(form) => <GlassLevel percent={40} label="Pellet" note="Circa 7 giorni" {...form} />}>
        <LabNamed name="da riempire"><GlassLevel percent={12} label="Pellet" /></LabNamed>
      </Forms>
      <Forms id="IND-15" title="GlassConnection" make={(form) => <GlassConnection bars={3} label="Modulo Wi-Fi" note="Online · -62 dBm" {...form} />}>
        <LabNamed name="offline"><GlassConnection bars={0} label="Modulo Wi-Fi" note="Visto 2 ore fa" /></LabNamed>
      </Forms>
      <Forms id="IND-16" title="GlassTrend" make={(form) => <GlassTrend direction="up" label="+0,6° in un'ora" meaning="warn" {...form} />}>
        <LabNamed name="stabile"><GlassTrend direction="flat" label="Stabile" /></LabNamed>
      </Forms>
      <Forms id="IND-17" title="GlassIconStatus" make={(form) => <GlassIconStatus icon={<DoorClosed size={22} />} title="Finestra sala · Chiusa" note="da 2 ore" meaning="ok" {...form} />}>
        <LabNamed name="allarme"><GlassIconStatus icon={<Flame size={22} />} title="Fumo rilevato" meaning="bad" /></LabNamed>
      </Forms>
    </>
  );
}
