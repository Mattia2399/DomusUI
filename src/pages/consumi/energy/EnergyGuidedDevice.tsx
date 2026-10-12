import React from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  Home,
  Plus,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import type { EnergyDiscovery, EnergyMeterInfo, EnergyMeterRole, EnergyModuleId } from '../../../services/energyCoreClient';
import { activeRoles } from './energyDraft';
import { DeviceEditor, METER_REASON, METER_STATUS, MODULE_ICONS, MeterRoleRows, TotalEditor, totalSummary } from './EnergyDeviceEditor';
import { ERROR_TEXT } from './EnergyModuleEditor';
import { EnergySensorPicker } from './EnergySensorPicker';
import { MODULE_META, UI } from './energyModel';
import {
  HISTORY_TEXT,
  STATUS_TEXT,
  deviceReading,
  guidedRole,
  liveReading,
  meterState,
  sensorDevice,
  sensorKind,
  sensorName,
  type GuideStatus,
} from './energyGuide';
import {
  MAX_DEVICES_PER_MODULE,
  METER_ROLES,
  deviceLabel,
  emptyPower,
  meterLines,
  removeDevice,
  setTotal,
  updateDevice,
  type Confirmation,
  type PlantDraft,
  type PlantDraftDevice,
  type PlantDraftSources,
  type PlantIssue,
} from './energyPlantDraft';
import { entityProblem, isExternalStatistic, meterKnown, sensorOptions } from './energySensorCatalog';
import { useConsumptionCopy } from '../../../i18n/consumptionCopy';

const SENSOR_ID = /^sensor\.[a-z0-9_]+$/;

/*
 * Guided views of the plant draft: a card per device with its state in plain
 * words, the sensor Domus recommends, the sign of a signed sensor as a picture
 * and the history meters per role. Technical names stay one tap away in
 * "Dettagli tecnici", and "Configurazione avanzata" opens the full editor of
 * the same device. Shared by the setup wizard and the settings.
 */

export const MODULE_TONE: Record<EnergyModuleId, string> = {
  grid: 'text-sky-500',
  solar: 'text-amber-500',
  battery: 'text-emerald-500',
  wallbox: 'text-violet-500',
  home: 'text-[color:var(--ui-text-secondary)]',
};

export function ModuleIcon({ module, size = 'md' }: { module: EnergyModuleId; size?: 'md' | 'lg' }) {
  const Icon = MODULE_ICONS[module];
  const box = size === 'lg' ? 'h-14 w-14 rounded-[1.1rem]' : 'h-11 w-11 rounded-2xl';
  return (
    <span className={`flex shrink-0 items-center justify-center border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] ${box} ${MODULE_TONE[module]}`}>
      <Icon className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} aria-hidden="true" />
    </span>
  );
}

const BADGE: Record<GuideStatus, { icon: LucideIcon; tone: string }> = {
  ready: { icon: CircleCheck, tone: 'text-[color:var(--ui-success)]' },
  check: { icon: CircleAlert, tone: 'text-[color:var(--ui-warning)]' },
  waiting: { icon: Clock3, tone: 'text-[color:var(--ui-text-secondary)]' },
  problem: { icon: CircleX, tone: 'text-[color:var(--ui-danger)]' },
  missing: { icon: CircleAlert, tone: 'text-[color:var(--ui-text-tertiary)]' },
};

export function StatusBadge({ status, label }: { status: GuideStatus; label?: string }) {
  const { cl } = useConsumptionCopy();
  const { icon: Icon, tone } = BADGE[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--ui-fill-tertiary)] px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label ?? cl(STATUS_TEXT[status])}
    </span>
  );
}

/** Ids and statuses for experts, closed unless the advanced configuration is on. */
export function TechDetails({ children, open = false }: { children: React.ReactNode; open?: boolean }) {
  const { c } = useConsumptionCopy();
  return (
    <details className="group" open={open || undefined}>
      <summary className="inline-flex min-h-8 cursor-pointer select-none items-center gap-1 text-xs text-[color:var(--ui-text-tertiary)] marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /> {c('Dettagli tecnici')}
      </summary>
      <div className="mt-1 space-y-0.5 break-all font-mono text-[11px] text-[color:var(--ui-text-tertiary)]">{children}</div>
    </details>
  );
}

const OPTION = 'flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left transition-colors focus-within:ring-2 focus-within:ring-[color:var(--ui-accent)] motion-reduce:transition-none';
const optionTone = (selected: boolean) =>
  selected ? 'border-[color:var(--ui-accent)] bg-[color:var(--ui-fill-tertiary)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)]';

