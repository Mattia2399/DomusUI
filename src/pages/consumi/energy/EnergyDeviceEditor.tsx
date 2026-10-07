import React from 'react';
import { Battery, CarFront, Home, Plus, SunMedium, TowerControl, X, type LucideIcon } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import type { EnergyDiscovery, EnergyMeterInfo, EnergyMeterRole, EnergyMeterStatus, EnergyModuleId } from '../../../services/energyCoreClient';
import type { DraftIssue } from './energyDraft';
import { ERROR_TEXT, ModuleEditor } from './EnergyModuleEditor';
import { MODULE_META, UI } from './energyModel';
import { METER_ROLES, meterLines, type PlantDraftDevice, type PlantDraftSources, type PlantIssue } from './energyPlantDraft';
import { EnergySensorPicker } from './EnergySensorPicker';
import { sensorOptions, type SensorOption } from './energySensorCatalog';

/*
 * Advanced editors of one device and of a module total ("Configurazione
 * avanzata"): every sensor, meter, convention and capacity of the draft, with
 * the technical names. The guided views in EnergyGuidedDevice edit the same draft.
 */

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

export type Shared = {
  module: EnergyModuleId;
  haStates: MockEntityStateMap;
  discovery: EnergyDiscovery | null;
  meters: Record<string, EnergyMeterInfo>;
  /** Sensors used elsewhere in the plant, by holder. */
  taken: Record<string, string>;
};

/** The meters of one role: one picker per part, summed when several. */
export function MeterRoleRows({
  scope,
  role,
  label,
  sources,
  options,
  meters,
  taken,
  error,
  onChange,
}: {
  scope: string;
  role: EnergyMeterRole;
  label: string;
  sources: PlantDraftSources;
  options: SensorOption[];
  meters: Record<string, EnergyMeterInfo>;
  taken: Record<string, string>;
  error?: PlantIssue;
  onChange: (sources: PlantDraftSources) => void;
}) {
  const parts = meterLines(sources.meters[role]);
  // Rows keep an empty line being filled; the saved plant drops it.
  const rows = (sources.meters[role] ?? '').split('\n');
  const write = (next: string[]) => onChange({ ...sources, meters: { ...sources.meters, [role]: next.join('\n') } });
  return (
    <div className="space-y-1.5">
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
}

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
        {METER_ROLES[module].map(({ role, label }) => (
          <div key={role} className="space-y-1.5" role="group" aria-label={label}>
            <p className={`text-sm ${UI.title}`}>{label}</p>
            <MeterRoleRows
              scope={scope}
              role={role}
              label={label}
              sources={sources}
              options={options}
              meters={meters}
              taken={taken}
              error={issues.find((issue) => issue.field === role)}
              onChange={onChange}
            />
          </div>
        ))}
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

/** Sensors and meters of a total, in one line for the technical details. */
export function totalSummary(total: PlantDraftSources) {
  const power = total.power.present ? Object.values(total.power.sensors).filter(Boolean) : [];
  return [...power, ...Object.values(total.meters).flatMap((parts) => meterLines(parts))].join(', ');
}
