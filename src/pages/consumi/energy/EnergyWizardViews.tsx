import { ArrowDown, ArrowUpDown, Check, CircleCheck, Home } from 'lucide-react';
import type { EnergyModuleId } from '../../../services/energyCoreClient';
import { ModuleIcon, StatusBadge, TechDetails } from './EnergyGuidedDevice';
import { PlantIllustration } from './EnergyPlantPicker';
import { MODULE_META, UI } from './energyModel';
import { MODULE_WORDS, type GuideStatus, type ModuleFinding } from './energyGuide';

/* Presentational screens of the guided setup; all state lives in EnergySetupWizard. */

export const TITLE = 'text-xl font-semibold tracking-tight text-[color:var(--ui-text-primary)] sm:text-2xl';

const WELCOME: Array<[EnergyModuleId | 'home', string]> = [['grid', 'Rete'], ['home', 'Casa'], ['solar', 'Fotovoltaico'], ['battery', 'Batteria'], ['wallbox', 'Auto']];

function HomeIcon() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
      <Home className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export function WelcomeView() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-center">
      <div className="rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-5">
        <PlantIllustration modules={['grid', 'solar', 'battery', 'wallbox']} className="mx-auto h-32 w-full max-w-md sm:h-44" />
      </div>
      <div className="space-y-2">
        <h3 className={TITLE}>Configuriamo Domus Energy</h3>
        <p className={`${UI.body} mx-auto max-w-lg`}>
          Domus cercherà automaticamente inverter, contatore, batteria e caricatore auto presenti in Home Assistant. Potrai controllare ogni scelta prima di salvare.
        </p>
      </div>
      <ul aria-label="Cosa può seguire Domus Energy" className="mx-auto grid max-w-md grid-cols-5 gap-1.5">
        {WELCOME.map(([module, label]) => (
          <li key={module} className="flex flex-col items-center gap-1.5 text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
            {module === 'home' ? <HomeIcon /> : <ModuleIcon module={module} />}
            {label}
          </li>
        ))}
      </ul>
      <p className={UI.muted}>Nulla viene salvato finché non confermi nel controllo finale.</p>
    </div>
  );
}

const CHOICE = 'relative flex w-full items-center gap-3 rounded-[1.35rem] border p-3 text-left shadow-[var(--ui-shadow-card)] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)] motion-reduce:transition-none';

function ChoiceCard({
  title,
  caption,
  modules,
  checked,
  disabled = false,
  badge,
  onToggle,
}: {
  title: string;
  caption: string;
  modules: EnergyModuleId[];
  checked: boolean;
  disabled?: boolean;
  badge?: string | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={title}
      onClick={() => { if (!disabled) onToggle(); }}
      className={`${CHOICE} ${checked ? 'border-[color:var(--ui-accent)] bg-[color:var(--ui-surface-primary)] ring-1 ring-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] hover:border-[color:var(--ui-text-tertiary)]'} ${disabled ? 'cursor-default' : ''}`}
    >
      <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-[color:var(--ui-fill-tertiary)] px-1 sm:h-20 sm:w-28">
        <PlantIllustration modules={modules} className="h-full w-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-base ${UI.title}`}>{title}</span>
        <span className={`block ${UI.body}`}>{caption}</span>
        {badge ? <span className="mt-1 block text-[11px] font-semibold text-[color:var(--ui-accent)]">{badge}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-transparent bg-[color:var(--ui-accent)] text-white' : 'border-[color:var(--ui-border)]'}`}
      >
        {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

const HARDWARE: Array<Exclude<EnergyModuleId, 'grid' | 'home'>> = ['solar', 'battery', 'wallbox'];

/** "Il tuo impianto": what the home has, preselected from the discovery, always editable. */
export function PlantChoice({
  chosen,
  locked,
  detected,
  onToggle,
  onOnlyGrid,
}: {
  chosen: EnergyModuleId[];
  /** Modules with saved devices: removed device by device in their own step. */
  locked: EnergyModuleId[];
  detected: EnergyModuleId[];
  onToggle: (module: EnergyModuleId) => void;
  onOnlyGrid: () => void;
}) {
  const onlyGrid = !HARDWARE.some((module) => chosen.includes(module));
  const badge = (module: EnergyModuleId) =>
    locked.includes(module) ? 'Già configurato' : detected.includes(module) ? 'Rilevato da Domus' : null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-1">
        <h3 className={TITLE}>Cosa c’è nel tuo impianto?</h3>
        <p className={UI.body}>Scegli tutto quello che hai. {detected.length ? 'Domus ha già selezionato quello che ha trovato: puoi sempre correggere.' : 'Potrai aggiungere altro in seguito.'}</p>
      </div>
      <div role="group" aria-label="Componenti del tuo impianto" className="grid gap-2.5 sm:grid-cols-2">
        {HARDWARE.map((module) => (
          <ChoiceCard
            key={module}
            title={MODULE_META[module].label}
            caption={MODULE_WORDS[module].pitch}
            modules={['grid', module]}
            checked={chosen.includes(module)}
            disabled={locked.includes(module)}
            badge={badge(module)}
            onToggle={() => onToggle(module)}
          />
        ))}
        <ChoiceCard title="Solo rete" caption="Non ho ancora fotovoltaico o accumulo" modules={['grid']} checked={onlyGrid} onToggle={onOnlyGrid} />
      </div>
      <button
        type="button"
        role="checkbox"
        aria-checked={chosen.includes('home')}
        aria-disabled={locked.includes('home') || undefined}
        onClick={() => { if (!locked.includes('home')) onToggle('home'); }}
        className={`${UI.button} w-full justify-start sm:w-auto`}
      >
        <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-md border ${chosen.includes('home') ? 'border-transparent bg-[color:var(--ui-accent)] text-white' : 'border-[color:var(--ui-border)]'}`}>
          {chosen.includes('home') ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
        {MODULE_WORDS.home.pitch}
      </button>
      {locked.length ? <p className={UI.muted}>I componenti già configurati restano: per toglierne un dispositivo usa il suo passaggio.</p> : null}
    </div>
  );
}

/** The detection as one card per chosen module, with its state in plain words. */
export function Findings({ findings, advanced }: { findings: ModuleFinding[]; advanced: boolean }) {
  return (
    <ul aria-label="Risultato del rilevamento" className="space-y-2">
      {findings.map((finding) => (
        <li key={finding.module} className="rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3 shadow-[var(--ui-shadow-card)]">
          <div className="flex items-center gap-3">
            <ModuleIcon module={finding.module} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${UI.title}`}>{MODULE_META[finding.module].label === 'Rete' ? 'Rete elettrica' : MODULE_META[finding.module].label}</p>
              <p className={UI.body}>{finding.headline}</p>
            </div>
            <StatusBadge status={finding.status} />
          </div>
          {finding.details.length ? <div className="pl-14"><TechDetails open={advanced}>{finding.details.map((line) => <p key={line}>{line}</p>)}</TechDetails></div> : null}
        </li>
      ))}
    </ul>
  );
}

