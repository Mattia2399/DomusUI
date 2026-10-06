import React from 'react';
import { Battery, CarFront, Home, Plus, SunMedium, TowerControl, Trash2, Undo2, X, type LucideIcon } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import type { EnergyDiscovery, EnergyMeterInfo, EnergyMeterStatus, EnergyModuleId } from '../../../services/energyCoreClient';
import type { DraftIssue } from './energyDraft';
import { ERROR_TEXT, ModuleEditor } from './EnergyModuleEditor';
import { MODULE_META, UI } from './energyModel';
import {
  DEVICE_NOUN,
  MAX_DEVICES_PER_MODULE,
  METER_ROLES,
  deviceLabel,
  emptyPower,
  meterLines,
  removeDevice,
  setTotal,
  updateDevice,
  type PlantDraft,
  type PlantDraftDevice,
  type PlantDraftSources,
  type PlantIssue,
} from './energyPlantDraft';
import { ROW } from './EnergyTariffFields';
import { EnergySensorPicker } from './EnergySensorPicker';
import { sensorOptions } from './energySensorCatalog';

/* Editors of one device and of a module total, shared by the settings and the setup wizard. */

export const METER_STATUS: Record<EnergyMeterStatus, { label: string; tone: string }> = {
  valid: { label: 'Valido', tone: 'text-[color:var(--ui-success)]' },
  pending: { label: 'In attesa delle prime statistiche', tone: 'text-[color:var(--ui-text-secondary)]' },
  unavailable: { label: 'Non disponibile ora', tone: 'text-[color:var(--ui-warning)]' },
  incompatible: { label: 'Non compatibile', tone: 'text-[color:var(--ui-danger)]' },
  unknown: { label: 'Non trovato', tone: 'text-[color:var(--ui-warning)]' },
  recorder_unavailable: { label: 'Non verificabile ora', tone: 'text-[color:var(--ui-text-secondary)]' },
};

export const METER_REASON: Record<string, string> = {
  awaiting_first_statistics: 'Home Assistant crea le statistiche entro pochi minuti.',
  recorder_starting: 'Home Assistant si sta avviando: la verifica sarà possibile tra poco.',
  recorder_unavailable: 'Il Recorder di Home Assistant non è attivo.',
  entity_missing: 'L’entità non esiste più; le statistiche passate restano.',
  state_unavailable: 'Il sensore non risponde.',
  state_unknown: 'Il sensore non ha ancora un valore.',
  incompatible_device_class: 'Non è un contatore di energia (potenza, temperatura…).',
  not_energy_unit: 'L’unità non è un’energia (Wh, kWh, MWh…).',
  unit_missing: 'Manca l’unità di misura.',
  no_state_class: 'Senza state_class Home Assistant non conserva statistiche.',
  no_sum: 'Non è un contatore cumulativo (state_class measurement).',
  not_recorded: 'Escluso dal Recorder di Home Assistant.',
  not_found: 'Né il Recorder né Home Assistant conoscono questo identificativo.',
};

export function MeterStatusLine({ info }: { info: EnergyMeterInfo | undefined }) {
  if (!info) return null;
  const status = METER_STATUS[info.status];
  return (
    <span className={`block text-[11px] ${status.tone}`}>
      {status.label}{info.unit ? ` · ${info.unit}` : ''}{info.reason && METER_REASON[info.reason] ? ` · ${METER_REASON[info.reason]}` : ''}
    </span>
  );
}

type Shared = {
  module: EnergyModuleId;
  haStates: MockEntityStateMap;
  discovery: EnergyDiscovery | null;
  meters: Record<string, EnergyMeterInfo>;
  /** Sensors used elsewhere in the plant, by holder. */
  taken: Record<string, string>;
};