type Context = {
  states: MockEntityStateMap;
  discovery: EnergyDiscovery | null;
  meters: Record<string, EnergyMeterInfo>;
  /** Sensors used elsewhere in the plant, by holder. */
  taken: Record<string, string>;
};

/**
 * One power or charge-level sensor: the chosen or recommended sensor as a card
 * with its live value, and the full searchable picker only on request.
 */
export function SensorChoice({
  id,
  module,
  role,
  value,
  recommended,
  states,
  discovery,
  taken,
  error,
  onChange,
}: Omit<Context, 'meters'> & {
  id: string;
  module: EnergyModuleId;
  role: string;
  value: string;
  recommended: string | null;
  error?: string;
  onChange: (value: string) => void;
}) {
  const { c, cl, locale } = useConsumptionCopy();
  const [choosing, setChoosing] = React.useState(false);
  const kind = sensorKind(role);
  const options = React.useMemo(() => sensorOptions(states, discovery, kind), [states, discovery, kind]);
  const label = cl(guidedRole(module, role));
  const shown = value.trim() || recommended || '';
  const suggestion = !value.trim() && Boolean(recommended);
  const labelId = `${id}-label`;
  if (choosing || !shown) {
    return (
      <div className="space-y-1.5">
        <label id={labelId} htmlFor={id} className={`block text-sm ${UI.title}`}>{label}</label>
        <EnergySensorPicker
          id={id}
          value={value}
          options={options}
          taken={taken}
          // Typing keeps the picker open: the card comes back on a pick or "Fatto".
          onChange={(next) => { setChoosing(true); onChange(next); }}
          invalid={Boolean(error)}
          autoFocus={choosing}
          onPick={() => setChoosing(false)}
        />
        {error ? <p className={ERROR_TEXT}>{cl(error)}</p> : <p className={UI.muted}>{c('Cerca per nome: Domus mostra prima i sensori compatibili.')}</p>}
        {choosing && value.trim() ? <button type="button" onClick={() => setChoosing(false)} className={UI.chip} aria-label={c('Fatto: {label}', { label })}>{c('Fatto')}</button> : null}
      </div>
    );
  }
  const problem = entityProblem(states, kind, shown);
  const reading = liveReading(states, shown, locale);
  const device = sensorDevice(discovery, shown);
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <p id={labelId} className={`text-sm ${UI.title}`}>{label}</p>
      <div className={`rounded-2xl border p-3 ${suggestion ? 'border-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)]'} bg-[color:var(--ui-surface-primary)]`}>
        {suggestion ? (
          <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> {c('Consigliato da Domus')}
          </p>
        ) : null}
        <p className={`text-sm ${UI.title}`}>{sensorName(states, discovery, shown)}</p>
        <p className={UI.muted}>{[device, reading ? c('{value} ora', { value: reading }) : null].filter(Boolean).join(' · ') || c('Lettura disponibile dopo il salvataggio')}</p>
        <p className={`mt-1 text-xs ${problem ? 'text-[color:var(--ui-danger)]' : 'text-[color:var(--ui-success)]'}`}>
          {problem ? c('Non compatibile: {reason}', { reason: cl(problem) }) : states[shown] ? c('✓ Compatibile') : c('Verificato da Home Assistant al salvataggio')}
        </p>
        <TechDetails>{shown}</TechDetails>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestion && !problem ? (
          <button type="button" onClick={() => onChange(recommended!)} className={UI.primary}>
            <Check className="h-4 w-4" aria-hidden="true" /> {c('Usa questo sensore')}
          </button>
        ) : null}
        <button type="button" onClick={() => setChoosing(true)} className={UI.button} aria-label={c('Scegli un altro sensore per {label}', { label })}>
          {c('Scegli un altro sensore')}
        </button>
      </div>
      {error ? <p className={ERROR_TEXT}>{cl(error)}</p> : null}
    </div>
  );
}

const WIRING: Record<'grid' | 'battery', { question: string; net: [string, string]; split: [string, string] }> = {
  grid: {
    question: 'Come misura la rete il tuo contatore?',
    net: ['Un solo sensore', 'Un numero positivo o negativo secondo la direzione'],
    split: ['Due sensori', 'Uno per l’energia prelevata, uno per quella immessa'],
  },
  battery: {
    question: 'Come misura la batteria il tuo sistema?',
    net: ['Un solo sensore', 'Un numero positivo o negativo tra carica e scarica'],
    split: ['Due sensori', 'Uno per la carica, uno per la scarica'],
  },
};

