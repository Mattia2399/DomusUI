import React from 'react';
import { Battery, CarFront, Home, LoaderCircle, SunMedium, TowerControl, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  ENERGY_MODULES,
  profileRevision,
  saveEnergyPlant,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyDiscovery,
  type EnergyMeterInfo,
  type EnergyMeterStatus,
  type EnergyModuleId,
  type EnergyProfileResult,
  type EnergySources,
} from '../../../services/energyCoreClient';
import type { DraftIssue } from './energyDraft';
import { ERROR_TEXT, ModuleEditor } from './EnergyModuleEditor';
import { ROW } from './EnergyTariffFields';
import { MODULE_META, UI } from './energyModel';
import {
  METER_ROLES,
  deviceLabel,
  plantChanged,
  plantDraftFromProfile,
  plantFromDraft,
  removedDevices,
  validatePlantDraft,
  type PlantDraft,
  type PlantDraftDevice,
  type PlantIssue,
} from './energyPlantDraft';

/*
 * Settings of an Energy Profile v2 plant (several devices, meters, a total):
 * existing devices are edited and saved as a whole plant. Adding devices is
 * the multi-device setup's job; nothing here is saved without the backend.
 */

const ICONS: Record<EnergyModuleId, LucideIcon> = { grid: TowerControl, solar: SunMedium, home: Home, battery: Battery, wallbox: CarFront };

export const METER_STATUS: Record<EnergyMeterStatus, { label: string; tone: string }> = {
  valid: { label: 'Valido', tone: 'text-[color:var(--ui-success)]' },
  pending: { label: 'In attesa delle prime statistiche', tone: 'text-[color:var(--ui-text-secondary)]' },
  unavailable: { label: 'Non disponibile ora', tone: 'text-[color:var(--ui-warning)]' },
  incompatible: { label: 'Non compatibile', tone: 'text-[color:var(--ui-danger)]' },
  unknown: { label: 'Non trovato', tone: 'text-[color:var(--ui-warning)]' },
  recorder_unavailable: { label: 'Non verificabile ora', tone: 'text-[color:var(--ui-text-secondary)]' },
};

