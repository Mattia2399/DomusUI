import React from 'react';
import { GlassDatePicker } from '../../../components/ui/GlassDatePicker';
import { GlassDateTimePicker } from '../../../components/ui/GlassDateTimePicker';
import { GlassKeypad } from '../../../components/ui/GlassKeypad';
import { GlassPasswordInput } from '../../../components/ui/GlassPasswordInput';
import { GlassTextArea } from '../../../components/ui/GlassTextArea';
import { GlassTextInput } from '../../../components/ui/GlassTextInput';
import { GlassTimePicker } from '../../../components/ui/GlassTimePicker';
import { GlassTimeRange } from '../../../components/ui/GlassTimeRange';
import { LabCard, LabHero, LabNamed } from './labShared';

type Form = { size: 'compact' | 'group' | 'hero' };
const NOOP = () => undefined;
const PROBLEMS = { 'too-short': 'Troppo corto', 'too-long': 'Troppo lungo', pattern: 'Non è nel formato giusto' };
const TIME = { hoursLabel: 'Ore', minutesLabel: 'Minuti', moreLabel: 'Più', lessLabel: 'Meno' };
const DATE = { previousLabel: 'Mese prima', nextLabel: 'Mese dopo', today: '2026-11-05' };

function Forms({ id, title, make }: { id: string; title: string; make: (form: Form) => React.ReactNode }) {
  return (
    <LabCard id={id} title={title}>
      <LabNamed name="compatta">{make({ size: 'compact' })}</LabNamed>
      <LabNamed name="di gruppo">{make({ size: 'group' })}</LabNamed>
      <LabHero>{make({ size: 'hero' })}</LabHero>
    </LabCard>
  );
}

export function LabText() {
  const [date, setDate] = React.useState('2026-11-14');
  const [time, setTime] = React.useState('06:30');
  const [band, setBand] = React.useState(['23:00', '06:30']);
  return (
    <>
      <Forms id="TXT-01" title="GlassTextInput" make={(form) => <GlassTextInput label="Messaggio" value="Buongiorno" maxLength={24} clearLabel="Svuota" describeProblem={(problem) => PROBLEMS[problem]} onCommit={NOOP} {...form} />} />
      <Forms id="TXT-02" title="GlassTextArea" make={(form) => <GlassTextArea label="Nota" value="Le chiavi sono sotto il vaso." onCommit={NOOP} {...form} />} />
      <Forms id="TXT-03" title="GlassKeypad" make={(form) => <GlassKeypad label="Soglia fumi" value="180" unit="°C" deleteLabel="Cancella" confirmLabel="OK" onSubmit={NOOP} {...form} />} />
      <Forms id="TXT-04" title="GlassDatePicker" make={(form) => <GlassDatePicker label="Rientro" value={date} onChange={setDate} min="2026-11-03" {...DATE} {...form} />} />
      <Forms id="TXT-05" title="GlassTimePicker" make={(form) => <GlassTimePicker label="Accendi alle" value={time} onChange={setTime} {...TIME} {...form} />} />
      <Forms id="TXT-06" title="GlassDateTimePicker" make={(form) => <GlassDateTimePicker label="Fine vacanza" dateLabel="Data" timeLabel="Ora" date={date} time={time} dateText={date} onChange={(nextDate, nextTime) => { setDate(nextDate); setTime(nextTime); }} {...DATE} {...TIME} {...form} />} />
      <Forms id="TXT-07" title="GlassTimeRange, solo qui: due entità" make={(form) => <GlassTimeRange fromLabel="Inizio" toLabel="Fine" from={band[0]} to={band[1]} onChange={(from, to) => setBand([from, to])} {...form} />} />
      <Forms id="TXT-08" title="GlassPasswordInput" make={(form) => <GlassPasswordInput label="Wi-Fi ospiti" value="segreta" clearLabel="Svuota" showLabel="Mostra" hideLabel="Nascondi" describeProblem={(problem) => PROBLEMS[problem]} onCommit={NOOP} {...form} />} />
    </>
  );
}