function WiringChoice({ module, instance, mode, onChange }: { module: 'grid' | 'battery'; instance: string; mode: 'split' | 'net'; onChange: (mode: 'split' | 'net') => void }) {
  const { cl } = useConsumptionCopy();
  const words = WIRING[module];
  return (
    <fieldset className="space-y-2">
      <legend className={`mb-2 text-sm ${UI.title}`}>{cl(words.question)}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['net', 'split'] as const).map((option) => (
          <label key={option} className={`${OPTION} ${optionTone(mode === option)}`}>
            <input type="radio" name={`energy-${instance}-wiring`} checked={mode === option} onChange={() => onChange(option)} className="mt-1" />
            <span>
              <span className={`block text-sm ${UI.title}`}>{cl(words[option][0])}</span>
              <span className={`block ${UI.muted}`}>{cl(words[option][1])}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const SIGN: Record<'grid' | 'battery', { question: string; options: Array<[string, string, string]>; flows: Array<[EnergyModuleId | 'home', EnergyModuleId | 'home', string]> }> = {
  grid: {
    question: 'Quando stai acquistando energia dalla rete, il numero è:',
    options: [['positive_import', 'Positivo quando prelevo dalla rete', '+'], ['positive_export', 'Negativo quando prelevo dalla rete', '−']],
    flows: [['grid', 'home', 'Prelievo dalla rete']],
  },
  battery: {
    question: 'Quando la batteria si scarica verso la casa, il numero è:',
    options: [['positive_discharge', 'Positivo quando si scarica', '+'], ['positive_charge', 'Negativo quando si scarica', '−']],
    flows: [['battery', 'home', 'Scarica'], ['home', 'battery', 'Carica']],
  },
};

function FlowNode({ module }: { module: EnergyModuleId | 'home' }) {
  if (module === 'home') {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
        <Home className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }
  return <ModuleIcon module={module} />;
}

/** The sign of a signed sensor as a picture of the flow and two plain choices; never guessed. */
function SignChoice({ module, instance, value, reading, onChange }: { module: 'grid' | 'battery'; instance: string; value: string; reading: string | null; onChange: (value: string) => void }) {
  const { c, cl, locale } = useConsumptionCopy();
  const spec = SIGN[module];
  return (
    <fieldset className={`${UI.card} space-y-3`}>
      <legend className="sr-only">{c('Come legge questo sensore l’energia?')}</legend>
      <p className={`text-sm ${UI.title}`} aria-hidden="true">{c('Come legge questo sensore l’energia?')}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2" aria-hidden="true">
        {spec.flows.map(([from, to, caption]) => (
          <div key={caption} className="flex items-center gap-2">
            <FlowNode module={from} />
            <span className="flex flex-col items-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-tertiary)]">
              <ArrowRight className="h-5 w-5 text-[color:var(--ui-accent)]" /> {cl(caption)}
            </span>
            <FlowNode module={to} />
          </div>
        ))}
      </div>
      <p className={UI.body}>{cl(spec.question)}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {spec.options.map(([option, label, symbol]) => (
          <label key={option} className={`${OPTION} ${optionTone(value === option)} items-center`}>
            <input type="radio" name={`energy-${instance}-sign-guided`} checked={value === option} onChange={() => onChange(option)} />
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)] text-lg font-semibold text-[color:var(--ui-text-primary)]">{symbol}</span>
            <span className={`text-sm ${UI.title}`}>{cl(label)}</span>
          </label>
        ))}
      </div>
      {reading ? <p className={UI.muted}>{c('Adesso il sensore indica {reading}.', { reading })}</p> : null}
      <p className={UI.muted}>{c('Domus non indovina il segno: se non sei sicuro, controllalo nell’app dell’inverter o del contatore.')}</p>
    </fieldset>
  );
}

/** The everyday fields of one device: name, power sensors, wiring, sign and capacity. */
export function GuidedDevice({
  module,
  device,
  index,
  states,
  discovery,
  taken,
  issues,
  recommend,
  legacy = false,
  onChange,
}: Omit<Context, 'meters'> & {
  module: EnergyModuleId;
  device: PlantDraftDevice;
  index: number;
  issues: PlantIssue[];
  recommend: (role: string) => string | null;
  /** An integration without Energy Profile v2: no name or capacity can be stored. */
  legacy?: boolean;
  onChange: (device: PlantDraftDevice) => void;
}) {
  const { c, cl, locale } = useConsumptionCopy();
  const field = (name: string) => issues.find((issue) => issue.field === name)?.message;
  const power = device.power;
  const signed = module === 'grid' || module === 'battery' ? module : null;
  // A device just added and still empty is not an error yet: its card says what is missing.
  const untouched = device.isNew && !Object.values(power.sensors).some((value) => value?.trim());
  const general = untouched ? undefined : issues.find((issue) => !issue.field || issue.field === 'power');
  const nameId = `energy-${device.id}-guided-name`;
  const setPower = (next: Partial<PlantDraftDevice['power']>) => onChange({ ...device, power: { ...power, ...next } });
  return (
    <div className="space-y-4">
      {legacy ? null : <div className="space-y-1.5">
        <label htmlFor={nameId} className={`block text-sm ${UI.title}`}>{c('Nome')}</label>
        <input
          id={nameId}
          value={device.name}
          maxLength={80}
          placeholder={`${c(MODULE_META[module].label)} ${index + 1}`}
          onChange={(event) => onChange({ ...device, name: event.target.value })}
          aria-invalid={Boolean(field('name'))}
          className="liquid-glass-control min-h-11 w-full rounded-xl px-3 text-sm"
        />
        {field('name') ? <p className={ERROR_TEXT}>{cl(field('name') ?? '')}</p> : null}
      </div>}
      {power.present ? (
        <>
          {signed ? <WiringChoice module={signed} instance={device.id} mode={power.mode} onChange={(mode) => setPower({ mode })} /> : null}
          {activeRoles(module, power.mode).map((role) => (
            <SensorChoice
              key={`${role}-${power.mode}`}
              id={`energy-${device.id}-guided-${role}`}
              module={module}
              role={role}
              value={power.sensors[role] ?? ''}
              recommended={recommend(role)}
              states={states}
              discovery={discovery}
              taken={taken}
              error={field(role)}
              onChange={(value) => setPower({ sensors: { ...power.sensors, [role]: value } })}
            />
          ))}
          {signed && power.mode === 'net' && power.sensors.net_power?.trim() ? (
            <SignChoice
              module={signed}
              instance={device.id}
              value={power.signConvention}
              reading={liveReading(states, power.sensors.net_power.trim(), locale)}
              onChange={(signConvention) => setPower({ signConvention })}
            />
          ) : null}
        </>
      ) : (
        <div className={UI.card}>
          <p className={UI.body}>{c('Questo dispositivo non ha sensori di potenza: Domus userà solo i suoi contatori per lo storico.')}</p>
          <button type="button" onClick={() => setPower({ present: true })} className={`mt-2 ${UI.chip}`}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {c('Aggiungi un sensore di potenza')}
          </button>
        </div>
      )}
      {module === 'battery' && !legacy ? (
        <fieldset className="space-y-2">
          <legend className={`text-sm ${UI.title}`}>{c('Capacità (facoltativa)')}</legend>
          <p className={UI.muted}>{c('La trovi nella scheda tecnica. Serve per la carica complessiva di più batterie; Domus non la stima.')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['nominal', 'usable'] as const).map((kind) => (
              <div key={kind} className="space-y-1.5">
                <label htmlFor={`energy-${device.id}-guided-${kind}`} className={`block text-sm ${UI.title}`}>{kind === 'nominal' ? c('Capacità nominale (kWh)') : c('Capacità utilizzabile (kWh)')}</label>
                <input
                  id={`energy-${device.id}-guided-${kind}`}
                  inputMode="decimal"
                  value={device.capacity[kind]}
                  onChange={(event) => onChange({ ...device, capacity: { ...device.capacity, [kind]: event.target.value } })}
                  aria-invalid={Boolean(field(kind))}
                  className="liquid-glass-control min-h-11 w-full rounded-xl px-3 text-sm"
                />
                {field(kind) ? <p className={ERROR_TEXT}>{cl(field(kind) ?? '')}</p> : null}
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {general ? <p className={ERROR_TEXT}>{cl(general.message)}</p> : null}
    </div>
  );
}

const NUMBER_WORD = ['', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto'];

/** "F1" when the meter is named after a band, otherwise its short name. */
function partName(states: MockEntityStateMap, discovery: EnergyDiscovery | null, id: string) {
  const name = sensorName(states, discovery, id);
  return name.match(/\bF[1-3]\b/i)?.[0].toUpperCase() ?? name;
}

const WORST: GuideStatus[] = ['problem', 'check', 'waiting', 'ready'];

export type ConfirmProps = {
  confirmations?: Confirmation[];
  confirmed?: ReadonlySet<string>;
  onConfirm?: (key: string, value: boolean) => void;
};

function ConfirmButton({ item, confirmed, onConfirm, label }: { item: Confirmation; confirmed: boolean; onConfirm: (key: string, value: boolean) => void; label: string }) {
  const { c } = useConsumptionCopy();
  return (
    <button type="button" aria-pressed={confirmed} onClick={() => onConfirm(item.key, !confirmed)} className={confirmed ? UI.chip : UI.button}>
      {confirmed ? <><Check className="h-3.5 w-3.5" aria-hidden="true" /> {c('Confermato')}</> : label}
    </button>
  );
}

/** The meters of one role in plain words, with their confirmations and the picker on request. */
export function MeterRole({
  holder,
  role,
  sources,
  states,
  discovery,
  meters,
  taken,
  issues,
  confirmations = [],
  confirmed = new Set(),
  onConfirm,
  suggestion,
  advanced = false,
  onChange,
}: Context & ConfirmProps & {
  holder: string;
  role: EnergyMeterRole;
  sources: PlantDraftSources;
  issues: PlantIssue[];
  suggestion?: { name: string; apply: () => void } | null;
  advanced?: boolean;
  onChange: (sources: PlantDraftSources) => void;
}) {
  const { c, cl, locale } = useConsumptionCopy();
  const [editing, setEditing] = React.useState(false);
  const options = React.useMemo(() => sensorOptions(states, discovery, 'energy'), [states, discovery]);
  // Text still being typed is not a meter yet: only real ids get a state or a confirmation.
  const parts = meterLines(sources.meters[role]).filter((part) => SENSOR_ID.test(part) || isExternalStatistic(part));
  const label = cl(HISTORY_TEXT[role]);
  const error = issues.find((issue) => issue.field === role);
  const editingRows = editing || advanced;
  const partStates = parts.map((part) => meterState(meters[part], meterKnown(states, {}, part), locale));
  const worst = WORST.find((status) => partStates.some((state) => state.status === status));
  const sum = confirmations.find((item) => item.holder === holder && item.role === role && item.key.startsWith('parts:'));
  const unverified = editingRows ? [] : confirmations.filter((item) => item.holder === holder && item.role === role && item.key.startsWith('meter:'));
  return (
    <div role="group" aria-label={label} className="space-y-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm ${UI.title}`}>{label}</p>
        {parts.length === 0 ? (
          <span className={UI.muted}>{c('Nessun contatore')}</span>
        ) : parts.length === 1 ? (
          <StatusBadge status={partStates[0].status} label={partStates[0].status === 'ready' ? c('Contatore trovato') : partStates[0].text} />
        ) : (
          <StatusBadge status={worst ?? 'ready'} label={c('{count} contatori', { count: parts.length })} />
        )}
      </div>
      {parts.length === 1 && !editingRows ? <p className={UI.body}>{sensorName(states, discovery, parts[0])}</p> : null}
      {parts.length > 1 && !editingRows ? (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label={c('Parti di {label}', { label })}>
            {parts.map((part, index) => (
              <li key={part} className={`${UI.chip} cursor-default`}>
                <span className={BADGE[partStates[index].status].tone} aria-hidden="true">{partStates[index].status === 'ready' ? '✓' : '!'}</span>
                {partName(states, discovery, part)}
              </li>
            ))}
          </ul>
          <p className={UI.body}>{c('Domus sommerà queste {count} fasce per ottenere il totale.', { count: NUMBER_WORD[parts.length] ? cl(NUMBER_WORD[parts.length]) : parts.length })}</p>
          {sum && onConfirm ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className={`flex-1 ${UI.muted}`}>{c('Verifica che rappresentino fasce differenti e non includano già un totale.')}</p>
              <ConfirmButton item={sum} confirmed={confirmed.has(sum.key)} onConfirm={onConfirm} label={c('Conferma')} />
            </div>
          ) : null}
        </>
      ) : null}
      {unverified.map((item) => (
        <div key={item.key} className="flex flex-wrap items-center gap-2">
          <p className={`flex-1 text-xs text-[color:var(--ui-warning)]`}>{c('{name}: non siamo riusciti a verificarlo. I suoi dati potrebbero non essere disponibili.', { name: sensorName(states, discovery, item.part ?? '') })}</p>
          {onConfirm ? <ConfirmButton item={item} confirmed={confirmed.has(item.key)} onConfirm={onConfirm} label={c('Lo uso comunque')} /> : null}
        </div>
      ))}
      {suggestion ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[color:var(--ui-fill-tertiary)] p-2">
          <p className={`flex-1 ${UI.body}`}><Sparkles className="mr-1 inline h-3.5 w-3.5 text-[color:var(--ui-accent)]" aria-hidden="true" />{c('Domus ha trovato un contatore: {name}', { name: suggestion.name })}</p>
          <button type="button" onClick={suggestion.apply} className={UI.primary}>{c('Usa questo contatore')}</button>
        </div>
      ) : null}
      {editingRows ? (
        <MeterRoleRows scope={holder} role={role} label={label} sources={sources} options={options} meters={meters} taken={taken} error={error} onChange={onChange} />
      ) : error ? (
        <p className={ERROR_TEXT}>{cl(error.message)}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {advanced ? null : (
          <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)} className={UI.chip} aria-label={c('{action}: {label}', { action: editing ? c('Fatto') : parts.length ? c('Cambia contatore') : c('Scegli un contatore'), label })}>
            {editing ? c('Fatto') : parts.length ? c('Cambia contatore') : c('Scegli un contatore')}
          </button>
        )}
        {parts.length ? (
          <TechDetails open={advanced}>
            {parts.map((part) => (
              <p key={part}>{part}{meters[part] ? ` · ${cl(METER_STATUS[meters[part].status].label)}${meters[part].reason && METER_REASON[meters[part].reason!] ? ` · ${cl(METER_REASON[meters[part].reason!])}` : ''}` : ''}</p>
            ))}
          </TechDetails>
        ) : null}
      </div>
    </div>
  );
}

/** Every history meter of one device or total. */
export function SourcesHistory({
  module,
  holder,
  sources,
  issues,
  suggestionFor,
  onChange,
  ...rest
}: Context & ConfirmProps & {
  module: EnergyModuleId;
  holder: string;
  sources: PlantDraftSources;
  issues: PlantIssue[];
  advanced?: boolean;
  suggestionFor?: (role: EnergyMeterRole) => { name: string; apply: () => void } | null;
  onChange: (sources: PlantDraftSources) => void;
}) {
  return (
    <div className="space-y-2">
      {METER_ROLES[module].map(({ role }) => (
        <MeterRole key={role} {...rest} holder={holder} role={role} sources={sources} issues={issues} suggestion={suggestionFor?.(role)} onChange={onChange} />
      ))}
    </div>
  );
}

/**
 * The opened device: the guided fields (and, in the settings, its history), or
 * the full advanced editor of the same draft.
 */
export function DeviceDetail({
  module,
  device,
  index,
  states,
  discovery,
  meters,
  taken,
  issues,
  recommend,
  advanced: everywhere = false,
  withHistory = false,
  legacy = false,
  confirmations,
  confirmed,
  onConfirm,
  onChange,
}: Context & ConfirmProps & {
  module: EnergyModuleId;
  device: PlantDraftDevice;
  index: number;
  issues: PlantIssue[];
  recommend: (role: string) => string | null;
  advanced?: boolean;
  withHistory?: boolean;
  legacy?: boolean;
  onChange: (device: PlantDraftDevice) => void;
}) {
  const { c } = useConsumptionCopy();
  const [advanced, setAdvanced] = React.useState(everywhere);
  React.useEffect(() => setAdvanced(everywhere), [everywhere]);
  return (
    <div className="space-y-4 border-t border-[color:var(--ui-separator)] pt-4">
      {advanced ? (
        <DeviceEditor module={module} device={device} index={index} haStates={states} discovery={discovery} meters={meters} taken={taken} issues={issues} onChange={onChange} />
      ) : (
        <>
          <GuidedDevice module={module} device={device} index={index} states={states} discovery={discovery} taken={taken} issues={issues} recommend={recommend} legacy={legacy} onChange={onChange} />
          {withHistory ? (
            <section aria-label={c('Storico dei consumi')} className="space-y-2">
              <p className={`text-sm ${UI.title}`}>{c('Storico dei consumi')}</p>
              <p className={UI.muted}>{c('I contatori permettono a Domus di mostrarti produzione, consumi e costi nel tempo. Sono facoltativi.')}</p>
              <SourcesHistory
                module={module}
                holder={device.id}
                sources={device}
                issues={issues}
                states={states}
                discovery={discovery}
                meters={meters}
                taken={taken}
                confirmations={confirmations}
                confirmed={confirmed}
                onConfirm={onConfirm}
                onChange={(sources) => onChange({ ...device, ...sources })}
              />
            </section>
          ) : null}
        </>
      )}
      <button type="button" aria-pressed={advanced} onClick={() => setAdvanced(!advanced)} className={UI.chip}>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> {advanced ? c('Torna alla vista guidata') : c('Configurazione avanzata')}
      </button>
    </div>
  );
}

export function deviceStatus(issues: PlantIssue[], unconfirmed: boolean): GuideStatus {
  if (issues.length) return 'problem';
  return unconfirmed ? 'check' : 'ready';
}

/** A device at a glance; the whole header opens its detail. */
export function DeviceCard({
  module,
  device,
  index,
  states,
  status,
  open,
  onToggle,
  onRemove,
  onRestore,
  hint,
  hintTone = 'accent',
  extra,
  advanced = false,
  children,
}: {
  module: EnergyModuleId;
  device: PlantDraftDevice;
  index: number;
  states: MockEntityStateMap;
  status: GuideStatus;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRestore: () => void;
  /** A short note under the reading, such as a pending suggestion or what is missing. */
  hint?: string | null;
  hintTone?: 'accent' | 'danger';
  /** Always shown under the header, such as Domus suggestions for this device. */
  extra?: React.ReactNode;
  advanced?: boolean;
  children?: React.ReactNode;
}) {
  const { c, cl, locale } = useConsumptionCopy();
  const label = deviceLabel(module, device, index, locale);
  const reading = deviceReading(module, device, states, locale);
  const sensors = Object.values(device.power.present ? device.power.sensors : {}).filter(Boolean);
  const meterCount = Object.values(device.meters).reduce((sum, parts) => sum + meterLines(parts).length, 0);
  const summary = device.removed
    ? c('Verrà rimosso al salvataggio')
    : [reading ?? (sensors.length ? c('Nessuna lettura ora') : device.power.present ? c('Sensore da scegliere') : c('Solo storico')), meterCount ? (meterCount === 1 ? c('1 contatore per lo storico') : c('{count} contatori per lo storico', { count: meterCount })) : null].filter(Boolean).join(' · ');
  return (
    <li className="rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3 shadow-[var(--ui-shadow-card)]">
      <div className="flex items-center gap-2">
        {device.removed ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ModuleIcon module={module} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-tertiary)] line-through">{label}</span>
              <span className={`block ${UI.muted}`}>{summary}</span>
            </span>
          </div>
        ) : (
          <button type="button" aria-expanded={open} aria-label={c('{action} {name}', { action: open ? c('Chiudi') : c('Modifica'), name: label })} onClick={onToggle} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]">
            <ModuleIcon module={module} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{label}</span>
                {device.isNew ? <span className="text-[10px] font-semibold text-[color:var(--ui-accent)]">{c('Nuovo')}</span> : null}
                <StatusBadge status={status} />
              </span>
              <span className={`block truncate ${UI.muted}`}>{summary}</span>
              {advanced && sensors.length ? <span className="block truncate font-mono text-[11px] text-[color:var(--ui-text-tertiary)]">{sensors.join(', ')}</span> : null}
              {hint ? <span className={`block text-xs ${hintTone === 'danger' ? 'text-[color:var(--ui-danger)]' : 'text-[color:var(--ui-accent)]'}`}>{cl(hint)}</span> : null}
            </span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-[color:var(--ui-text-secondary)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
        {device.removed ? (
          <button type="button" onClick={onRestore} className={UI.chip} aria-label={c('Ripristina {name}', { name: label })}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {c('Ripristina')}
          </button>
        ) : (
          <button type="button" onClick={onRemove} className={`${UI.chip} min-h-10`} aria-label={c('Rimuovi {name}', { name: label })}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {device.removed ? null : extra}
      {open && !device.removed ? children : null}
    </li>
  );
}

/** The sensor measuring a whole module: explained in words, edited in the advanced editor. */
export function TotalCard({
  module,
  total,
  open,
  onToggle,
  issues,
  states,
  discovery,
  meters,
  taken,
  advanced = false,
  onChange,
}: Context & {
  module: EnergyModuleId;
  total: PlantDraftSources;
  open: boolean;
  onToggle: () => void;
  issues: PlantIssue[];
  advanced?: boolean;
  onChange: (total: PlantDraftSources | null) => void;
}) {
  const { c, cl, locale } = useConsumptionCopy();
  const label = c(MODULE_META[module].label);
  const own = issues.filter((issue) => issue.field === 'total');
  return (
    <div className="rounded-[1.35rem] border border-dashed border-[color:var(--ui-border)] p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
          <Sigma className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${UI.title}`}>{c('Sensore totale · {name}', { name: label })}</p>
          <p className={UI.muted}>{c('Misura tutti i dispositivi insieme: Domus usa questo valore e non lo somma ai singoli dispositivi.')}</p>
          {own.length && !open ? <p className={ERROR_TEXT}>{cl(own[0].message)}</p> : null}
          <TechDetails open={advanced}>{totalSummary(total) || '—'}</TechDetails>
        </div>
        <button type="button" aria-expanded={open} aria-label={c('{action} il sensore totale di {name}', { action: open ? c('Chiudi') : c('Modifica'), name: label })} onClick={onToggle} className={UI.chip}>
          {open ? c('Chiudi') : c('Modifica')}
        </button>
      </div>
      {open ? (
        <div className="mt-3">
          <TotalEditor module={module} total={total} haStates={states} discovery={discovery} meters={meters} taken={taken} issues={own} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One module in the settings: its devices as cards opening on the guided
 * detail (with history) or the advanced editor, its total, removal and restore.
 */
export function PlantModuleSection({
  module,
  draft,
  issues,
  open,
  onOpen,
  onDraft,
  offline = false,
  takenFor,
  recommend,
  haStates,
  discovery,
  meters,
}: {
  module: EnergyModuleId;
  draft: PlantDraft;
  issues: PlantIssue[];
  open: string | null;
  onOpen: (key: string | null) => void;
  onDraft: (update: (current: PlantDraft) => PlantDraft) => void;
  offline?: boolean;
  /** Sensors taken by anything but this holder. */
  takenFor: (holder: string) => Record<string, string>;
  recommend: (module: EnergyModuleId, role: string) => string | null;
  haStates: MockEntityStateMap;
  discovery: EnergyDiscovery | null;
  meters: Record<string, EnergyMeterInfo>;
}) {
  const { c, cl, locale } = useConsumptionCopy();
  const plan = draft[module];
  if (!plan) return null;
  const kept = plan.devices.filter((device) => !device.removed).length;
  const context = { states: haStates, discovery, meters };
  return (
    <section aria-label={c(MODULE_META[module].label)} className="space-y-3 border-t border-[color:var(--ui-separator)] px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex items-center gap-3">
        <ModuleIcon module={module} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
            {c(MODULE_META[module].label)}
            {offline ? <span className="ml-2 text-[10px] font-semibold text-amber-500">{c('Offline')}</span> : null}
          </p>
          <p className={UI.muted}>{plan.devices.length === 1 ? c('1 dispositivo') : c('{count} dispositivi', { count: plan.devices.length })}</p>
        </div>
        {!plan.total && kept >= 2 ? (
          <button
            type="button"
            onClick={() => { onDraft((current) => setTotal(current, module, { power: { ...emptyPower(), present: true }, meters: {} })); onOpen(`${module}:total`); }}
            className={UI.chip}
          >
            {c('Aggiungi un sensore totale')}
          </button>
        ) : null}
      </div>
      {plan.total ? (
        <TotalCard
          {...context}
          module={module}
          total={plan.total}
          open={open === `${module}:total`}
          onToggle={() => onOpen(open === `${module}:total` ? null : `${module}:total`)}
          taken={takenFor(`${c(MODULE_META[module].label)} · ${c('Sensore totale').toLocaleLowerCase(locale)}`)}
          issues={issues}
          onChange={(total) => onDraft((current) => setTotal(current, module, total))}
        />
      ) : null}
      <ul className="space-y-2">
        {plan.devices.map((device, index) => {
          const label = deviceLabel(module, device, index, locale);
          const deviceIssues = issues.filter((issue) => issue.deviceId === device.id);
          return (
            <DeviceCard
              key={device.id}
              module={module}
              device={device}
              index={index}
              states={haStates}
              status={deviceStatus(deviceIssues, false)}
              open={open === device.id}
              onToggle={() => onOpen(open === device.id ? null : device.id)}
              onRemove={() => { onDraft((current) => removeDevice(current, module, device.id)); onOpen(null); }}
              onRestore={() => onDraft((current) => updateDevice(current, module, { ...device, removed: false }))}
              hint={deviceIssues.length && open !== device.id ? deviceIssues[0].message : null}
              hintTone="danger"
            >
              <DeviceDetail
                {...context}
                module={module}
                device={device}
                index={index}
                taken={takenFor(label)}
                issues={deviceIssues}
                recommend={(role) => recommend(module, role)}
                withHistory
                onChange={(next) => onDraft((current) => updateDevice(current, module, next))}
              />
            </DeviceCard>
          );
        })}
      </ul>
      {issues.filter((issue) => !issue.deviceId && issue.field !== 'total').map((issue) => (
        <p key={issue.message} className={ERROR_TEXT}>{cl(issue.message)}</p>
      ))}
      {plan.devices.length >= MAX_DEVICES_PER_MODULE ? <p className={UI.muted}>{c('Al massimo {count} dispositivi per modulo.', { count: MAX_DEVICES_PER_MODULE })}</p> : null}
    </section>
  );
}