const METER_REASON: Record<string, string> = {
  awaiting_first_statistics: 'Home Assistant crea le statistiche entro pochi minuti.',
  recorder_starting: 'Home Assistant si sta avviando: riapri le impostazioni tra poco.',
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

function MeterStatusLine({ info }: { info: EnergyMeterInfo | undefined }) {
  if (!info) return null;
  const status = METER_STATUS[info.status];
  return (
    <span className={`block text-[11px] ${status.tone}`}>
      {status.label}{info.unit ? ` · ${info.unit}` : ''}{info.reason && METER_REASON[info.reason] ? ` · ${METER_REASON[info.reason]}` : ''}
    </span>
  );
}

function totalSummary(total: EnergySources) {
  return [...Object.values(total.power?.sensors ?? {}), ...Object.values(total.energy ?? {}).flat()].join(', ');
}

function DeviceEditor({
  module,
  device,
  index,
  discovery,
  haStates,
  meters,
  issues,
  onChange,
}: {
  module: EnergyModuleId;
  device: PlantDraftDevice;
  index: number;
  discovery: EnergyDiscovery | null;
  haStates: MockEntityStateMap;
  meters: Record<string, EnergyMeterInfo>;
  issues: PlantIssue[];
  onChange: (device: PlantDraftDevice) => void;
}) {
  const field = (name: string) => issues.find((issue) => issue.field === name);
  const nameId = `energy-${device.id}-name`;
  const powerIssues: DraftIssue[] = issues
    .filter((issue) => issue.field && issue.field !== 'name' && !METER_ROLES[module].some((meter) => meter.role === issue.field) && issue.field !== 'nominal' && issue.field !== 'usable')
    .map((issue) => ({ module, role: issue.field === 'power' ? undefined : issue.field, message: issue.message }));
  const general = issues.find((issue) => !issue.field);
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
        issues={powerIssues}
        onChange={(power) => onChange({ ...device, power })}
      />
      <fieldset className={UI.card}>
        <legend className="sr-only">Contatori di energia</legend>
        <p className={UI.title}>Contatori di energia</p>
        <p className={UI.muted}>Statistiche di Home Assistant, una per riga (sensor.… o fonte:nome). Più righe vengono sommate: indicale solo se non si sovrappongono, come le fasce F1, F2 e F3.</p>
        <div className="mt-3 space-y-3">
          {METER_ROLES[module].map(({ role, label }) => {
            const inputId = `energy-${device.id}-${role}`;
            const ids = (device.meters[role] ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
            return (
              <div key={role} className="space-y-1.5">
                <label htmlFor={inputId} className={`block text-sm ${UI.title}`}>{label}</label>
                <textarea
                  id={inputId}
                  rows={Math.max(1, ids.length)}
                  value={device.meters[role] ?? ''}
                  spellCheck={false}
                  onChange={(event) => onChange({ ...device, meters: { ...device.meters, [role]: event.target.value } })}
                  aria-invalid={Boolean(field(role))}
                  className="liquid-glass-control min-h-10 w-full rounded-xl px-3 py-2 font-mono text-sm"
                />
                {field(role) ? <p className={ERROR_TEXT}>{field(role)?.message}</p> : null}
                {ids.length ? (
                  <ul className="space-y-0.5">
                    {ids.map((id) => (
                      <li key={id} className="text-[11px]">
                        <span className="break-all font-mono text-[color:var(--ui-text-tertiary)]">{id}</span>
                        <MeterStatusLine info={meters[id]} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
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

type Status = { saving?: boolean; message?: string; error?: boolean };

export function EnergyPlantSettings({
  result,
  callApi,
  haStates,
  discovery,
  initialModule = null,
  onSaved,
}: {
  result: EnergyProfileResult & { profile_v2: NonNullable<EnergyProfileResult['profile_v2']> };
  callApi: EnergyCallApi;
  haStates: MockEntityStateMap;
  discovery: EnergyDiscovery | null;
  initialModule?: EnergyModuleId | null;
  onSaved: (result: EnergyProfileResult) => void;
}) {
  const stored = result.profile_v2.plant;
  const [draft, setDraft] = React.useState<PlantDraft>(() => plantDraftFromProfile(stored));
  const [open, setOpen] = React.useState<string | null>(() => {
    const devices = initialModule ? stored[initialModule]?.devices ?? [] : [];
    return devices.length === 1 ? devices[0].id : null;
  });
  const [confirming, setConfirming] = React.useState(false);
  const [status, setStatus] = React.useState<Status>({});
  React.useEffect(() => setDraft(plantDraftFromProfile(stored)), [stored]);

  const meters = result.energy_meters?.meters ?? {};
  const issues = validatePlantDraft(draft);
  const changed = plantChanged(draft, stored);
  const removals = removedDevices(draft);
  const incomplete = result.energy_meters && (result.energy_meters.recorder === 'unavailable' || result.energy_meters.verification === 'incomplete');

  const update = (module: EnergyModuleId, device: PlantDraftDevice) =>
    setDraft((current) => ({
      ...current,
      [module]: { ...current[module]!, devices: current[module]!.devices.map((item) => (item.id === device.id ? device : item)) },
    }));

  const save = async () => {
    setConfirming(false);
    setStatus({ saving: true });
    try {
      // The whole plant, every untouched device included; the tariff is kept.
      const next = await saveEnergyPlant(callApi, plantFromDraft(draft), profileRevision(result));
      setOpen(null);
      setStatus({ message: 'Impianto salvato.' });
      onSaved(next);
    } catch (failure) {
      setStatus({ error: true, message: `${toEnergyCoreError(failure).message} Le modifiche restano qui.` });
    }
  };

  return (
    <>
      {incomplete ? (
        <p role="status" className={`${ROW} ${UI.muted}`}>
          Verifica dei contatori incompleta: {result.energy_meters?.recorder === 'unavailable' ? 'il Recorder di Home Assistant non è attivo' : 'Home Assistant si sta ancora avviando'}. I contatori restano configurati; riapri le impostazioni più tardi per verificarli.
        </p>
      ) : null}
      {ENERGY_MODULES.filter((id) => draft[id]).map((id) => {
        const Icon = ICONS[id];
        const module = draft[id]!;
        const moduleStatus = result.module_status[id];
        return (
          <section key={id} aria-label={MODULE_META[id].label} className="border-t border-[color:var(--ui-separator)] first:border-t-0">
            <div className={`${ROW} border-t-0`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]">
                <Icon className="h-4 w-4 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
                  {MODULE_META[id].label}
                  {moduleStatus === 'offline' ? <span className="ml-2 text-[10px] font-semibold text-amber-500">Offline</span> : null}
                </p>
                <p className={UI.muted}>{module.devices.length === 1 ? '1 dispositivo' : `${module.devices.length} dispositivi`}</p>
              </div>
            </div>
            {module.total ? (
              <div className={`${ROW} ${UI.muted}`}>
                <span className="w-full">
                  <span className="font-semibold text-[color:var(--ui-text-secondary)]">Sensore totale</span> · misura l’intero modulo, i dispositivi sono il dettaglio.{' '}
                  <span className="break-all font-mono">{totalSummary(module.total)}</span>
                </span>
              </div>
            ) : null}
            {module.devices.map((device, index) => {
              const label = deviceLabel(id, device, index);
              const deviceIssues = issues.filter((issue) => issue.deviceId === device.id);
              const sensors = Object.values(device.power.present ? device.power.sensors : {}).filter(Boolean);
              const meterCount = METER_ROLES[id].reduce((count, { role }) => count + (device.meters[role]?.split(/[\n,]/).filter((item) => item.trim()).length ?? 0), 0);
              const isOpen = open === device.id && !device.removed;
              return (
                <div key={device.id} className={ROW}>
                  <div className="min-w-0 flex-1 pl-12">
                    <p className={`text-sm font-medium ${device.removed ? 'text-[color:var(--ui-text-tertiary)] line-through' : 'text-[color:var(--ui-text-primary)]'}`}>{label}</p>
                    <p className={`truncate ${UI.muted}`}>
                      {device.removed
                        ? 'Verrà rimosso al salvataggio'
                        : [sensors.join(', ') || 'Nessun sensore di potenza', meterCount ? `${meterCount} ${meterCount === 1 ? 'contatore' : 'contatori'} di energia` : null].filter(Boolean).join(' · ')}
                    </p>
                    {deviceIssues.length && !isOpen ? <p className={ERROR_TEXT}>{deviceIssues[0].message}</p> : null}
                  </div>
                  {device.removed ? (
                    <button type="button" onClick={() => update(id, { ...device, removed: false })} className={UI.chip} aria-label={`Ripristina ${label}`}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Ripristina
                    </button>
                  ) : (
                    <>
                      <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Chiudi' : 'Modifica'} ${label}`} onClick={() => setOpen(isOpen ? null : device.id)} className={UI.chip}>
                        {isOpen ? 'Chiudi' : 'Modifica'}
                      </button>
                      <button type="button" onClick={() => { update(id, { ...device, removed: true }); setOpen(null); }} className={UI.chip} aria-label={`Rimuovi ${label}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                  {isOpen ? (
                    <DeviceEditor
                      module={id}
                      device={device}
                      index={index}
                      discovery={discovery}
                      haStates={haStates}
                      meters={meters}
                      issues={deviceIssues}
                      onChange={(next) => update(id, next)}
                    />
                  ) : null}
                </div>
              );
            })}
            {issues.filter((issue) => issue.module === id && !issue.deviceId).map((issue) => (
              <p key={issue.message} className={`${ROW} ${ERROR_TEXT}`}>{issue.message}</p>
            ))}
          </section>
        );
      })}
      <p className={`${ROW} ${UI.muted}`}>
        Per aggiungere inverter, batterie o wallbox servirà il rilevamento guidato multi-dispositivo: qui si modificano quelli già configurati.
      </p>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="energy-remove-title" aria-describedby="energy-remove-text" className={`${ROW} bg-[color:var(--ui-fill-tertiary)]`}>
          <div className="w-full">
            <p id="energy-remove-title" className={UI.title}>Rimuovere {removals.length === 1 ? 'un dispositivo' : `${removals.length} dispositivi`}?</p>
            <p id="energy-remove-text" className={UI.body}>
              {removals.map(({ module, device }) => deviceLabel(module, device, draft[module]!.devices.indexOf(device))).join(', ')}: i loro sensori e contatori non verranno più letti e i loro identificativi non potranno essere riutilizzati.
            </p>
          </div>
          <div className="flex w-full justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={UI.button} autoFocus>Annulla</button>
            <button type="button" onClick={() => void save()} className={UI.primary}>Rimuovi e salva</button>
          </div>
        </div>
      ) : null}
      <div className={`${ROW} justify-end`}>
        {changed ? (
          <button type="button" onClick={() => { setDraft(plantDraftFromProfile(stored)); setOpen(null); setConfirming(false); }} className={UI.button}>Annulla</button>
        ) : null}
        <button
          type="button"
          disabled={!changed || issues.length > 0 || status.saving || confirming}
          onClick={() => (removals.length ? setConfirming(true) : void save())}
          className={UI.primary}
        >
          Salva impianto
        </button>
        <div className="w-full text-right">
          {status.saving ? (
            <p role="status" className={`inline-flex items-center gap-2 ${UI.muted}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Salvataggio…</p>
          ) : status.message ? (
            <p role={status.error ? 'alert' : 'status'} className={status.error ? ERROR_TEXT : 'text-xs text-[color:var(--ui-success)]'}>{status.message}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
