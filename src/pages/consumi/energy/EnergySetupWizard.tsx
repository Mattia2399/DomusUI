import React from 'react';
import { Check, LoaderCircle, Plus, Save, X } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  ENERGY_MODULES,
  discoverEnergy,
  getEnergyProfile,
  profileRevision,
  profileTariff,
  saveEnergyPlant,
  saveEnergyProfile,
  supportsProfileV2,
  supportsTariff,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyDiscovery,
  type EnergyDiscoveryV2,
  type EnergyDiscoveryV2Device,
  type EnergyMeterInfo,
  type EnergyModuleId,
  type EnergyPlant,
  type EnergyProfileResult,
} from '../../../services/energyCoreClient';
import { MODULE_ICONS, METER_STATUS, PlantModuleSection } from './EnergyDeviceEditor';
import { ERROR_TEXT } from './EnergyModuleEditor';
import { GROUP, TARIFF_HINT, TariffFields, isBlankTariff, tariffForm, tariffFromForm, tariffSummary } from './EnergyTariffFields';
import { MODULE_META, UI } from './energyModel';
import {
  AMBIGUITY_LABEL,
  WARNING_LABEL,
  applyChange,
  applyNewDevice,
  applyTotal,
  describeEvidence,
  discoveryV2,
  proposalsFromV1,
  reviewDiscovery,
} from './energyDiscoveryModel';
import {
  DEVICE_NOUN,
  addDevice,
  modulesFromPlant,
  pendingConfirmations,
  plantChanged,
  plantChanges,
  plantDraftFromProfile,
  plantFromDraft,
  plantFromModules,
  plantReferences,
  presentModules,
  removeDevice,
  reservedIds,
  takenSensors,
  validatePlantDraft,
  type PlantDraft,
} from './energyPlantDraft';
import { OTHER_PLANT, PlantPicker, plantModules } from './EnergyPlantPicker';
import { meterKnown, referenceCheck } from './energySensorCatalog';

/*
 * Guided setup on the Energy Profile v2 draft shared with the settings: a
 * first setup, a v1 plant (converted by the backend in memory, saved as v2
 * only on confirmation) and a v2 plant follow the same flow. Discovery only
 * proposes; each proposal is applied explicitly, configured devices are
 * never replaced, and nothing is saved before the final confirmation.
 */

export type WizardMode = 'setup' | 'edit' | 'rediscover';

type StepId = 'detect' | 'devices' | 'tariff' | 'summary';
const STEP_LABEL: Record<StepId, string> = {
  detect: 'Rilevamento',
  devices: 'Dispositivi',
  tariff: 'Tariffa',
  summary: 'Riepilogo',
};

type SaveState = { status: 'idle' | 'saving' | 'error'; message?: string; conflict?: boolean };

type Loaded = {
  result: EnergyProfileResult;
  /** Whether the integration stores Energy Profile v2 (otherwise one device per module, saved as v1). */
  v2: boolean;
  stored: EnergyPlant;
  reserved: Set<string>;
  /** The discovery as returned, for the sensor suggestions of the editors. */
  discovery: EnergyDiscovery | null;
  proposals: EnergyDiscoveryV2 | null;
  discoveryError: string;
  meters: Record<string, EnergyMeterInfo>;
};

const LEGACY_LIMIT = 'L’integrazione Domus UI installata salva un solo dispositivo per modulo, senza nomi, contatori né sensori totali: aggiornala per configurare questo impianto.';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{title}</h3>
      {children}
    </section>
  );
}

const CONFIDENCE: Record<string, string> = { high: 'confidenza alta', medium: 'confidenza media', low: 'confidenza bassa' };

