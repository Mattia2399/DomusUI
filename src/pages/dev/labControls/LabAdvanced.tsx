import React from 'react';
import { GlassCountdown } from '../../../components/ui/GlassCountdown';
import { GlassCurveEditor } from '../../../components/ui/GlassCurveEditor';
import { GlassFanSpeed } from '../../../components/ui/GlassFanSpeed';
import { GlassJoystick } from '../../../components/ui/GlassJoystick';
import { LabCard, LabHero, LabNamed } from './labShared';

type Form = { size: 'compact' | 'group' | 'hero' };
const NOOP = () => undefined;
const SPEEDS = ['auto', '1', '2', '3', '4'].map((value) => ({ value, label: value === 'auto' ? 'Auto' : value }));

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

export function LabAdvanced() {
  const [curve, setCurve] = React.useState([{ id: 'a', label: '−10°', ariaLabel: 'Mandata a −10°', value: 68 }, { id: 'b', label: '0°', ariaLabel: 'Mandata a 0°', value: 58 }, { id: 'c', label: '10°', ariaLabel: 'Mandata a 10°', value: 45 }, { id: 'd', label: '20°', ariaLabel: 'Mandata a 20°', value: 32 }]);
  const [speed, setSpeed] = React.useState('2');
  const [finishesAt] = React.useState(() => Date.now() + 246000);
  return (
    <>
      <Forms id="ADV-04" title="GlassJoystick" make={(form) => <GlassJoystick label="Brandeggio" status="fermo" onMove={NOOP} onRelease={NOOP} {...form} />} />
      <Forms id="ADV-06" title="GlassCurveEditor, solo qui: più entità" make={(form) => <GlassCurveEditor points={curve} min={20} max={80} format={(value) => `${value}°`} onChange={(id, value) => setCurve((current) => current.map((point) => (point.id === id ? { ...point, value } : point)))} {...form} />} />
      <Forms id="ADV-08" title="GlassCountdown" make={(form) => <GlassCountdown finishesAt={finishesAt} total={600} label="Timer cucina" note="in corso" {...form} />}>
        <LabNamed name="in pausa"><GlassCountdown remaining={246} total={600} label="Riprendi" note="in pausa" onToggle={NOOP} size="compact" /></LabNamed>
      </Forms>
      <Forms id="ADV-10" title="GlassFanSpeed" make={(form) => <GlassFanSpeed ariaLabel="Ventola" options={SPEEDS} value={speed} onChange={setSpeed} {...form} />}>
        <LabNamed name="ferma"><GlassFanSpeed ariaLabel="Ventola" options={SPEEDS} value={speed} onChange={setSpeed} stopped /></LabNamed>
        <LabNamed name="in attesa"><GlassFanSpeed ariaLabel="Ventola" options={SPEEDS} value={speed} onChange={setSpeed} pending /></LabNamed>
      </Forms>
    </>
  );
}
