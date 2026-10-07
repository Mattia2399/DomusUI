import React from 'react';
import { Check, LoaderCircle, Plus, Save, SlidersHorizontal, Sparkles, X } from 'lucide-react';
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
  type EnergyMeterRole,
  type EnergyModuleId,
  type EnergyPlant,
  type EnergyProfileResult,
} from '../../../services/energyCoreClient';
import {
  DeviceCard,
  DeviceDetail,
  ModuleIcon,
  SourcesHistory,
  StatusBadge,
  TechDetails,
  TotalCard,
  deviceStatus,
} from './EnergyGuidedDevice';
import { ERROR_TEXT } from './EnergyModuleEditor';
import { GROUP, TARIFF_HINT, TariffFields, isBlankTariff, tariffForm, tariffFromForm, tariffSummary } from './EnergyTariffFields';
import { Findings, PlantChoice, PlantMap, SuccessView, TITLE, WelcomeView, type MapNode } from './EnergyWizardViews';
import { MODULE_META, UI } from './energyModel';
import { AMBIGUITY_LABEL, applyChange, applyNewDevice, applyTotal, discoveryV2, proposalsFromV1, reviewDiscovery } from './energyDiscoveryModel';
import {
  CONFIDENCE_TEXT,
  HISTORY_TEXT,
  MODULE_WORDS,
  count,
  moduleFindings,
  plantCounts,
  plural,
  recommendedSensor,
  sensorName,
  type GuideStatus,
} from './energyGuide';
import {
  MAX_DEVICES_PER_MODULE,
  METER_ROLES,
  addDevice,
  deviceLabel,
  emptyPower,
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
  setTotal,
  takenSensors,
  updateDevice,
  validatePlantDraft,
  type Confirmation,
  type PlantDraft,
  type PlantIssue,
} from './energyPlantDraft';
import { meterKnown, referenceCheck } from './energySensorCatalog';

/*
 * Guided setup on the Energy Profile v2 draft shared with the settings. A
 * first setup, a v1 plant (converted by the backend in memory, saved as v2
 * only on confirmation) and a v2 plant follow the same adaptive path: one
 * screen per decision, one step per component of the plant. Discovery only
 * proposes; each proposal is applied by an explicit action, configured devices
 * are never replaced, and nothing is saved before the final check.
 */

export type WizardMode = 'setup' | 'edit' | 'rediscover';

const ORDER: EnergyModuleId[] = ['grid', 'solar', 'battery', 'wallbox', 'home'];
type ModuleStep = `module:${EnergyModuleId}`;
type StepId = 'welcome' | 'plant' | 'detect' | ModuleStep | 'history' | 'tariff' | 'summary';

const STEP_LABEL: Record<string, string> = {
  welcome: 'Benvenuto',
  plant: 'Il tuo impianto',
  detect: 'Rilevamento automatico',
  'module:grid': 'Rete elettrica',
  'module:solar': 'Fotovoltaico',
  'module:battery': 'Batteria',
  'module:wallbox': 'Wallbox',
  'module:home': 'Consumi della casa',
  history: 'Storico dei consumi',
  tariff: 'Tariffa',
  summary: 'Controllo finale',
};

const moduleOf = (step: StepId) => (step.startsWith('module:') ? (step.slice(7) as EnergyModuleId) : null);
const isMeterField = (issue: PlantIssue) => ENERGY_MODULES.some((id) => METER_ROLES[id].some(({ role }) => role === issue.field));

type SaveState = { status: 'idle' | 'saving' | 'error'; message?: string; conflict?: boolean };

type Loaded = {
  result: EnergyProfileResult;
  /** Whether the integration stores Energy Profile v2 (otherwise one device per module, saved as v1). */
  v2: boolean;
  stored: EnergyPlant;
  reserved: Set<string>;
  /** The discovery as returned, for names and the suggestions of the editors. */
  discovery: EnergyDiscovery | null;
  proposals: EnergyDiscoveryV2 | null;
  discoveryError: string;
  meters: Record<string, EnergyMeterInfo>;
};

const LEGACY_LIMIT = 'L’integrazione Domus UI installata salva un solo dispositivo per modulo, senza nomi, contatori né sensori totali: aggiornala per configurare questo impianto.';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{title}</h4>
      {children}
    </section>
  );
}