function ProposalCard({
  proposal,
  meters,
  action,
}: {
  proposal: EnergyDiscoveryV2Device;
  meters: Record<string, EnergyMeterInfo>;
  action: React.ReactNode;
}) {
  const Icon = MODULE_ICONS[proposal.module];
  const roleName = (role: string) => MODULE_META[proposal.module].roles.find((spec) => spec.role === role)?.label ?? role;
  const evidence = describeEvidence([...(proposal.power ?? []).flatMap((item) => item.evidence), ...(proposal.energy ?? []).flatMap((item) => item.evidence)]);
  return (
    <li className={`${UI.card} space-y-2`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${UI.title}`}>{proposal.name ?? `${MODULE_META[proposal.module].label}: ${DEVICE_NOUN[proposal.module]} senza nome`}</p>
          <p className={UI.muted}>
            {MODULE_META[proposal.module].label}{proposal.integration ? ` · ${proposal.integration}` : ''}{proposal.confidence ? ` · ${CONFIDENCE[proposal.confidence]}` : ''}
          </p>
        </div>
        {action}
      </div>
      <ul className={`space-y-0.5 pl-7 ${UI.muted}`}>
        {(proposal.power ?? []).map((item) => (
          <li key={item.role} className="break-all"><span className="text-[color:var(--ui-text-secondary)]">{roleName(item.role)}:</span> <span className="font-mono">{item.entity_id}</span>{item.requires.length ? ' · da confermare il segno' : ''}</li>
        ))}
        {(proposal.energy ?? []).map((item) => (
          <li key={item.role} className="break-all">
            <span className="text-[color:var(--ui-text-secondary)]">Contatore:</span> <span className="font-mono">{item.statistic_ids.join(' + ')}</span>
            {item.statistic_ids.map((id) => meters[id] ? ` · ${METER_STATUS[meters[id].status].label}` : '').join('')}
          </li>
        ))}
        {evidence.length ? <li>Perché: {evidence.join(', ').toLowerCase()}</li> : null}
        {(proposal.warnings ?? []).filter((warning) => WARNING_LABEL[warning.code]).map((warning, index) => (
          <li key={index} className="text-[color:var(--ui-warning)]">{WARNING_LABEL[warning.code]}</li>
        ))}
      </ul>
    </li>
  );
}

export default function EnergySetupWizard({
  mode,
  callApi,
  haStates,
  onClose,
  onSaved,
}: {
  mode: WizardMode;
  callApi: EnergyCallApi;
  haStates: MockEntityStateMap;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<PlantDraft>({});
  const [applied, setApplied] = React.useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [save, setSave] = React.useState<SaveState>({ status: 'idle' });
  const [tariffDraft, setTariffDraft] = React.useState(() => tariffForm(null));
  const [skipTariff, setSkipTariff] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const focusOnStep = React.useRef(false);

  const load = React.useCallback(async () => {
    setLoaded(null);
    setLoadError(null);
    setSave({ status: 'idle' });
    const [profileResult, discoveryResult] = await Promise.allSettled([getEnergyProfile(callApi), discoverEnergy(callApi)]);
    if (profileResult.status === 'rejected') {
      setLoadError(toEnergyCoreError(profileResult.reason).message);
      return;
    }
    const result = profileResult.value;
    const v2 = supportsProfileV2(result);
    // A v1 plant comes from the backend's in-memory conversion; nothing is written by opening.
    const stored = v2 ? result.profile_v2!.plant : plantFromModules(result.profile?.modules ?? {});
    const found = discoveryResult.status === 'fulfilled' ? discoveryResult.value : null;
    const proposals = found ? discoveryV2(found) ?? proposalsFromV1(found, stored) : null;
    setDraft(plantDraftFromProfile(stored));
    setApplied({});
    setConfirmed(new Set());
    setTariffDraft(tariffForm(profileTariff(result)));
    setLoaded({
      result,
      v2,
      stored,
      reserved: reservedIds(stored, result.profile_v2?.retired_device_ids),
      discovery: found,
      proposals,
      discoveryError: discoveryResult.status === 'rejected' ? toEnergyCoreError(discoveryResult.reason).message : '',
      meters: { ...(result.energy_meters?.meters ?? {}), ...(proposals?.meters ?? {}) },
    });
    setStep(mode === 'edit' ? 1 : 0);
  }, [callApi, mode]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (focusOnStep.current) headingRef.current?.focus();
    focusOnStep.current = true;
  }, [step]);

  const known = React.useMemo(() => (loaded ? plantReferences(loaded.stored) : new Set<string>()), [loaded]);
  const check = React.useMemo(() => referenceCheck(haStates, loaded?.meters ?? {}, known), [haStates, loaded, known]);
  const issues = React.useMemo(() => validatePlantDraft(draft, check), [draft, check]);
  const saving = save.status === 'saving';

  const firstSetup = Boolean(loaded) && Object.keys(loaded!.stored).length === 0;
  const tariffSupported = loaded ? loaded.v2 || Boolean(loaded.result.profile && supportsTariff(loaded.result.profile)) : false;
  const steps: StepId[] = firstSetup && tariffSupported ? ['detect', 'devices', 'tariff', 'summary'] : ['detect', 'devices', 'summary'];
  const current = steps[Math.min(step, steps.length - 1)];

  // Full-height layout: own header, scrolling content, actions pinned to the bottom.
  const shell = (body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="flex h-full flex-col" onKeyDown={(event) => { if (event.key === 'Escape' && !saving) onClose(); }}>
      <header className="flex items-center gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className={UI.muted}>Configura Domus Energy{loaded ? ` · Passaggio ${step + 1} di ${steps.length}` : ''}</p>
          <h2 id="energy-step-title" ref={headingRef} tabIndex={-1} className={`truncate text-lg outline-none ${UI.title}`}>{STEP_LABEL[loaded ? current : 'detect']}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Chiudi configurazione" className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      {loaded ? (
        <ol className="flex gap-1 px-4 pt-3 sm:px-6" aria-label="Passaggi della configurazione">
          {steps.map((id, index) => (
            <li key={id} aria-current={index === step ? 'step' : undefined} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-[color:var(--ui-accent)]' : 'bg-[color:var(--ui-fill-secondary)]'}`}>
              <span className="sr-only">{index + 1}. {STEP_LABEL[id]}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-4">{body}</div>
      </div>
      {footer ? (
        <footer className="border-t border-[color:var(--ui-separator)] px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6">
          <div className="mx-auto max-w-5xl">{footer}</div>
        </footer>
      ) : null}
    </div>
  );

  if (loadError !== null) {
    return shell(
      <div role="alert" className={`space-y-3 ${UI.body}`}>
        <p>{loadError}</p>
        <button type="button" onClick={() => void load()} className={UI.button}>Riprova</button>
      </div>,
    );
  }
  if (!loaded) {
    return shell(<p role="status" className={`flex items-center gap-2 ${UI.body}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Ricerca dei dispositivi in Home Assistant…</p>);
  }

  const { result, v2, stored, reserved, proposals, meters } = loaded;
  const review = proposals ? reviewDiscovery(proposals) : null;
  const plant = plantFromDraft(draft);
  const legacyBlocked = !v2 && modulesFromPlant(plant) === null;
  const { tariff } = tariffFromForm(tariffDraft, Boolean(draft.grid?.devices.some((device) => !device.removed)));
  const tariffBlank = isBlankTariff(tariffDraft);
  // Nothing typed, or an explicit skip, leaves the tariff out of the save (the stored one is kept).
  const tariffToSave = steps.includes('tariff') && !skipTariff ? tariff : undefined;
  const dirty = plantChanged(draft, stored) || Boolean(tariffToSave);
  const confirmations = pendingConfirmations(stored, draft, (id) => meterKnown(haStates, meters, id));
  const unconfirmed = confirmations.filter((item) => !confirmed.has(item.key));
  const taken = takenSensors(draft);
  const takenFor = (holder: string) => Object.fromEntries(Object.entries(taken).filter(([, by]) => by !== holder));
  const present = presentModules(draft);
  const blocked = (current === 'devices' && issues.length > 0) || (current === 'tariff' && !tariffBlank && !tariff);

  const go = (target: StepId) => setStep(steps.indexOf(target));
  const addNew = (module: EnergyModuleId) => {
    const { draft: next, id } = addDevice(draft, module, reserved);
    setDraft(next);
    setOpen(id);
  };
  const applyDevice = (proposal: EnergyDiscoveryV2Device) => {
    const { draft: next, id } = applyNewDevice(draft, proposal, reserved, meters);
    setDraft(next);
    setApplied((current) => ({ ...current, [proposal.key]: id }));
  };
  const undoDevice = (proposal: EnergyDiscoveryV2Device) => {
    setDraft((current) => removeDevice(current, proposal.module, applied[proposal.key]));
    setApplied(({ [proposal.key]: _gone, ...rest }) => rest);
  };
  const eligible = review?.newDevices.filter((proposal) => proposal.eligible && !applied[proposal.key]) ?? [];
  // Still one explicit choice: only devices the discovery could match without doubt.
  const applyEligible = () => {
    let next = draft;
    const ids: Record<string, string> = {};
    for (const proposal of eligible) {
      const added = applyNewDevice(next, proposal, reserved, meters);
      next = added.draft;
      ids[proposal.key] = added.id;
    }
    setDraft(next);
    setApplied((current) => ({ ...current, ...ids }));
  };

  const handleSave = async () => {
    setSave({ status: 'saving' });
    try {
      if (v2) await saveEnergyPlant(callApi, plant, profileRevision(result), tariffToSave);
      else await saveEnergyProfile(callApi, modulesFromPlant(plant) ?? {}, profileRevision(result), tariffToSave);
      onSaved();
    } catch (failure) {
      // The draft stays untouched so the user can retry or adjust it; nothing is merged.
      const error = toEnergyCoreError(failure);
      setSave({ status: 'error', message: error.message, conflict: error.code === 'revision_conflict' });
    }
  };

  const changes = plantChanges(stored, draft);

  return shell(
    <>
      {result.legacy_v1?.diverged ? (
        <p role="note" className={`${UI.card} text-sm text-[color:var(--ui-warning)]`}>
          Una versione precedente di Domus UI ha modificato l’impianto dopo l’aggiornamento: quelle modifiche non sono state applicate. Qui parti dalla configurazione attuale.
        </p>
      ) : null}
      {result.profile_v2?.load_error || result.profile?.load_error ? (
        <p role="note" className={`${UI.card} text-sm text-[color:var(--ui-warning)]`}>Il profilo salvato non era leggibile ed è stato ignorato: salvando ne crei uno nuovo.</p>
      ) : null}

      {current === 'detect' ? (
        <>
          <p className={UI.body}>
            Domus ha cercato inverter, batterie, wallbox, contatori di rete e contatori di energia tra i dispositivi di Home Assistant. Sono solo proposte: scegli tu cosa aggiungere, nulla viene salvato prima del riepilogo.
          </p>
          {review?.verificationIncomplete ? (
            <p role="status" className={`${UI.card} ${UI.muted}`}>Verifica dei contatori incompleta: Home Assistant o il suo Recorder si stanno avviando. I contatori restano proponibili; ripeti il rilevamento più tardi per verificarli.</p>
          ) : null}
          {!v2 ? <p role="note" className={`${UI.card} ${UI.muted}`}>{LEGACY_LIMIT}</p> : null}
          {!proposals ? (
            <div className={UI.card}>
              <p className={UI.title}>Rilevamento automatico non riuscito</p>
              <p className={`mt-1 ${UI.body}`}>{loaded.discoveryError} Nel passaggio successivo puoi comunque scegliere tu i dispositivi.</p>
            </div>
          ) : !proposals.devices.length && !proposals.totals.length ? (
            <div className={UI.card}>
              <p className={UI.title}>Nessun dispositivo riconosciuto automaticamente</p>
              <p className={`mt-1 ${UI.body}`}>Non è un errore: nel passaggio successivo scegli tu i dispositivi che hai in casa e i loro sensori.</p>
              {loaded.discovery?.energy_dashboard !== 'used' ? (
                <p className={`mt-2 ${UI.muted}`}>Suggerimento: se imposti i contatori nella Dashboard Energia di Home Assistant, Domus potrà proporli in automatico.</p>
              ) : null}
            </div>
          ) : null}
          {review?.newDevices.length ? (
            <Section title="Nuovi dispositivi">
              <ul className="grid gap-2 lg:grid-cols-2">
                {review.newDevices.map((proposal) => (
                  <ProposalCard
                    key={proposal.key}
                    proposal={proposal}
                    meters={meters}
                    action={applied[proposal.key] ? (
                      <button type="button" onClick={() => undoDevice(proposal)} className={UI.chip} aria-label={`Togli ${proposal.name ?? DEVICE_NOUN[proposal.module]}`}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Aggiunto
                      </button>
                    ) : (
                      <button type="button" onClick={() => applyDevice(proposal)} className={UI.chip} aria-label={`Aggiungi ${proposal.name ?? DEVICE_NOUN[proposal.module]}`}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Aggiungi
                      </button>
                    )}
                  />
                ))}
              </ul>
              {eligible.length > 1 ? (
                <button type="button" onClick={applyEligible} className={UI.button}>
                  Aggiungi i {eligible.length} dispositivi affidabili
                </button>
              ) : null}
            </Section>
          ) : null}
          {review?.changes.length ? (
            <Section title="Proposte per i dispositivi configurati">
              <ul className="space-y-2">
                {review.changes.flatMap((proposal) => [
                  ...(proposal.additions ?? []).map((change) => ({ proposal, change, kind: 'Nuova sorgente' })),
                  ...(proposal.corrections ?? []).map((change) => ({ proposal, change, kind: 'Possibile correzione' })),
                ]).map(({ proposal, change, kind }) => {
                  const key = `${proposal.key}:${change.kind}:${change.role}`;
                  const ids = 'ids' in change ? change.ids : change.proposed;
                  const device = proposal.device_id ? draft[proposal.module]?.devices.find((item) => item.id === proposal.device_id) : undefined;
                  return (
                    <li key={key} className={`${UI.card} flex flex-wrap items-center justify-between gap-2 text-sm`}>
                      <span className="min-w-0">
                        <span className={UI.title}>{kind}</span> · {MODULE_META[proposal.module].label} · {device?.name || proposal.name || proposal.device_id}:{' '}
                        <span className="break-all font-mono">{'configured' in change ? `${change.configured.join(' + ')} → ` : ''}{ids.join(' + ')}</span>
                      </span>
                      {applied[key] ? (
                        <span className={UI.muted}><Check className="inline h-3.5 w-3.5" aria-hidden="true" /> Applicata</span>
                      ) : (
                        <button type="button" disabled={!device} onClick={() => { setDraft((currentDraft) => applyChange(currentDraft, proposal.module, proposal.device_id!, change)); setApplied((current) => ({ ...current, [key]: 'applied' })); }} className={UI.chip}>Applica</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
          {review && (review.verifiedTotals.length || review.presumedTotals.length) ? (
            <Section title="Sensori totali">
              <ul className="space-y-2">
                {[...review.verifiedTotals, ...review.presumedTotals].map((total) => {
                  const key = `total:${total.module}:${total.kind}:${total.role}`;
                  return (
                    <li key={key} className={`${UI.card} flex flex-wrap items-center justify-between gap-2 text-sm`}>
                      <span className="min-w-0">
                        <span className={UI.title}>{MODULE_META[total.module].label}</span>: <span className="break-all font-mono">{total.ids.join(', ')}</span>
                        <span className={`block ${total.status === 'verified' ? UI.muted : 'text-xs text-[color:var(--ui-warning)]'}`}>
                          {total.status === 'verified'
                            ? 'Somma calcolata da Home Assistant: misura l’intero modulo e non viene sommata ai dispositivi.'
                            : 'Sembra un totale, ma non è verificato: usalo solo se misura davvero tutti i dispositivi.'}
                        </span>
                      </span>
                      {applied[key] ? <span className={UI.muted}><Check className="inline h-3.5 w-3.5" aria-hidden="true" /> Usato</span> : (
                        <button type="button" onClick={() => { setDraft((currentDraft) => applyTotal(currentDraft, total)); setApplied((current) => ({ ...current, [key]: 'applied' })); }} className={UI.chip}>
                          {total.status === 'verified' ? 'Usa come totale' : 'Usa comunque come totale'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
          {review && (review.ambiguous.length || review.conflicts.length) ? (
            <Section title="Da decidere">
              <ul className={`list-disc space-y-1 pl-5 ${UI.body}`}>
                {review.ambiguous.map((item, index) => (
                  <li key={`a${index}`}>
                    {item.module ? `${MODULE_META[item.module].label}: ` : ''}{AMBIGUITY_LABEL[item.reason] ?? item.reason} <span className="break-all font-mono text-xs">({item.entity_ids.join(', ')})</span>
                  </li>
                ))}
                {review.conflicts.map((item) => <li key={item.key}>{MODULE_META[item.module].label}: {item.name ?? 'un dispositivo'} corrisponde a più dispositivi configurati.</li>)}
              </ul>
              <p className={UI.muted}>Domus non sceglie al posto tuo: nel passaggio successivo indica i sensori giusti.</p>
            </Section>
          ) : null}
          {review && (review.configured.length || review.notDetected.length) ? (
            <p className={UI.muted}>
              Dispositivi già configurati: {review.configured.length + review.notDetected.length + review.changes.length}. Restano come sono finché non applichi una proposta.
            </p>
          ) : null}
          {proposals?.low_confidence.length ? (
            <p className={UI.muted}>Altri {proposals.low_confidence.length} sensori sono stati trovati solo per nome: puoi sceglierli tu nel passaggio successivo.</p>
          ) : null}
        </>
      ) : null}

      {current === 'devices' ? (
        <>
          {!present.length && firstSetup ? (
            <>
              <p className={UI.body}>Che impianto hai? Domus aggiunge un dispositivo per ogni componente; potrai aggiungerne altri e sceglierne i sensori.</p>
              <PlantPicker
                value={null}
                onSelect={(plantId) => {
                  if (plantId === OTHER_PLANT) return;
                  let next = draft;
                  for (const module of plantModules(plantId)) next = addDevice(next, module, reserved).draft;
                  setDraft(next);
                }}
              />
            </>
          ) : (
            <p className={UI.body}>Ogni dispositivo ha i suoi sensori di potenza e, se vuoi, i contatori di energia per lo storico. Quelli già configurati restano come sono finché non li modifichi.</p>
          )}
          <div className={GROUP}>
            {ENERGY_MODULES.filter((id) => draft[id]?.devices.length).map((id) => (
              <PlantModuleSection
                key={id}
                module={id}
                draft={draft}
                haStates={haStates}
                discovery={loaded.discovery}
                meters={meters}
                issues={issues.filter((issue) => issue.module === id)}
                open={open}
                onOpen={setOpen}
                onDraft={setDraft}
                offline={result.module_status[id] === 'offline'}
                takenFor={takenFor}
                onAdd={() => addNew(id)}
                addDisabled={!v2 && (draft[id]?.devices.filter((device) => !device.removed).length ?? 0) >= 1 ? 'Più dispositivi richiedono l’aggiornamento dell’integrazione Domus UI.' : undefined}
              />
            ))}
          </div>
          {ENERGY_MODULES.some((id) => !draft[id]?.devices.length) ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Aggiungi un componente">
              {ENERGY_MODULES.filter((id) => !draft[id]?.devices.length).map((id) => (
                <button key={id} type="button" onClick={() => addNew(id)} className={UI.chip}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {MODULE_META[id].label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {current === 'tariff' ? (
        <div className="mx-auto max-w-3xl space-y-3">
          <p className={UI.body}>
            Facoltativo: con i prezzi del contratto Domus mostra la fascia attuale e il suo costo. Puoi saltare questo passaggio e aggiungerli più tardi dalle Impostazioni.
          </p>
          <p className={UI.muted}>{TARIFF_HINT}</p>
          <div className={GROUP} role="group" aria-label="Tariffa">
            <TariffFields form={tariffDraft} onChange={setTariffDraft} withExport={present.includes('grid')} />
          </div>
        </div>
      ) : null}

      {current === 'summary' ? (
        <div className={`space-y-4 ${UI.body}`}>
          <Section title="Impianto">
            {present.length ? (
              <ul className="space-y-1">
                {present.map((id) => {
                  const count = plant[id]?.devices.length ?? 0;
                  return <li key={id}><span className={UI.title}>{MODULE_META[id].label}</span>: {count === 1 ? '1 dispositivo' : `${count} dispositivi`}{plant[id]?.total ? ' e un sensore totale' : ''}</li>;
                })}
              </ul>
            ) : <p>Nessun dispositivo: Domus Energy risulterà non configurato.</p>}
          </Section>
          <Section title="Modifiche">
            {changes.length ? (
              <ul className="space-y-2">
                {changes.map((change, index) => (
                  <li key={index} className={UI.card}>
                    <p className={UI.title}>{change.title}</p>
                    {change.details.length ? <ul className={`mt-1 space-y-0.5 ${UI.muted}`}>{change.details.map((detail) => <li key={detail} className="break-all">{detail}</li>)}</ul> : null}
                  </li>
                ))}
              </ul>
            ) : <p className={UI.muted}>Nessuna modifica all’impianto salvato.</p>}
            {tariffToSave ? <p><span className={UI.title}>Tariffa:</span> {tariffSummary(tariffToSave)}</p> : null}
            {steps.includes('tariff') && !tariffToSave ? <p className={UI.muted}>Tariffa non configurata: potrai aggiungerla dalle Impostazioni.</p> : null}
          </Section>
          {issues.length || legacyBlocked ? (
            <Section title="Da correggere">
              <ul className={`list-disc space-y-1 pl-5 ${ERROR_TEXT}`}>
                {legacyBlocked ? <li>{LEGACY_LIMIT}</li> : null}
                {issues.map((issue, index) => <li key={index}>{MODULE_META[issue.module].label}: {issue.message}</li>)}
              </ul>
              <button type="button" onClick={() => go('devices')} className={UI.chip}>Torna ai dispositivi</button>
            </Section>
          ) : null}
          {confirmations.length ? (
            <Section title="Da confermare">
              <ul className="space-y-2">
                {confirmations.map((item) => (
                  <li key={item.key}>
                    <label className={`${UI.card} flex cursor-pointer items-start gap-2 text-sm`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={confirmed.has(item.key)}
                        onChange={(event) => setConfirmed((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(item.key);
                          else next.delete(item.key);
                          return next;
                        })}
                      />
                      <span>{item.message}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {review?.verificationIncomplete ? <p className={UI.muted}>Alcuni contatori non sono ancora verificabili: Home Assistant li verificherà quando il Recorder sarà pronto.</p> : null}
          <div aria-live="polite">
            {saving ? <p className="flex items-center gap-2"><LoaderCircle className={UI.spin} aria-hidden="true" /> Salvataggio in corso…</p> : null}
            {save.status === 'error' ? (
              <div role="alert" className="space-y-2 text-[color:var(--ui-danger)]">
                <p>{save.message} Le modifiche non salvate restano qui.</p>
                {save.conflict ? (
                  <button type="button" onClick={() => void load()} className={UI.chip}>Carica la versione salvata (scarta la bozza)</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>,
    <>
      {blocked ? (
        <p id="energy-step-blocked" className={`mb-2 ${ERROR_TEXT}`}>
          {current === 'tariff' ? 'Correggi i prezzi evidenziati oppure salta questo passaggio.' : 'Completa o correggi i dispositivi evidenziati per continuare.'}
        </p>
      ) : null}
      <div className="flex gap-2 sm:justify-end">
        {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} disabled={saving} className={`${UI.button} flex-1 justify-center sm:flex-none`}>Indietro</button> : null}
        {current === 'detect' && present.length && !issues.length ? (
          <button type="button" onClick={() => go(steps.includes('tariff') ? 'tariff' : 'summary')} className={`${UI.button} flex-1 justify-center sm:flex-none`}>Conferma impianto</button>
        ) : null}
        {current === 'tariff' && !tariffBlank ? (
          <button type="button" onClick={() => { setSkipTariff(true); setStep(step + 1); }} className={`${UI.button} flex-1 justify-center sm:flex-none`}>Salta</button>
        ) : null}
        {current !== 'summary' ? (
          <button
            type="button"
            onClick={() => { if (current === 'tariff') setSkipTariff(false); setStep(step + 1); }}
            disabled={blocked}
            aria-describedby={blocked ? 'energy-step-blocked' : undefined}
            className={`${UI.primary} flex-1 justify-center sm:flex-none`}
          >
            {current === 'tariff' && tariffBlank ? 'Salta per ora' : 'Avanti'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || issues.length > 0 || legacyBlocked || unconfirmed.length > 0 || !dirty}
            className={`${UI.primary} flex-1 justify-center sm:flex-none`}
          >
            {saving ? <LoaderCircle className={UI.spin} aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Salva impianto
          </button>
        )}
      </div>
    </>,
  );
}