export type MapNode = { module: EnergyModuleId; caption: string; status: GuideStatus };

const MAP_STATUS: Record<GuideStatus, string> = { ready: 'Configurato', check: 'Da verificare', waiting: 'In attesa', problem: 'Problema', missing: 'Non configurato' };

function MapCard({ node }: { node: MapNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-2.5 shadow-[var(--ui-shadow-card)]">
      <ModuleIcon module={node.module} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${UI.title}`}>{MODULE_META[node.module].label}</span>
        <span className={`block truncate ${UI.muted}`}>{node.caption}</span>
        <span className="mt-1 block"><StatusBadge status={node.status} label={MAP_STATUS[node.status]} /></span>
      </span>
    </li>
  );
}

/** The plant around the home: sources above, storage and the car below. */
export function PlantMap({ nodes }: { nodes: MapNode[] }) {
  const above = nodes.filter((node) => node.module === 'grid' || node.module === 'solar');
  const below = nodes.filter((node) => node.module === 'battery' || node.module === 'wallbox');
  const home = nodes.find((node) => node.module === 'home');
  return (
    <div aria-label="Il tuo impianto" role="group" className="space-y-2 rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3 sm:p-4">
      {above.length ? <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">{above.map((node) => <MapCard key={node.module} node={node} />)}</ul> : null}
      {above.length ? <ArrowDown className="mx-auto h-5 w-5 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" /> : null}
      <div className="mx-auto flex max-w-xs items-center justify-center gap-2 rounded-2xl bg-[color:var(--ui-surface-primary)] px-4 py-3 shadow-[var(--ui-shadow-card)]">
        <Home className="h-5 w-5 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
        <span className={`text-sm ${UI.title}`}>Casa</span>
        {home ? <span className={UI.muted}>· {home.caption}</span> : null}
      </div>
      {below.length ? <ArrowUpDown className="mx-auto h-5 w-5 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" /> : null}
      {below.length ? <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">{below.map((node) => <MapCard key={node.module} node={node} />)}</ul> : null}
    </div>
  );
}

export function SuccessView({ lines, realtimeOnly }: { lines: string[]; realtimeOnly: boolean }) {
  return (
    <div className="mx-auto max-w-xl space-y-5 py-4 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-success)]">
        <CircleCheck className="h-9 w-9" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h3 className={TITLE}>Domus Energy è pronto</h3>
        <p className={UI.body}>
          {realtimeOnly
            ? 'Monitoraggio in tempo reale pronto. Lo storico potrà essere configurato in seguito.'
            : 'Domus mostra i valori in tempo reale e conserva lo storico dei contatori.'}
        </p>
      </div>
      {lines.length ? (
        <ul aria-label="Riepilogo" className="mx-auto max-w-sm space-y-1.5 text-left">
          {lines.map((line) => (
            <li key={line} className={`flex items-center gap-2 ${UI.body}`}>
              <CircleCheck className="h-4 w-4 shrink-0 text-[color:var(--ui-success)]" aria-hidden="true" /> {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