const Note = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }) => (
  <p role="note" className={`${UI.card} text-sm ${tone === 'warning' ? 'text-[color:var(--ui-warning)]' : 'text-[color:var(--ui-text-secondary)]'}`}>{children}</p>
);

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
  const [chosen, setChosen] = React.useState<EnergyModuleId[]>([]);
  const [applied, setApplied] = React.useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string | null>(null);
  const [stepId, setStepId] = React.useState<StepId>('plant');
  const [advanced, setAdvanced] = React.useState(false);
  const [save, setSave] = React.useState<SaveState>({ status: 'idle' });
  const [done, setDone] = React.useState<{ lines: string[]; realtimeOnly: boolean } | null>(null);
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
    const configured = ORDER.filter((id) => stored[id]?.devices.length);
    const detected = ORDER.filter((id) => proposals?.devices.some((device) => device.module === id && device.status === 'new' && device.confidence !== 'low'));
    const first = configured.length === 0;
    // Discovery preselects what it found; the user can still change it on the plant step.
    const initial = mode === 'edit' ? configured : ORDER.filter((id) => configured.includes(id) || detected.includes(id) || (first && id === 'grid'));
    setDraft(plantDraftFromProfile(stored));
    setChosen(initial);
    setApplied({});
    setConfirmed(new Set());
    setOpen(null);
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
    setStepId(mode === 'edit' && initial.length ? `module:${initial[0]}` : first && mode === 'setup' ? 'welcome' : 'plant');
  }, [callApi, mode]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (focusOnStep.current) headingRef.current?.focus();
    focusOnStep.current = true;
  }, [stepId, done]);

  const known = React.useMemo(() => (loaded ? plantReferences(loaded.stored) : new Set<string>()), [loaded]);
  const check = React.useMemo(() => referenceCheck(haStates, loaded?.meters ?? {}, known), [haStates, loaded, known]);
  const issues = React.useMemo(() => validatePlantDraft(draft, check), [draft, check]);
  const saving = save.status === 'saving';

  const firstSetup = Boolean(loaded) && Object.keys(loaded!.stored).length === 0;
  const tariffSupported = loaded ? loaded.v2 || Boolean(loaded.result.profile && supportsTariff(loaded.result.profile)) : false;
  const flowModules = ORDER.filter((id) => chosen.includes(id) || draft[id]?.devices.some((device) => !device.removed && device.isNew));
  const steps: StepId[] = [
    ...(firstSetup && mode === 'setup' ? (['welcome'] as StepId[]) : []),
    'plant',
    'detect',
    ...flowModules.map((id): StepId => `module:${id}`),
    ...(loaded?.v2 ? (['history'] as StepId[]) : []),
    ...(firstSetup && tariffSupported ? (['tariff'] as StepId[]) : []),
    'summary',
  ];
  const current: StepId = steps.includes(stepId) ? stepId : 'summary';
  const stepIndex = steps.indexOf(current);
  const finish = () => onSaved();

  // Full-height layout: own header, scrolling content, actions pinned to the bottom.
  const shell = (body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="flex h-full flex-col" onKeyDown={(event) => { if (event.key === 'Escape' && !saving) (done ? finish : onClose)(); }}>
      <header className="flex items-center gap-2 border-b border-[color:var(--ui-separator)] px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className={UI.muted}>
            Configura Domus Energy{loaded && !done ? ` · Passaggio ${stepIndex + 1} di ${steps.length}` : ''}
            {loaded && !done && steps[stepIndex + 1] ? <span className="hidden sm:inline"> · Poi: {STEP_LABEL[steps[stepIndex + 1]]}</span> : null}
          </p>
          <h2 id="energy-step-title" ref={headingRef} tabIndex={-1} className={`truncate text-lg outline-none ${UI.title}`}>
            {done ? 'Fatto' : STEP_LABEL[loaded ? current : 'detect']}
          </h2>
        </div>
        {loaded && !done && (moduleOf(current) || current === 'history' || current === 'detect') ? (
          <button
            type="button"
            aria-pressed={advanced}
            aria-label="Configurazione avanzata per tutti i dispositivi"
            onClick={() => setAdvanced(!advanced)}
            className={`${UI.chip} ${advanced ? 'font-semibold text-[color:var(--ui-accent)]' : ''}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden min-[420px]:inline">Avanzata</span>
          </button>
        ) : null}
        <button type="button" onClick={done ? finish : onClose} disabled={saving} aria-label="Chiudi configurazione" className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      {loaded && !done ? (
        <ol className="flex gap-1 px-4 pt-3 sm:px-6" aria-label="Passaggi della configurazione">
          {steps.map((id, index) => (
            <li key={id} aria-current={index === stepIndex ? 'step' : undefined} className={`h-1 flex-1 rounded-full ${index <= stepIndex ? 'bg-[color:var(--ui-accent)]' : 'bg-[color:var(--ui-fill-secondary)]'}`}>
              <span className="sr-only">{index + 1}. {STEP_LABEL[id]}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">{body}</div>
      </div>
      {footer ? (
        <footer className="border-t border-[color:var(--ui-separator)] px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6">
          <div className="mx-auto max-w-3xl">{footer}</div>
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
  if (done) {
    return shell(
      <SuccessView lines={done.lines} realtimeOnly={done.realtimeOnly} />,
      <div className="flex sm:justify-end">
        <button type="button" onClick={finish} className={`${UI.primary} flex-1 justify-center sm:flex-none`}>Vai a Domus Energy</button>
      </div>,
    );
  }

  const { result, v2, stored, reserved, proposals, meters, discovery } = loaded;
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
  const counts = plantCounts(draft);
  const lockedModules = ORDER.filter((id) => stored[id]?.devices.length);
  const detectedModules = ORDER.filter((id) => review?.newDevices.some((device) => device.module === id && device.confidence !== 'low'));
  const recommend = (module: EnergyModuleId, role: string) => recommendedSensor(module, role, discovery, proposals, haStates, taken);
  const confirm = (key: string, value: boolean) => setConfirmed((currentSet) => {
    const next = new Set(currentSet);
    if (value) next.add(key);
    else next.delete(key);
    return next;
  });

  const stepModule = moduleOf(current);
  const stepIssues = stepModule
    ? issues.filter((issue) => issue.module === stepModule && !isMeterField(issue))
    : current === 'history' ? issues.filter(isMeterField) : [];
  const blocked = stepIssues.length > 0 || (current === 'tariff' && !tariffBlank && !tariff);
  const pendingNew = (module: EnergyModuleId) => review?.newDevices.filter((proposal) => proposal.module === module && !applied[proposal.key]) ?? [];

  /** Moving forward into a component with nothing yet opens a first device to fill in. */
  const enter = (target: StepId, base: PlantDraft = draft) => {
    const module = moduleOf(target);
    let next = base;
    if (module && !next[module]?.devices.some((device) => !device.removed) && !pendingNew(module).length) {
      const added = addDevice(next, module, reserved);
      next = added.draft;
      setOpen(added.id);
    }
    if (next !== draft) setDraft(next);
    setStepId(target);
  };
  const goNext = () => enter(steps[stepIndex + 1]);
  const goBack = () => setStepId(steps[stepIndex - 1]);

  const applyDevice = (proposal: EnergyDiscoveryV2Device) => {
    const { draft: next, id } = applyNewDevice(draft, proposal, reserved, meters);
    setDraft(next);
    setApplied((currentApplied) => ({ ...currentApplied, [proposal.key]: id }));
  };
  const eligible = review?.newDevices.filter((proposal) => proposal.eligible && !applied[proposal.key] && chosen.includes(proposal.module)) ?? [];
  // Still one explicit choice: only devices the discovery could match without doubt.
  const useFound = () => {
    let next = draft;
    const ids: Record<string, string> = {};
    for (const proposal of eligible) {
      const added = applyNewDevice(next, proposal, reserved, meters);
      next = added.draft;
      ids[proposal.key] = added.id;
    }
    setApplied((currentApplied) => ({ ...currentApplied, ...ids }));
    enter(steps[stepIndex + 1], next);
  };

  // Leaving components drops only what this setup added to them; saved devices stay.
  const leave = (modules: EnergyModuleId[], keep: EnergyModuleId[]) => {
    const gone = modules.filter((id) => !lockedModules.includes(id));
    setChosen(ORDER.filter((id) => keep.includes(id) || (chosen.includes(id) && !gone.includes(id))));
    setDraft((currentDraft) => gone.reduce((next, module) => (next[module]?.devices ?? [])
      .filter((device) => device.isNew)
      .reduce((after, device) => removeDevice(after, module, device.id), next), currentDraft));
    setApplied((currentApplied) => Object.fromEntries(Object.entries(currentApplied)
      .filter(([key]) => !gone.some((module) => key.startsWith(`${module}:`) || key.startsWith(`total:${module}:`)))));
  };
  const toggleModule = (module: EnergyModuleId) => {
    if (lockedModules.includes(module)) return;
    if (chosen.includes(module)) leave([module], []);
    else setChosen(ORDER.filter((id) => id === module || chosen.includes(id)));
  };
  const onlyGrid = () => leave(['solar', 'battery', 'wallbox'], ['grid']);

  const handleSave = async () => {
    setSave({ status: 'saving' });
    try {
      if (v2) await saveEnergyPlant(callApi, plant, profileRevision(result), tariffToSave);
      else await saveEnergyProfile(callApi, modulesFromPlant(plant) ?? {}, profileRevision(result), tariffToSave);
      setSave({ status: 'idle' });
      setDone({
        lines: present.filter((id) => id !== 'home').map((id) => `${MODULE_META[id].label} · ${count(id, plant[id]?.devices.length ?? 0)}`)
          .concat(present.includes('home') ? ['Consumi della casa misurati'] : [])
          .concat(counts.meters ? [`${plural(counts.meters, 'contatore', 'contatori')} per lo storico`] : []),
        realtimeOnly: counts.meters === 0,
      });
    } catch (failure) {
      // The draft stays untouched so the user can retry or adjust it; nothing is merged.
      const error = toEnergyCoreError(failure);
      setSave({ status: 'error', message: error.message, conflict: error.code === 'revision_conflict' });
    }
  };

  const recorderNote = review?.verificationIncomplete ? (
    <Note>Alcuni contatori sono in attesa di Home Assistant, che si sta ancora avviando: potrai usarli comunque e Domus li verificherà più tardi.</Note>
  ) : null;

  /* ---- Steps ----------------------------------------------------------------------------- */

  let body: React.ReactNode = null;
  if (current === 'welcome') body = <WelcomeView />;

  if (current === 'plant') {
    body = <PlantChoice chosen={chosen} locked={lockedModules} detected={detectedModules} onToggle={toggleModule} onOnlyGrid={onlyGrid} />;
  }

  if (current === 'detect') {
    const anything = Boolean(review && (review.newDevices.length || review.changes.length || review.verifiedTotals.length || review.presumedTotals.length));
    // Found, doubtful or conflicting outside the chosen components: offered, never added on its own.
    const elsewhere = ORDER.filter((id) => !chosen.includes(id) && (detectedModules.includes(id)
      || review?.ambiguous.some((item) => item.module === id) || review?.conflicts.some((item) => item.module === id)));
    const globalDoubts = review?.ambiguous.filter((item) => !item.module) ?? [];
    body = (
      <>
        <div className="space-y-1">
          <h3 className={TITLE}>{anything ? (firstSetup ? 'Abbiamo trovato il tuo impianto' : 'Ecco cosa abbiamo trovato') : !proposals ? 'Rilevamento automatico non riuscito' : 'Nessun dispositivo riconosciuto automaticamente'}</h3>
          <p className={UI.body}>
            {!proposals
              ? `${loaded.discoveryError} Nei prossimi passaggi puoi comunque scegliere tu i dispositivi.`
              : anything
                ? 'Sono solo proposte: nei prossimi passaggi controlli ogni dispositivo, e nulla viene salvato prima del controllo finale.'
                : 'Non è un errore: nei prossimi passaggi scegli tu i dispositivi che hai in casa, con i sensori che Domus ti consiglia.'}
          </p>
          {proposals && !anything && discovery?.energy_dashboard !== 'used' ? (
            <p className={UI.muted}>Suggerimento: se imposti i contatori nella Dashboard Energia di Home Assistant, Domus potrà proporli in automatico.</p>
          ) : null}
        </div>
        {result.legacy_v1?.diverged ? <Note tone="warning">Una versione precedente di Domus UI ha modificato l’impianto dopo l’aggiornamento: quelle modifiche non sono state applicate. Qui parti dalla configurazione attuale.</Note> : null}
        {result.profile_v2?.load_error || result.profile?.load_error ? <Note tone="warning">Il profilo salvato non era leggibile ed è stato ignorato: salvando ne crei uno nuovo.</Note> : null}
        {!v2 ? <Note>{LEGACY_LIMIT}</Note> : null}
        {chosen.length ? <Findings findings={moduleFindings(review, Object.fromEntries(ORDER.map((id) => [id, stored[id]?.devices.length ?? 0])), chosen)} advanced={advanced} /> : null}
        {elsewhere.map((id) => (
          <div key={id} className={`${UI.card} flex flex-wrap items-center gap-2`}>
            <p className={`flex-1 ${UI.body}`}>Domus ha trovato anche: {MODULE_META[id].label.toLowerCase()}.</p>
            <button type="button" onClick={() => toggleModule(id)} className={UI.chip}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Aggiungilo all’impianto</button>
          </div>
        ))}
        {globalDoubts.length ? (
          <Note tone="warning">Alcuni contatori non hanno un componente chiaro: Domus non sceglie al posto tuo, potrai indicarli nel passaggio Storico dei consumi.</Note>
        ) : null}
        {recorderNote}
        {proposals?.low_confidence.length ? <p className={UI.muted}>Altri {proposals.low_confidence.length} sensori sono stati trovati solo per nome: potrai sceglierli tu.</p> : null}
        {eligible.length ? (
          <p className={UI.muted}>
            Con «Usa i dispositivi trovati» Domus aggiunge {plural(eligible.length, 'dispositivo riconosciuto', 'dispositivi riconosciuti')} con certezza; quelli da verificare li trovi nei passaggi successivi.
          </p>
        ) : null}
      </>
    );
  }

  if (stepModule) {
    const module = stepModule;
    const plan = draft[module];
    const devices = plan?.devices ?? [];
    const kept = devices.filter((device) => !device.removed).length;
    const fromDiscovery = devices.filter((device) => Object.values(applied).includes(device.id)).length;
    const suggestions = pendingNew(module);
    const totals = review ? [...review.verifiedTotals, ...review.presumedTotals].filter((total) => total.module === module) : [];
    const doubts = [
      ...(review?.ambiguous.filter((item) => item.module === module).map((item) => `${AMBIGUITY_LABEL[item.reason] ?? item.reason}: ${item.entity_ids.map((id) => sensorName(haStates, discovery, id)).join(', ')}`) ?? []),
      ...(review?.conflicts.filter((item) => item.module === module).map((item) => `${item.name ?? 'Un dispositivo'} corrisponde a più dispositivi configurati.`) ?? []),
    ];
    const canAdd = (v2 || kept === 0) && devices.length < MAX_DEVICES_PER_MODULE;
    const addNew = () => {
      const { draft: next, id } = addDevice(draft, module, reserved);
      setDraft(next);
      setOpen(id);
    };
    body = (
      <>
        <div className="space-y-1">
          <h3 className={TITLE}>{MODULE_WORDS[module].title}</h3>
          <p className={UI.body}>
            {fromDiscovery
              ? `Abbiamo trovato ${count(module, fromDiscovery)}. Apri una scheda per controllarla.`
              : kept
                ? `${count(module, kept)} nel tuo impianto. Apri una scheda per controllarla o modificarla.`
                : 'Aggiungi il dispositivo e scegli il sensore: Domus ti suggerisce quello giusto quando lo trova.'}
          </p>
        </div>
        {doubts.length ? (
          <section aria-label="Da decidere" className={`${UI.card} space-y-1`}>
            <p className={`text-sm ${UI.title}`}>Da decidere</p>
            <ul className={`list-disc space-y-1 pl-5 ${UI.body}`}>{doubts.map((line) => <li key={line}>{line}</li>)}</ul>
            <p className={UI.muted}>Domus non sceglie al posto tuo: apri il dispositivo e indica il sensore giusto.</p>
          </section>
        ) : null}
        {plan?.total ? (
          <TotalCard
            module={module}
            total={plan.total}
            open={open === `${module}:total`}
            onToggle={() => setOpen(open === `${module}:total` ? null : `${module}:total`)}
            issues={issues.filter((issue) => issue.module === module)}
            states={haStates}
            discovery={discovery}
            meters={meters}
            taken={takenFor(`${MODULE_META[module].label} · totale`)}
            advanced={advanced}
            onChange={(total) => setDraft((currentDraft) => setTotal(currentDraft, module, total))}
          />
        ) : null}
        {devices.length ? (
          <ul aria-label={`Dispositivi: ${MODULE_META[module].label}`} className="space-y-2">
            {devices.map((device, index) => {
              const label = deviceLabel(module, device, index);
              const deviceIssues = issues.filter((issue) => issue.deviceId === device.id && !isMeterField(issue));
              const proposal = review?.changes.find((item) => item.module === module && item.device_id === device.id);
              const changes = [
                ...(proposal?.additions ?? []).filter((change) => change.kind !== 'energy').map((change) => ({ change, kind: 'Nuova sorgente' })),
                ...(proposal?.corrections ?? []).filter((change) => change.kind !== 'energy').map((change) => ({ change, kind: 'Possibile correzione' })),
              ];
              const unconfirmedHere = unconfirmed.some((item) => item.holder === device.id);
              return (
                <DeviceCard
                  key={device.id}
                  module={module}
                  device={device}
                  index={index}
                  states={haStates}
                  status={deviceStatus(deviceIssues, unconfirmedHere)}
                  open={open === device.id}
                  onToggle={() => setOpen(open === device.id ? null : device.id)}
                  onRemove={() => { setDraft((currentDraft) => removeDevice(currentDraft, module, device.id)); setOpen(null); }}
                  onRestore={() => setDraft((currentDraft) => updateDevice(currentDraft, module, { ...device, removed: false }))}
                  hint={deviceIssues.length && open !== device.id ? deviceIssues[0].message : null}
                  hintTone="danger"
                  advanced={advanced}
                  extra={changes.length ? (
                    <ul aria-label={`Suggerimenti per ${label}`} className="mt-2 space-y-1.5">
                      {changes.map(({ change, kind }) => {
                        const key = `${proposal!.key}:${change.kind}:${change.role}`;
                        const ids = 'ids' in change ? change.ids : change.proposed;
                        return (
                          <li key={key} className="flex flex-wrap items-center gap-2 rounded-xl bg-[color:var(--ui-fill-tertiary)] p-2 text-sm">
                            <span className="min-w-0 flex-1">
                              <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[color:var(--ui-accent)]" aria-hidden="true" />
                              <span className={UI.title}>{kind}</span> · {change.kind === 'sign_convention' ? 'convenzione del segno' : ids.map((id) => sensorName(haStates, discovery, id)).join(' + ')}
                              <TechDetails open={advanced}>{'configured' in change ? `${change.configured.join(' + ')} → ` : ''}{ids.join(' + ')}</TechDetails>
                            </span>
                            {applied[key] ? (
                              <span className={UI.muted}><Check className="inline h-3.5 w-3.5" aria-hidden="true" /> Applicata</span>
                            ) : (
                              <button type="button" onClick={() => { setDraft((currentDraft) => applyChange(currentDraft, module, device.id, change)); setApplied((currentApplied) => ({ ...currentApplied, [key]: 'applied' })); }} className={UI.chip}>Applica</button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                >
                  <DeviceDetail
                    module={module}
                    device={device}
                    index={index}
                    states={haStates}
                    discovery={discovery}
                    meters={meters}
                    taken={takenFor(label)}
                    issues={issues.filter((issue) => issue.deviceId === device.id)}
                    recommend={(role) => recommend(module, role)}
                    advanced={advanced}
                    legacy={!v2}
                    onChange={(next) => setDraft((currentDraft) => updateDevice(currentDraft, module, next))}
                  />
                </DeviceCard>
              );
            })}
          </ul>
        ) : null}
        {suggestions.length ? (
          <Section title={devices.length ? 'Domus ha trovato anche' : 'Trovati da Domus'}>
            <ul className="space-y-2">
              {suggestions.map((proposal) => (
                <li key={proposal.key} className="flex flex-wrap items-center gap-3 rounded-[1.35rem] border border-dashed border-[color:var(--ui-border)] p-3">
                  <ModuleIcon module={module} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${UI.title}`}>{proposal.name ?? MODULE_META[module].label}</span>
                    <span className="mt-1 block"><StatusBadge status={proposal.eligible ? 'ready' : 'check'} label={proposal.confidence ? CONFIDENCE_TEXT[proposal.confidence] : undefined} /></span>
                    <TechDetails open={advanced}>
                      {[proposal.integration, ...(proposal.power ?? []).map((item) => item.entity_id), ...(proposal.energy ?? []).flatMap((item) => item.statistic_ids)].filter(Boolean).map((line) => <p key={line}>{line}</p>)}
                    </TechDetails>
                  </span>
                  <button type="button" disabled={!canAdd} onClick={() => applyDevice(proposal)} className={UI.button} aria-label={`Aggiungi ${proposal.name ?? MODULE_WORDS[module].noun[0]}`}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {totals.filter((total) => !applied[`total:${total.module}:${total.kind}:${total.role}`] && !plan?.total).map((total) => {
          const key = `total:${total.module}:${total.kind}:${total.role}`;
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 rounded-[1.35rem] border border-dashed border-[color:var(--ui-border)] p-3">
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${UI.title}`}>Domus ha trovato un sensore che misura tutto il {MODULE_META[module].label.toLowerCase()}</span>
                <span className={`block ${total.status === 'verified' ? UI.muted : 'text-xs text-[color:var(--ui-warning)]'}`}>
                  {total.status === 'verified'
                    ? 'Home Assistant lo calcola sommando i dispositivi: Domus lo userà come totale, senza sommarlo di nuovo.'
                    : 'Sembra un totale, ma non è verificato: usalo solo se misura davvero tutti i dispositivi.'}
                </span>
                <TechDetails open={advanced}>{total.ids.join(', ')}</TechDetails>
              </span>
              <button type="button" onClick={() => { setDraft((currentDraft) => applyTotal(currentDraft, total)); setApplied((currentApplied) => ({ ...currentApplied, [key]: 'applied' })); }} className={`${UI.button} w-full justify-center sm:w-auto`}>
                {total.status === 'verified' ? 'Usa come totale' : 'Usa comunque come totale'}
              </button>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addNew} disabled={!canAdd} className={kept ? UI.button : UI.primary}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {MODULE_WORDS[module].add[kept ? 1 : 0]}
          </button>
          {advanced && !plan?.total && kept >= 2 ? (
            <button
              type="button"
              onClick={() => { setDraft((currentDraft) => setTotal(currentDraft, module, { power: { ...emptyPower(), present: true }, meters: {} })); setOpen(`${module}:total`); }}
              className={UI.button}
            >
              Aggiungi un sensore totale
            </button>
          ) : null}
        </div>
        {!v2 && kept >= 1 ? <p className={UI.muted}>Più dispositivi richiedono l’aggiornamento dell’integrazione Domus UI.</p> : null}
        {!kept ? <p className={UI.muted}>Senza dispositivi, questo componente non verrà configurato.</p> : null}
        {issues.filter((issue) => issue.module === module && !issue.deviceId && issue.field !== 'total').map((issue) => <p key={issue.message} className={ERROR_TEXT}>{issue.message}</p>)}
      </>
    );
  }

  if (current === 'history') {
    const energyChange = (module: EnergyModuleId, deviceId: string, role: EnergyMeterRole) => {
      const proposal = review?.changes.find((item) => item.module === module && item.device_id === deviceId);
      const change = [...(proposal?.additions ?? []), ...(proposal?.corrections ?? [])].find((item) => item.kind === 'energy' && item.role === role);
      if (!proposal || !change) return null;
      const key = `${proposal.key}:${change.kind}:${change.role}`;
      if (applied[key]) return null;
      const ids = 'ids' in change ? change.ids : change.proposed;
      return {
        name: ids.map((id) => sensorName(haStates, discovery, id)).join(' + '),
        apply: () => { setDraft((currentDraft) => applyChange(currentDraft, module, deviceId, change)); setApplied((currentApplied) => ({ ...currentApplied, [key]: 'applied' })); },
      };
    };
    const offered = present.some((module) => draft[module]!.devices.some((device) => !device.removed && METER_ROLES[module].some(({ role }) => energyChange(module, device.id, role))));
    body = (
      <>
        <div className="space-y-1">
          <h3 className={TITLE}>Storico dei consumi</h3>
          <p className={UI.body}>Questi contatori permettono a Domus di mostrarti produzione, consumi e costi nel tempo.</p>
        </div>
        {counts.meters === 0 && !offered ? (
          <div className={`${UI.card} space-y-1`}>
            <p className={`text-sm ${UI.title}`}>Non abbiamo trovato un contatore energetico.</p>
            <p className={UI.body}>Puoi comunque utilizzare Domus Energy in tempo reale. Lo storico non sarà disponibile finché non ne configurerai uno.</p>
          </div>
        ) : null}
        {recorderNote}
        {present.map((module) => (
          <section key={module} aria-label={`Storico: ${MODULE_META[module].label}`} className="space-y-2">
            {draft[module]!.devices.map((device, index) => (device.removed ? null : (
              <div key={device.id} className="space-y-2 rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3">
                <div className="flex items-center gap-3">
                  <ModuleIcon module={module} />
                  <p className={`text-sm ${UI.title}`}>{deviceLabel(module, device, index)}</p>
                </div>
                <SourcesHistory
                  module={module}
                  holder={device.id}
                  sources={device}
                  issues={issues.filter((issue) => issue.deviceId === device.id)}
                  states={haStates}
                  discovery={discovery}
                  meters={meters}
                  taken={takenFor(deviceLabel(module, device, index))}
                  advanced={advanced}
                  confirmations={confirmations}
                  confirmed={confirmed}
                  onConfirm={confirm}
                  suggestionFor={(role) => energyChange(module, device.id, role)}
                  onChange={(sources) => setDraft((currentDraft) => updateDevice(currentDraft, module, { ...device, ...sources }))}
                />
              </div>
            )))}
          </section>
        ))}
      </>
    );
  }

  if (current === 'tariff') {
    body = (
      <>
        <div className="space-y-1">
          <h3 className={TITLE}>Vuoi aggiungere la tariffa?</h3>
          <p className={UI.body}>Facoltativo: con i prezzi del contratto Domus mostra la fascia attuale e il suo costo. Puoi farlo anche più tardi dalle Impostazioni.</p>
          <p className={UI.muted}>{TARIFF_HINT}</p>
        </div>
        <div className={GROUP} role="group" aria-label="Tariffa">
          <TariffFields form={tariffDraft} onChange={setTariffDraft} withExport={present.includes('grid')} />
        </div>
      </>
    );
  }

  if (current === 'summary') {
    const changes = plantChanges(stored, draft);
    const moduleState = (module: EnergyModuleId): GuideStatus =>
      issues.some((issue) => issue.module === module) ? 'problem' : unconfirmed.some((item) => item.module === module) ? 'check' : 'ready';
    const nodes: MapNode[] = present.map((module) => ({
      module,
      caption: module === 'home' ? 'misurata' : count(module, plant[module]?.devices.length ?? 0) + (plant[module]?.total ? ' e un totale' : ''),
      status: moduleState(module),
    }));
    const fixStep = issues.length ? (`module:${issues[0].module}` as StepId) : null;
    const holderLabel = (module: EnergyModuleId, holder: string | undefined) => {
      if (holder === `${module}:total`) return `${MODULE_META[module].label} · totale`;
      const index = draft[module]?.devices.findIndex((device) => device.id === holder) ?? -1;
      return index >= 0 ? deviceLabel(module, draft[module]!.devices[index], index) : MODULE_META[module].label;
    };
    // The same confirmations as the history step, with names instead of ids.
    const confirmationText = (item: Confirmation) => {
      if (!item.role) return item.message;
      const where = `${holderLabel(item.module, item.holder)} · ${HISTORY_TEXT[item.role]}`;
      if (item.part) return `${where}: ${sensorName(haStates, discovery, item.part)} non è stato verificato da Home Assistant. I suoi dati potrebbero non essere disponibili.`;
      const parts = (plant[item.module]?.devices.find((device) => device.id === item.holder) ?? plant[item.module]?.total)?.energy?.[item.role] ?? [];
      return `${where}: questi ${parts.length} contatori verranno sommati (${parts.map((part) => sensorName(haStates, discovery, part)).join(', ')}). Verifica che rappresentino fasce differenti e non includano già un totale.`;
    };
    body = (
      <>
        <div className="space-y-1">
          <h3 className={TITLE}>{issues.length || legacyBlocked ? 'Manca ancora qualcosa' : unconfirmed.length ? 'Quasi fatto: conferma qualche dettaglio' : 'Tutto pronto'}</h3>
          <p className={UI.body}>{present.length ? 'Ecco il tuo impianto come lo vedrà Domus.' : 'Nessun dispositivo: Domus Energy risulterà non configurato.'}</p>
        </div>
        {present.length ? <PlantMap nodes={nodes} /> : null}
        <ul aria-label="In breve" className="grid grid-cols-3 gap-2 text-center">
          {[
            [counts.devices, counts.devices === 1 ? 'dispositivo configurato' : 'dispositivi configurati'],
            [counts.sensors, counts.sensors === 1 ? 'sensore collegato' : 'sensori collegati'],
            [counts.meters, counts.meters === 1 ? 'contatore energetico disponibile' : 'contatori energetici disponibili'],
          ].map(([value, label]) => (
            <li key={label} className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] px-2 py-3">
              <span className="block text-2xl font-semibold text-[color:var(--ui-text-primary)]">{value}</span>
              <span className={`block ${UI.muted}`}>{label}</span>
            </li>
          ))}
        </ul>
        {counts.meters === 0 && present.length ? <p className={UI.muted}>Senza contatori Domus funziona in tempo reale; lo storico potrà essere configurato in seguito.</p> : null}
        {issues.length || legacyBlocked ? (
          <Section title="Da correggere">
            <ul className={`list-disc space-y-1 pl-5 ${ERROR_TEXT}`}>
              {legacyBlocked ? <li>{LEGACY_LIMIT}</li> : null}
              {issues.map((issue, index) => <li key={index}>{MODULE_META[issue.module].label}: {issue.message}</li>)}
            </ul>
            {fixStep && steps.includes(fixStep) ? <button type="button" onClick={() => setStepId(fixStep)} className={UI.chip}>Vai a {STEP_LABEL[fixStep]}</button> : null}
          </Section>
        ) : null}
        {confirmations.length ? (
          <Section title="Da confermare">
            <ul className="space-y-2">
              {confirmations.map((item) => (
                <li key={item.key}>
                  <label className={`${UI.card} flex cursor-pointer items-start gap-2 text-sm`}>
                    <input type="checkbox" className="mt-1" checked={confirmed.has(item.key)} onChange={(event) => confirm(item.key, event.target.checked)} />
                    <span>{confirmationText(item)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {tariffToSave ? <p className={UI.body}><span className={UI.title}>Tariffa:</span> {tariffSummary(tariffToSave)}</p> : null}
        {steps.includes('tariff') && !tariffToSave ? <p className={UI.muted}>Tariffa non configurata: potrai aggiungerla dalle Impostazioni.</p> : null}
        {review?.verificationIncomplete ? <p className={UI.muted}>Alcuni contatori non sono ancora verificabili: Home Assistant li verificherà quando sarà pronto.</p> : null}
        <details className="group" open={advanced || undefined}>
          <summary className={`${UI.chip} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Mostra riepilogo tecnico</summary>
          <div className="mt-3">
            <Section title="Modifiche">
              {changes.length ? (
                <ul className="space-y-2">
                  {changes.map((change, index) => (
                    <li key={index} className={UI.card}>
                      <p className={`text-sm ${UI.title}`}>{change.title}</p>
                      {change.details.length ? <ul className={`mt-1 space-y-0.5 ${UI.muted}`}>{change.details.map((detail) => <li key={detail} className="break-all">{detail}</li>)}</ul> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className={UI.muted}>Nessuna modifica all’impianto salvato.</p>}
            </Section>
          </div>
        </details>
        <div aria-live="polite">
          {saving ? <p className={`flex items-center gap-2 ${UI.body}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Salvataggio in corso…</p> : null}
          {save.status === 'error' ? (
            <div role="alert" className="space-y-2 text-sm text-[color:var(--ui-danger)]">
              <p>{save.message} Le modifiche non salvate restano qui.</p>
              {save.conflict ? <button type="button" onClick={() => void load()} className={UI.chip}>Carica la versione salvata (scarta la bozza)</button> : null}
            </div>
          ) : null}
        </div>
      </>
    );
  }

  /* ---- Footer ---------------------------------------------------------------------------- */

  const wide = 'flex-1 justify-center sm:flex-none';
  let primary: React.ReactNode;
  if (current === 'summary') {
    primary = (
      <button type="button" onClick={() => void handleSave()} disabled={saving || issues.length > 0 || legacyBlocked || unconfirmed.length > 0 || !dirty} className={`${UI.primary} ${wide}`}>
        {saving ? <LoaderCircle className={UI.spin} aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        Salva impianto
      </button>
    );
  } else if (current === 'detect' && eligible.length) {
    primary = <button type="button" onClick={useFound} className={`${UI.primary} ${wide}`}>Usa i dispositivi trovati</button>;
  } else {
    const label = current === 'welcome'
      ? 'Iniziamo'
      : current === 'tariff' && tariffBlank
        ? 'Salta per ora'
        : current === 'history' && counts.meters === 0
          ? 'Continua senza storico'
          : 'Avanti';
    primary = (
      <button
        type="button"
        onClick={() => { if (current === 'tariff') setSkipTariff(false); goNext(); }}
        disabled={blocked}
        aria-describedby={blocked ? 'energy-step-blocked' : undefined}
        className={`${UI.primary} ${wide}`}
      >
        {label}
      </button>
    );
  }

  const secondary = [
    stepIndex > 0 ? <button key="back" type="button" onClick={goBack} disabled={saving} className={`${UI.button} ${wide}`}>Indietro</button> : null,
    current === 'detect' && eligible.length ? <button key="own" type="button" onClick={goNext} className={`${UI.button} ${wide}`}>Scelgo io</button> : null,
    current === 'tariff' && !tariffBlank ? (
      <button key="skip" type="button" onClick={() => { setSkipTariff(true); goNext(); }} className={`${UI.button} ${wide}`}>Salta</button>
    ) : null,
  ].filter(Boolean);

  return shell(
    body,
    <>
      {blocked ? (
        <p id="energy-step-blocked" className={`mb-2 ${ERROR_TEXT}`}>
          {current === 'tariff' ? 'Correggi i prezzi evidenziati oppure salta questo passaggio.' : 'Completa o correggi i dispositivi evidenziati per continuare.'}
        </p>
      ) : null}
      {/* Phones: with two secondary actions the main one takes its own row on top. */}
      <div className={`gap-2 sm:flex sm:justify-end ${secondary.length > 1 ? 'grid grid-cols-2 [&>*:last-child]:order-first [&>*:last-child]:col-span-2 sm:[&>*:last-child]:order-none' : 'flex'}`}>
        {secondary}
        {primary}
      </div>
    </>,
  );
}