function MetersEditor({
  module,
  scope,
  sources,
  haStates,
  discovery,
  meters,
  taken,
  issues,
  onChange,
}: Shared & { scope: string; sources: PlantDraftSources; issues: PlantIssue[]; onChange: (sources: PlantDraftSources) => void }) {
  const options = React.useMemo(() => sensorOptions(haStates, discovery, 'energy'), [haStates, discovery]);
  return (
    <fieldset className={UI.card}>
      <legend className="sr-only">Contatori di energia</legend>
      <p className={UI.title}>Contatori di energia</p>
      <p className={UI.muted}>Statistiche di Home Assistant in kWh, per lo storico. Facoltativi: senza, il dispositivo resta in tempo reale.</p>
      <div className="mt-3 space-y-3">
        {METER_ROLES[module].map(({ role, label }) => {
          const parts = meterLines(sources.meters[role]);
          // Rows keep an empty line being filled; the saved plant drops it.
          const rows = (sources.meters[role] ?? '').split('\n');
          const write = (next: string[]) => onChange({ ...sources, meters: { ...sources.meters, [role]: next.join('\n') } });
          const error = issues.find((issue) => issue.field === role);
          return (
            <div key={role} className="space-y-1.5" role="group" aria-label={label}>
              <p className={`text-sm ${UI.title}`}>{label}</p>
              {rows.map((part, index) => {
                const inputId = `energy-${scope}-${role}-${index}`;
                return (
                  <div key={index} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={inputId} className="sr-only">{label} {index + 1}</label>
                      <EnergySensorPicker
                        id={inputId}
                        value={part}
                        options={options}
                        taken={taken}
                        placeholder="Cerca un contatore o scrivi fonte:nome"
                        invalid={Boolean(error)}
                        onChange={(value) => write(rows.map((item, at) => (at === index ? value : item)))}
                      />
                      {part ? <MeterStatusLine info={meters[part]} /> : null}
                    </div>
                    {rows.length > 1 || part ? (
                      <button type="button" onClick={() => write(rows.filter((_, at) => at !== index))} className={`${UI.chip} min-h-10`} aria-label={`Togli ${part || 'contatore vuoto'}`}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {parts.length > 1 ? (
                <p className="text-[11px] text-[color:var(--ui-warning)]">
                  Questi {parts.length} contatori verranno sommati: indicali solo se rappresentano fasce o parti diverse e nessuno include già il totale.
                </p>
              ) : null}
              {parts.length && rows.every((row) => row.trim()) ? (
                <button type="button" onClick={() => write([...rows, ''])} className={UI.chip}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Aggiungi un contatore da sommare
                </button>
              ) : null}
              {error ? <p className={ERROR_TEXT}>{error.message}</p> : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

const powerIssuesOf = (module: EnergyModuleId, issues: PlantIssue[]): DraftIssue[] =>
  issues
    .filter((issue) => issue.field && !['name', 'nominal', 'usable', 'total'].includes(issue.field) && !METER_ROLES[module].some((meter) => meter.role === issue.field))
    .map((issue) => ({ module, role: issue.field === 'power' ? undefined : issue.field, message: issue.message }));

export function DeviceEditor({
  module,
  device,
  index,
  haStates,
  discovery,
  meters,
  taken,
  issues,
  onChange,
}: Shared & { device: PlantDraftDevice; index: number; issues: PlantIssue[]; onChange: (device: PlantDraftDevice) => void }) {
  const field = (name: string) => issues.find((issue) => issue.field === name);
  const nameId = `energy-${device.id}-name`;
  const general = issues.find((issue) => !issue.field);
  const shared = { module, haStates, discovery, meters, taken };
  return (
    <div className="w-full space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={nameId} className={`block text-sm ${UI.title}`}>Nome</label>
        <input
          id={nameId}
          value={device.name}
          maxLength={80}
          placeholder={`${MODULE_META[module].label} ${index + 1}`}
          onChange={(event) => onChange({ ...device, name: event.target.value })}
          aria-invalid={Boolean(field('name'))}
          className="liquid-glass-control min-h-10 w-full rounded-xl px-3 text-sm"
        />
        {field('name') ? <p className={ERROR_TEXT}>{field('name')?.message}</p> : null}
        {device.stored.ha_device_id ? <p className={UI.muted}>Collegato a un dispositivo di Home Assistant.</p> : null}
      </div>
      <ModuleEditor
        id={module}
        instanceId={device.id}
        title="Potenza in tempo reale"
        hint="Sensori di potenza di questo dispositivo"
        toggleLabels={['Rimuovi i sensori di potenza', 'Aggiungi sensori di potenza']}
        module={device.power}
        offline={false}
        discovery={discovery}
        haStates={haStates}
        taken={taken}
        issues={powerIssuesOf(module, issues)}
        onChange={(power) => onChange({ ...device, power })}
      />
      <MetersEditor {...shared} scope={device.id} sources={device} issues={issues} onChange={(sources) => onChange({ ...device, ...sources })} />
      {module === 'battery' ? (
        <fieldset className={UI.card}>
          <legend className="sr-only">Capacità</legend>
          <p className={UI.title}>Capacità</p>
          <p className={UI.muted}>Serve per lo stato di carica complessivo di più batterie. Lascia vuoto se non la conosci.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['nominal', 'usable'] as const).map((kind) => (
              <div key={kind} className="space-y-1.5">
                <label htmlFor={`energy-${device.id}-${kind}`} className={`block text-sm ${UI.title}`}>{kind === 'nominal' ? 'Nominale (kWh)' : 'Utilizzabile (kWh)'}</label>
                <input
                  id={`energy-${device.id}-${kind}`}
                  inputMode="decimal"
                  value={device.capacity[kind]}
                  onChange={(event) => onChange({ ...device, capacity: { ...device.capacity, [kind]: event.target.value } })}
                  aria-invalid={Boolean(field(kind))}
                  className="liquid-glass-control min-h-10 w-full rounded-xl px-3 text-sm"
                />
                {field(kind) ? <p className={ERROR_TEXT}>{field(kind)?.message}</p> : null}
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {general ? <p className={ERROR_TEXT}>{general.message}</p> : null}
    </div>
  );
}

/** The sensor that already measures the whole module: authoritative, never added to the devices. */
export function TotalEditor({
  module,
  total,
  haStates,
  discovery,
  meters,
  taken,
  issues,
  onChange,
}: Shared & { total: PlantDraftSources; issues: PlantIssue[]; onChange: (total: PlantDraftSources | null) => void }) {
  const own = issues.filter((issue) => issue.field === 'total');
  return (
    <div className="w-full space-y-3">
      <p className={UI.body}>
        Il sensore totale misura l’intero modulo e diventa il suo valore: i dispositivi restano come dettaglio e non vengono sommati a esso. Indicalo solo se copre davvero tutti i dispositivi.
      </p>
      <ModuleEditor
        id={module}
        instanceId={`${module}-total`}
        title="Potenza totale"
        hint="Sensore che misura tutti i dispositivi insieme"
        toggleLabels={['Togli la potenza totale', 'Aggiungi la potenza totale']}
        module={total.power}
        offline={false}
        discovery={discovery}
        haStates={haStates}
        taken={taken}
        issues={own.map((issue) => ({ module, message: issue.message }))}
        onChange={(power) => onChange({ ...total, power })}
      />
      <MetersEditor module={module} scope={`${module}-total`} sources={total} haStates={haStates} discovery={discovery} meters={meters} taken={taken} issues={[]} onChange={onChange} />
      <button type="button" onClick={() => onChange(null)} className={UI.chip}>Rimuovi il sensore totale</button>
    </div>
  );
}

export const MODULE_ICONS: Record<EnergyModuleId, LucideIcon> = { grid: TowerControl, solar: SunMedium, home: Home, battery: Battery, wallbox: CarFront };

function totalSummary(total: PlantDraftSources) {
  const power = total.power.present ? Object.values(total.power.sensors).filter(Boolean) : [];
  return [...power, ...Object.values(total.meters).flatMap((parts) => meterLines(parts))].join(', ');
}

/**
 * One module of a plant: its total sensor and devices, each opening on its
 * editor, with removal and restore. Shared by the settings and the wizard;
 * only the wizard adds devices (`onAdd`).
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
  onAdd,
  addDisabled,
  ...shared
}: Omit<Shared, 'module' | 'taken'> & {
  module: EnergyModuleId;
  draft: PlantDraft;
  issues: PlantIssue[];
  open: string | null;
  onOpen: (key: string | null) => void;
  onDraft: (update: (current: PlantDraft) => PlantDraft) => void;
  offline?: boolean;
  /** Sensors taken by anything but this holder. */
  takenFor: (holder: string) => Record<string, string>;
  onAdd?: () => void;
  /** Why no device can be added, when none can. */
  addDisabled?: string;
}) {
  const plan = draft[module];
  if (!plan) return null;
  const Icon = MODULE_ICONS[module];
  const totalHolder = `${MODULE_META[module].label} · totale`;
  const totalOpen = open === `${module}:total`;
  const kept = plan.devices.filter((device) => !device.removed).length;
  return (
    <section aria-label={MODULE_META[module].label} className="border-t border-[color:var(--ui-separator)] first:border-t-0">
      <div className={`${ROW} border-t-0`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]">
          <Icon className="h-4 w-4 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
            {MODULE_META[module].label}
            {offline ? <span className="ml-2 text-[10px] font-semibold text-amber-500">Offline</span> : null}
          </p>
          <p className={UI.muted}>{plan.devices.length === 1 ? '1 dispositivo' : `${plan.devices.length} dispositivi`}</p>
        </div>
      </div>
      {plan.total ? (
        <div className={`${ROW} ${UI.muted}`}>
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-[color:var(--ui-text-secondary)]">Sensore totale</span> · misura l’intero modulo, i dispositivi sono il dettaglio.{' '}
            <span className="break-all font-mono">{totalSummary(plan.total)}</span>
          </span>
          <button type="button" aria-expanded={totalOpen} aria-label={`${totalOpen ? 'Chiudi' : 'Modifica'} il sensore totale di ${MODULE_META[module].label}`} onClick={() => onOpen(totalOpen ? null : `${module}:total`)} className={UI.chip}>
            {totalOpen ? 'Chiudi' : 'Modifica'}
          </button>
          {totalOpen ? (
            <TotalEditor
              {...shared}
              module={module}
              total={plan.total}
              taken={takenFor(totalHolder)}
              issues={issues.filter((issue) => issue.field === 'total')}
              onChange={(total) => onDraft((current) => setTotal(current, module, total))}
            />
          ) : null}
        </div>
      ) : kept >= 2 ? (
        <div className={ROW}>
          <button
            type="button"
            onClick={() => { onDraft((current) => setTotal(current, module, { power: { ...emptyPower(), present: true }, meters: {} })); onOpen(`${module}:total`); }}
            className={UI.chip}
          >
            Aggiungi un sensore totale
          </button>
        </div>
      ) : null}
      {plan.devices.map((device, index) => {
        const label = deviceLabel(module, device, index);
        const deviceIssues = issues.filter((issue) => issue.deviceId === device.id);
        const sensors = Object.values(device.power.present ? device.power.sensors : {}).filter(Boolean);
        const meterCount = Object.values(device.meters).reduce((count, parts) => count + meterLines(parts).length, 0);
        const isOpen = open === device.id && !device.removed;
        return (
          <div key={device.id} className={ROW}>
            <div className="min-w-0 flex-1 pl-12">
              <p className={`text-sm font-medium ${device.removed ? 'text-[color:var(--ui-text-tertiary)] line-through' : 'text-[color:var(--ui-text-primary)]'}`}>
                {label}{device.isNew ? <span className="ml-2 text-[10px] font-semibold text-[color:var(--ui-accent)]">Nuovo</span> : null}
              </p>
              <p className={`truncate ${UI.muted}`}>
                {device.removed
                  ? 'Verrà rimosso al salvataggio'
                  : [sensors.join(', ') || 'Nessun sensore di potenza', meterCount ? `${meterCount} ${meterCount === 1 ? 'contatore' : 'contatori'} di energia` : null].filter(Boolean).join(' · ')}
              </p>
              {deviceIssues.length && !isOpen ? <p className={ERROR_TEXT}>{deviceIssues[0].message}</p> : null}
            </div>
            {device.removed ? (
              <button type="button" onClick={() => onDraft((current) => updateDevice(current, module, { ...device, removed: false }))} className={UI.chip} aria-label={`Ripristina ${label}`}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Ripristina
              </button>
            ) : (
              <>
                <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Chiudi' : 'Modifica'} ${label}`} onClick={() => onOpen(isOpen ? null : device.id)} className={UI.chip}>
                  {isOpen ? 'Chiudi' : 'Modifica'}
                </button>
                <button type="button" onClick={() => { onDraft((current) => removeDevice(current, module, device.id)); onOpen(null); }} className={UI.chip} aria-label={`Rimuovi ${label}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            )}
            {isOpen ? (
              <DeviceEditor
                {...shared}
                module={module}
                device={device}
                index={index}
                taken={takenFor(label)}
                issues={deviceIssues}
                onChange={(next) => onDraft((current) => updateDevice(current, module, next))}
              />
            ) : null}
          </div>
        );
      })}
      {issues.filter((issue) => !issue.deviceId && issue.field !== 'total').map((issue) => (
        <p key={issue.message} className={`${ROW} ${ERROR_TEXT}`}>{issue.message}</p>
      ))}
      {onAdd ? (
        <div className={ROW}>
          <button type="button" onClick={onAdd} disabled={Boolean(addDisabled) || plan.devices.length >= MAX_DEVICES_PER_MODULE} className={UI.chip}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Aggiungi {DEVICE_NOUN[module]}
          </button>
          {addDisabled ? <p className={`w-full ${UI.muted}`}>{addDisabled}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
