import React from 'react';
import { BellRing, Moon, Sofa } from 'lucide-react';
import { GlassButtonGroup } from '../../../components/ui/GlassButtonGroup';
import { GlassHoldButton } from '../../../components/ui/GlassHoldButton';
import { GlassMomentaryButton } from '../../../components/ui/GlassMomentaryButton';
import { GlassResultButton } from '../../../components/ui/GlassResultButton';
import { GlassRunButton } from '../../../components/ui/GlassRunButton';
import { GlassStatusPill } from '../../../components/ui/GlassStatusPill';
import { LAB_STATES, LabCard, LabNamed } from './labShared';

const NOOP = () => undefined;
const COMMANDS = [
  { id: 'up', label: 'Su', onPress: NOOP },
  { id: 'stop', label: 'Stop', onPress: NOOP },
  { id: 'down', label: 'Giù', onPress: NOOP },
];

export function LabActions() {
  const [running, setRunning] = React.useState(false);
  const [good, setGood] = React.useState(true);
  return (
    <>
      <LabCard id="ACT-04" title="GlassButtonGroup">
        <LabNamed name="compatta"><GlassButtonGroup ariaLabel="Comandi" actions={COMMANDS} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassButtonGroup ariaLabel="Comandi" actions={COMMANDS} {...state} /></LabNamed>)}
      </LabCard>
      <LabCard id="ACT-05" title="GlassHoldButton">
        <LabNamed name="compatta"><GlassHoldButton label="Tieni premuto per aprire" onConfirm={NOOP} size="compact" /></LabNamed>
        <LabNamed name="pericoloso"><GlassHoldButton label="Tieni premuto per aprire il cancello" note="Rilascia prima per annullare" onConfirm={NOOP} danger /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassHoldButton label="Tieni premuto per aprire" onConfirm={NOOP} {...state} /></LabNamed>)}
      </LabCard>
      <LabCard id="ACT-M" title="GlassMomentaryButton, Premi e tieni">
        <LabNamed name="compatta"><GlassMomentaryButton label="Campanello" icon={<BellRing size={18} />} onPress={NOOP} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassMomentaryButton label="Campanello" note="Acceso finché lo tieni" icon={<BellRing size={18} />} onPress={NOOP} {...state} /></LabNamed>)}
      </LabCard>
      <LabCard id="ACT-07" title="GlassRunButton">
        <LabNamed name="compatta"><GlassRunButton label="Pulizia braciere" running={false} onPress={NOOP} size="compact" /></LabNamed>
        <LabNamed name="prova"><GlassRunButton label="Pulizia braciere" runningLabel="In corso" running={running} onPress={() => { setRunning(true); window.setTimeout(() => setRunning(false), 3000); }} /></LabNamed>
        <LabNamed name="in corso"><GlassRunButton label="Pulizia braciere" runningLabel="In corso" running onPress={NOOP} /></LabNamed>
        <LabNamed name="con avanzamento"><GlassRunButton label="Pulizia" runningLabel="62%" running progress={62} onPress={NOOP} /></LabNamed>
        <LabNamed name="disabilitato"><GlassRunButton label="Pulizia braciere" running={false} onPress={NOOP} disabled /></LabNamed>
        <LabNamed name="errore"><GlassRunButton label="Pulizia braciere" running={false} onPress={NOOP} error /></LabNamed>
      </LabCard>
      <LabCard id="ACT-08" title="GlassResultButton">
        <LabNamed name="compatta"><GlassResultButton label="Attiva scena" successLabel="Fatto" onPress={() => Promise.resolve(true)} size="compact" /></LabNamed>
        <LabNamed name="ogni secondo tocco sbaglia"><GlassResultButton label="Attiva scena Cena" successLabel="Scena attivata" onPress={() => { setGood(!good); return Promise.resolve(good ? true : 'La luce del portico non risponde'); }} /></LabNamed>
        <LabNamed name="disabilitato"><GlassResultButton label="Attiva scena" successLabel="Fatto" onPress={() => Promise.resolve(true)} disabled /></LabNamed>
      </LabCard>
      <LabCard id="ACT-09" title="GlassStatusPill">
        <LabNamed name="attiva"><GlassStatusPill label="Relax" status="attiva" icon={<Sofa size={16} />} active onPress={NOOP} /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><span><GlassStatusPill label="Notte" icon={<Moon size={16} />} onPress={NOOP} {...state} /></span></LabNamed>)}
      </LabCard>
    </>
  );
}
