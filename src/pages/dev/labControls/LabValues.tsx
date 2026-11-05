import React from 'react';
import { Lock } from 'lucide-react';
import { GlassArrows } from '../../../components/ui/GlassArrows';
import { GlassCheckbox } from '../../../components/ui/GlassCheckbox';
import { GlassLedRow } from '../../../components/ui/GlassLedRow';
import { GlassLevels } from '../../../components/ui/GlassLevels';
import { GlassNumberInput } from '../../../components/ui/GlassNumberInput';
import { GlassRange } from '../../../components/ui/GlassRange';
import { GlassRingSlider } from '../../../components/ui/GlassRingSlider';
import { GlassSelectMenu } from '../../../components/ui/GlassSelectMenu';
import { GlassStepper } from '../../../components/ui/GlassStepper';
import { GlassToggleCard } from '../../../components/ui/GlassToggleCard';
import { LAB_STATES, LabCard, LabHero, LabNamed } from './labShared';

const CHOICES = [
  { value: 'early', label: 'Prima di 15 minuti' },
  { value: 'time', label: 'Puntuale' },
  { value: 'late', label: 'Dopo 15 minuti' },
  { value: 'later', label: 'Dopo 30 minuti' },
  { value: 'night', label: 'Di notte' },
];
const LEVELS = [1, 2, 3, 4, 5].map((value) => ({ value, label: `P${value}` }));
const degrees = (value: number) => `${value}°`;
const PROBLEMS = { 'not-a-number': 'Scrivi un numero', 'too-low': 'Il minimo è 1,5', 'too-high': 'Il massimo è 10', 'off-step': 'Va a passi di 0,5' };

export function LabValues() {
  const [choice, setChoice] = React.useState('time');
  const [level, setLevel] = React.useState(3);
  const [range, setRange] = React.useState<[number, number]>([20, 24]);
  const [ring, setRing] = React.useState(50);
  const [number, setNumber] = React.useState(3);
  const [stepper, setStepper] = React.useState(65);
  const [on, setOn] = React.useState(true);

  const arrows = { ariaLabel: 'Anticipo', previousLabel: 'Prima', nextLabel: 'Dopo', options: CHOICES, value: choice, onChange: setChoice };
  const levels = { ariaLabel: 'Potenza', levels: LEVELS, value: level, onChange: setLevel };
  const rangeProps = { low: range[0], high: range[1], min: 16, max: 30, minGap: 1, onValueChange: (low: number, high: number) => setRange([low, high]), lowLabel: 'Minimo', highLabel: 'Massimo', format: degrees };
  const ringProps = { label: 'Boiler', value: ring, min: 30, max: 70, onValueChange: setRing, format: degrees, note: 'obiettivo' };
  const numberProps = { label: 'Potenza contatore', value: number, min: 1.5, max: 10, step: 0.5, unit: 'kW', hint: 'Da 1,5 a 10 kW', describeProblem: (problem: keyof typeof PROBLEMS) => PROBLEMS[problem], onValueChange: setNumber };

  return (
    <>
      <LabCard id="SEL-01" title="GlassSelectMenu">
        <LabNamed name="compatta"><GlassSelectMenu ariaLabel="Menu" options={CHOICES} value={choice} onChange={setChoice} size="compact" /></LabNamed>
        <LabNamed name="di gruppo"><GlassSelectMenu ariaLabel="Menu" options={CHOICES} value={choice} onChange={setChoice} /></LabNamed>
        <LabNamed name="disabilitato"><GlassSelectMenu ariaLabel="Menu" options={CHOICES} value={choice} onChange={setChoice} disabled /></LabNamed>
        <LabHero><GlassSelectMenu ariaLabel="Menu" options={CHOICES} value={choice} onChange={setChoice} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="SEL-07" title="GlassArrows">
        <LabNamed name="compatta"><GlassArrows {...arrows} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassArrows {...arrows} {...state} /></LabNamed>)}
        <LabHero><GlassArrows {...arrows} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="NUM-04-hero" title="GlassStepper grande">
        <LabHero><GlassStepper label="Setpoint" decreaseLabel="Meno" increaseLabel="Più" value={stepper} min={50} max={75} format={degrees} showLimits onValueChange={setStepper} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="NUM-05" title="GlassNumberInput">
        <LabNamed name="compatta"><GlassNumberInput {...numberProps} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassNumberInput {...numberProps} {...state} /></LabNamed>)}
        <LabHero><GlassNumberInput {...numberProps} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="NUM-07" title="GlassLevels">
        <LabNamed name="compatta"><GlassLevels {...levels} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassLevels {...levels} {...state} /></LabNamed>)}
        <LabHero><GlassLevels {...levels} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="NUM-09" title="GlassRange">
        <LabNamed name="compatta"><GlassRange {...rangeProps} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassRange {...rangeProps} {...state} /></LabNamed>)}
        <LabHero><GlassRange {...rangeProps} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="NUM-10" title="GlassRingSlider">
        <LabNamed name="compatta"><GlassRingSlider {...ringProps} size="compact" /></LabNamed>
        <LabNamed name="di gruppo"><GlassRingSlider {...ringProps} /></LabNamed>
        <LabNamed name="in attesa"><GlassRingSlider {...ringProps} size="compact" pending /></LabNamed>
        <LabHero><GlassRingSlider {...ringProps} size="hero" /></LabHero>
      </LabCard>
      <LabCard id="BOO-04" title="GlassCheckbox">
        <LabNamed name="compatta"><GlassCheckbox checked={on} onChange={setOn} label="Lunedì" size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassCheckbox checked={on} onChange={setOn} label="Lunedì" note="Mattina e sera" {...state} /></LabNamed>)}
      </LabCard>
      <LabCard id="BOO-06" title="GlassToggleCard">
        <LabNamed name="compatta"><GlassToggleCard checked={on} onChange={setOn} title="Blocca comandi" status={on ? 'Bloccati' : 'Liberi'} icon={<Lock size={18} />} size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassToggleCard checked={on} onChange={setOn} title="Blocca comandi" status={on ? 'Bloccati' : 'Liberi'} icon={<Lock size={18} />} {...state} /></LabNamed>)}
      </LabCard>
      <LabCard id="BOO-07" title="GlassLedRow">
        <LabNamed name="compatta"><GlassLedRow on={on} onChange={setOn} title="Pompa di circolo" size="compact" /></LabNamed>
        {LAB_STATES.map(([name, state]) => <LabNamed key={name} name={name}><GlassLedRow on={on} onChange={setOn} title="Pompa di circolo" note="In funzione" {...state} /></LabNamed>)}
        <LabNamed name="da leggere, lampeggia"><GlassLedRow on title="Accensione" tone="warn" blink /></LabNamed>
      </LabCard>
    </>
  );
}
