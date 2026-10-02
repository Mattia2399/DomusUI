import React from 'react';
import { LoaderCircle, Save, X } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  ENERGY_MODULES,
  discoverEnergy,
  getEnergyProfile,
  saveEnergyProfile,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyDiscovery,
  type EnergyModuleId,
  type EnergyProfileResult,
  type EnergyState,
} from '../../../services/energyCoreClient';
import {
  applySuggestion,
  draftFromDiscovery,
  draftFromProfile,
  draftToModules,
  emptyDraft,
  pendingSuggestions,
  sameModules,
  validateDraft,
  type EnergyDraft,
} from './energyDraft';
import { EnergyHomeVisual } from './EnergyHomeVisual';
import { Confidence, ERROR_TEXT, ModuleEditor, roleLabel } from './EnergyModuleEditor';
import { MODULE_META, UI } from './energyModel';
import { buildFlowFromDraft } from './energyPreview';

export type WizardMode = 'setup' | 'edit' | 'rediscover';

const STEPS = ['Rilevamento', 'Associazioni', 'Anteprima', 'Salvataggio'];

type SaveState = { status: 'idle' | 'saving' | 'error'; message?: string; conflict?: boolean };

/** What discovery found for a module, or null when it found nothing. */
function detectionSummary(id: EnergyModuleId, discovery: EnergyDiscovery) {
  if (discovery.suggested_profile.modules[id]) return 'Sensori riconosciuti e già proposti';
  if (discovery.requires_input.some((item) => item.module === id)) return 'Sensore trovato: conferma il significato del segno';
  if (discovery.ambiguous.some((item) => item.module === id)) return 'Più sensori possibili: scegli tu quale usare';
  return Object.keys(discovery.proposals[id] ?? {}).length ? 'Possibili sensori, da verificare' : null;
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
  const [step, setStep] = React.useState(mode === 'edit' ? 1 : 0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = React.useState('');
  const [profile, setProfile] = React.useState<EnergyProfileResult | null>(null);
  const [discovery, setDiscovery] = React.useState<EnergyDiscovery | null>(null);
  const [draft, setDraft] = React.useState<EnergyDraft>(emptyDraft);
  const [save, setSave] = React.useState<SaveState>({ status: 'idle' });
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const focusOnStep = React.useRef(false);

  const load = React.useCallback(async () => {
    setProfile(null);
    setLoadError(null);
    setSave({ status: 'idle' });
    const [profileResult, discoveryResult] = await Promise.allSettled([getEnergyProfile(callApi), discoverEnergy(callApi)]);
    if (profileResult.status === 'rejected') {
      setLoadError(toEnergyCoreError(profileResult.reason).message);
      return;
    }
    const found = discoveryResult.status === 'fulfilled' ? discoveryResult.value : null;
    setDiscoveryError(discoveryResult.status === 'rejected' ? toEnergyCoreError(discoveryResult.reason).message : '');
    const saved = profileResult.value.profile.modules;
    setDiscovery(found);
    // Confirmed bindings always win: discovery only fills a first-time draft.
    setDraft(Object.keys(saved).length || !found ? draftFromProfile(saved) : draftFromDiscovery(found));
    setProfile(profileResult.value);
  }, [callApi]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (focusOnStep.current) headingRef.current?.focus();
    focusOnStep.current = true;
  }, [step]);

  const issues = React.useMemo(() => validateDraft(draft), [draft]);
  const modules = React.useMemo(() => draftToModules(draft), [draft]);
  const sensorIds = React.useMemo(() => Object.keys(haStates).filter((id) => id.startsWith('sensor.')), [haStates]);
  const saving = save.status === 'saving';

  // Full-height layout: own header, scrolling content, actions pinned to the bottom.
  const shell = (body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="flex h-full flex-col" onKeyDown={(event) => { if (event.key === 'Escape' && !saving) onClose(); }}>
      <header className="flex items-center gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className={UI.muted}>Configura Domus Energy{profile ? ` · Passaggio ${step + 1} di ${STEPS.length}` : ''}</p>
          <h2 id="energy-step-title" ref={headingRef} tabIndex={-1} className={`truncate text-lg outline-none ${UI.title}`}>{STEPS[profile ? step : 0]}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Chiudi configurazione" className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      {profile ? (
        <ol className="flex gap-1 px-4 pt-3 sm:px-6" aria-label="Passaggi della configurazione">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? 'step' : undefined}
              className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-[color:var(--ui-accent)]' : 'bg-[color:var(--ui-fill-secondary)]'}`}
            >
              <span className="sr-only">{index + 1}. {label}</span>
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
  if (!profile) {
    return shell(<p role="status" className={`flex items-center gap-2 ${UI.body}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Ricerca dei sensori in Home Assistant…</p>);
  }

  const savedModules = profile.profile.modules;
  const hasSavedProfile = Object.keys(savedModules).length > 0;
  const dirty = !sameModules(modules, draftToModules(draftFromProfile(savedModules)));
  const suggestions = discovery && hasSavedProfile ? pendingSuggestions(draft, discovery) : [];
  const present = ENERGY_MODULES.filter((id) => draft[id].present);
  const absent = ENERGY_MODULES.filter((id) => !draft[id].present && id !== 'home').map((id) => MODULE_META[id].label);
  const blocked = step === 1 && issues.length > 0;
  const nothingFound = discovery !== null && ENERGY_MODULES.every((id) => detectionSummary(id, discovery) === null);

  const handleSave = async () => {
    setSave({ status: 'saving' });
    try {
      await saveEnergyProfile(callApi, modules, profile.profile.revision);
      onSaved();
    } catch (failure) {
      // The draft stays untouched so the user can retry or adjust it.
      const error = toEnergyCoreError(failure);
      setSave({ status: 'error', message: error.message, conflict: error.code === 'revision_conflict' });
    }
  };

  return shell(
      <>
        {step === 0 ? (
          <>
            {nothingFound || !discovery ? (
              <div className={UI.card}>
                <p className={UI.title}>{discovery ? 'Nessun sensore riconosciuto automaticamente' : 'Rilevamento automatico non riuscito'}</p>
                <p className={`mt-1 ${UI.body}`}>
                  {discovery
                    ? 'Domus non ha trovato sensori da attribuire con sicurezza a rete, fotovoltaico, batteria o wallbox. Non è un errore: nel passaggio successivo scegli tu i sensori per i moduli che hai in casa.'
                    : `${discoveryError} Nel passaggio successivo puoi comunque scegliere tu i sensori.`}
                </p>
                {discovery?.energy_dashboard !== 'used' ? (
                  <p className={`mt-2 ${UI.muted}`}>Suggerimento: se imposti i sensori di potenza nella Dashboard Energia di Home Assistant, Domus potrà proporli in automatico.</p>
                ) : null}
              </div>
            ) : (
              <>
                <p className={UI.body}>
                  Domus ha cercato i sensori di potenza e di stato di carica usando unità, tipo di misura e dispositivo{discovery.energy_dashboard === 'used' ? ', oltre alla tua Dashboard Energia' : ''}. Nulla viene salvato finché non confermi.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ENERGY_MODULES.map((id) => (
                    <li key={id} className={UI.card}>
                      <p className={UI.title}>{MODULE_META[id].label}</p>
                      <p className={UI.muted}>{detectionSummary(id, discovery) ?? 'Nessun sensore trovato: potrai sceglierlo tu'}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {hasSavedProfile ? (
              <>
                <p className={UI.body}>Le associazioni già confermate non vengono modificate automaticamente.</p>
                {suggestions.length ? (
                  <ul className="space-y-2">
                    {suggestions.map((suggestion) => (
                      <li key={`${suggestion.module}-${suggestion.role}-${suggestion.entityId}`} className={`${UI.card} flex flex-wrap items-center justify-between gap-2 text-sm`}>
                        <span>
                          {MODULE_META[suggestion.module].label} · {roleLabel(suggestion.module, suggestion.role)}: <span className="font-mono">{suggestion.entityId}</span>{' '}
                          <Confidence value={suggestion.confidence} />
                        </span>
                        <button type="button" onClick={() => setDraft((current) => applySuggestion(current, suggestion))} className={UI.chip}>Applica</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className={UI.muted}>Nessun nuovo suggerimento rispetto all’impianto salvato.</p>}
              </>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
          <p className={UI.body}>Premi «Configura» sui moduli che hai in casa e scegli i sensori. I moduli non configurati restano esclusi.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {ENERGY_MODULES.map((id) => (
              <ModuleEditor
                key={id}
                id={id}
                module={draft[id]}
                offline={profile.module_status[id] === 'offline'}
                discovery={discovery}
                haStates={haStates}
                issues={issues.filter((issue) => issue.module === id)}
                onChange={(module) => setDraft((current) => ({ ...current, [id]: module }))}
              />
            ))}
            <datalist id="energy-sensors">
              {sensorIds.map((id) => <option key={id} value={id} />)}
            </datalist>
          </div>
          </>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="flex h-[26rem] items-center justify-center overflow-hidden rounded-[1.5rem] bg-[#10151b] sm:h-[30rem]">
              {present.length ? (
                <EnergyHomeVisual
                  state={{ modules: Object.fromEntries(present.map((id) => [id, {}])) as EnergyState['modules'] }}
                  view={buildFlowFromDraft(draft, discovery)}
                />
              ) : <p className="text-sm text-white/70">Nessun modulo presente.</p>}
            </div>
            <div className={`space-y-2 ${UI.body}`}>
              <p>L’anteprima mostra soltanto i moduli presenti, con le letture attuali verificate da Domus.</p>
              {!draft.home.present && draft.grid.present ? <p>Il consumo della casa sarà calcolato dopo il salvataggio, solo con dati completi e coerenti.</p> : null}
              {absent.length ? <p>Non presenti: {absent.join(', ')}.</p> : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className={`space-y-3 ${UI.body}`}>
            {present.length ? (
              <ul className="space-y-1.5">
                {present.map((id) => (
                  <li key={id}>
                    <span className={UI.title}>{MODULE_META[id].label}:</span>{' '}
                    <span className="break-all font-mono">{Object.values(modules[id]?.sensors ?? {}).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : <p>Nessun modulo: Domus Energy risulterà non configurato.</p>}
            {dirty ? null : <p className={UI.muted}>Nessuna modifica rispetto all’impianto salvato.</p>}
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
        {blocked ? <p id="energy-step-blocked" className={`mb-2 ${ERROR_TEXT}`}>Completa o correggi i moduli evidenziati per continuare.</p> : null}
        <div className="flex gap-2 sm:justify-end">
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} disabled={saving} className={`${UI.button} flex-1 justify-center sm:flex-none`}>Indietro</button> : null}
          {step < 3 ? (
            <button type="button" onClick={() => setStep(step + 1)} disabled={blocked} aria-describedby={blocked ? 'energy-step-blocked' : undefined} className={`${UI.primary} flex-1 justify-center sm:flex-none`}>
              Avanti
            </button>
          ) : (
            <button type="button" onClick={() => void handleSave()} disabled={saving || issues.length > 0 || !dirty} className={`${UI.primary} flex-1 justify-center sm:flex-none`}>
              {saving ? <LoaderCircle className={UI.spin} aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Salva impianto
            </button>
          )}
        </div>
      </>,
  );
}
