import React from 'react';
import { Battery, CarFront, Home, LoaderCircle, Search, SunMedium, TowerControl, type LucideIcon } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  ENERGY_MODULES,
  discoverEnergy,
  editableAsV1,
  supportsProfileV2,
  getEnergyProfile,
  profileRevision,
  profileTariff,
  TARIFF_UPDATE_MESSAGE,
  saveEnergyPlant,
  saveEnergyProfile,
  supportsTariff,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyDiscovery,
  type EnergyModuleId,
  type EnergyProfileResult,
  type EnergyTariff,
} from '../../../services/energyCoreClient';
import { EnergyPlantSettings } from './EnergyPlantSettings';
import { draftFromProfile, draftToModules, sameModules, validateDraft, type EnergyDraft } from './energyDraft';
import { ERROR_TEXT, ModuleEditor } from './EnergyModuleEditor';
import { GROUP, ROW, TARIFF_HINT, TariffFields, tariffForm, tariffFromForm, type TariffForm } from './EnergyTariffFields';
import { MODULE_META, UI } from './energyModel';

const ICONS: Record<EnergyModuleId, LucideIcon> = {
  grid: TowerControl,
  solar: SunMedium,
  home: Home,
  battery: Battery,
  wallbox: CarFront,
};

type Status = { saving?: boolean; message?: string; error?: boolean };

function Group({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="px-1">
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--ui-text-primary)]">{title}</h2>
        <p className={UI.muted}>{description}</p>
      </div>
      <div className={GROUP}>{children}</div>
    </section>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.saving) return <p role="status" className={`flex items-center gap-2 ${UI.muted}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Salvataggio…</p>;
  if (!status.message) return null;
  return <p role={status.error ? 'alert' : 'status'} className={status.error ? ERROR_TEXT : 'text-xs text-[color:var(--ui-success)]'}>{status.message}</p>;
}

export default function EnergySettings({
  callApi,
  haStates,
  onRediscover,
  onSaved,
  initialModule = null,
}: {
  callApi: EnergyCallApi;
  haStates: MockEntityStateMap;
  onRediscover: () => void;
  onSaved: () => void;
  /** Module whose editor starts open, when arriving from that component's details. */
  initialModule?: EnergyModuleId | null;
}) {
  const [profile, setProfile] = React.useState<EnergyProfileResult | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [discovery, setDiscovery] = React.useState<EnergyDiscovery | null>(null);
  const [draft, setDraft] = React.useState<EnergyDraft | null>(null);
  const [open, setOpen] = React.useState<EnergyModuleId | null>(initialModule);
  const [form, setForm] = React.useState<TariffForm>(() => tariffForm(null));
  const [plantStatus, setPlantStatus] = React.useState<Status>({});
  const [tariffStatus, setTariffStatus] = React.useState<Status>({});

  const apply = React.useCallback((result: EnergyProfileResult) => {
    setProfile(result);
    // Integrations with Energy Profile v2 always use the device settings; the
    // classic module editor stays for integrations that store v1 only.
    setDraft(editableAsV1(result) && !supportsProfileV2(result) ? draftFromProfile(result.profile.modules) : null);
    setForm(tariffForm(profileTariff(result)));
  }, []);

  React.useEffect(() => {
    getEnergyProfile(callApi).then(apply, (error) => setLoadError(toEnergyCoreError(error).message));
    // Suggestions are optional: editing works without them.
    discoverEnergy(callApi).then(setDiscovery, () => undefined);
  }, [apply, callApi]);

  if (loadError) return <p role="alert" className={`liquid-glass-card p-5 ${UI.body}`}>{loadError}</p>;
  if (!profile || (editableAsV1(profile) && !supportsProfileV2(profile) && !draft)) {
    return <p role="status" className={`flex items-center gap-2 ${UI.body}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Caricamento impostazioni…</p>;
  }

  const v1 = editableAsV1(profile) && !supportsProfileV2(profile) && draft ? { profile: profile.profile, draft } : null;
  const v2 = profile.profile_v2;
  const saved = v1?.profile.modules ?? {};
  const issues = v1 ? validateDraft(v1.draft) : [];
  const modules = v1 ? draftToModules(v1.draft) : {};
  const plantDirty = Boolean(v1) && !sameModules(modules, draftToModules(draftFromProfile(saved)));
  const withGrid = v1 ? v1.draft.grid.present : Boolean(v2?.plant.grid);
  const { tariff } = tariffFromForm(form, withGrid);
  const tariffSupported = v1 ? supportsTariff(v1.profile) : Boolean(v2);
  const storedTariff = profileTariff(profile);

  const save = async (kind: 'plant' | 'tariff', nextTariff?: EnergyTariff | null) => {
    const setStatus = kind === 'plant' ? setPlantStatus : setTariffStatus;
    setStatus({ saving: true });
    try {
      // Each section saves on its own: the other keeps its stored value. A v2
      // plant is resent unchanged with the new tariff.
      const revision = profileRevision(profile);
      const result = kind === 'plant'
        ? await saveEnergyProfile(callApi, modules, revision)
        : v1
          ? await saveEnergyProfile(callApi, saved, revision, nextTariff)
          : await saveEnergyPlant(callApi, v2?.plant ?? {}, revision, nextTariff);
      apply(result);
      setOpen(null);
      setStatus({ message: kind === 'plant' ? 'Impianto salvato.' : nextTariff ? 'Tariffa salvata.' : 'Tariffa rimossa.' });
      onSaved();
    } catch (failure) {
      setStatus({ error: true, message: `${toEnergyCoreError(failure).message} Le modifiche restano qui.` });
    }
  };

  const diverged = profile.legacy_v1?.diverged;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      {diverged ? (
        <p role="note" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-warning)]">
          Una versione precedente di Domus UI ha modificato l’impianto dopo l’aggiornamento: quelle modifiche non sono state applicate. Vale la configurazione mostrata qui; se servono, ripetile da queste impostazioni.
        </p>
      ) : null}
      {v2?.load_error ? (
        <p role="note" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-warning)]">
          Il profilo salvato non era leggibile ed è stato ignorato: salvando l’impianto ne crei uno nuovo.
        </p>
      ) : null}
      {!v1 && v2 ? (
        <Group title="Impianto" description="I dispositivi del tuo impianto: aprine uno per modificarlo. La configurazione avanzata mostra ogni dettaglio tecnico.">
          <EnergyPlantSettings
            result={{ ...profile, profile_v2: v2 }}
            callApi={callApi}
            haStates={haStates}
            discovery={discovery}
            initialModule={initialModule}
            onSaved={(result) => { apply(result); onSaved(); }}
            onRediscover={onRediscover}
          />
        </Group>
      ) : null}
      {v1 ? (
      <Group title="Impianto" description="Moduli presenti e sensori di Home Assistant da cui Domus legge i valori.">
        {ENERGY_MODULES.map((id) => {
          const Icon = ICONS[id];
          const draft = v1.draft;
          const module = draft[id];
          const sensors = Object.values(draftToModules({ ...draft })[id]?.sensors ?? {});
          const status = profile.module_status[id];
          return (
            <div key={id} className={ROW}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]">
                <Icon className="h-4 w-4 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
                  {MODULE_META[id].label}
                  {status === 'offline' ? <span className="ml-2 text-[10px] font-semibold text-amber-500">Offline</span> : null}
                </p>
                <p className={`truncate ${UI.muted}`}>{module.present ? sensors.join(', ') || 'Nessun sensore scelto' : 'Non presente'}</p>
              </div>
              <button
                type="button"
                aria-expanded={open === id}
                aria-label={`${open === id ? 'Chiudi' : 'Modifica'} ${MODULE_META[id].label}`}
                onClick={() => setOpen(open === id ? null : id)}
                className={UI.chip}
              >
                {open === id ? 'Chiudi' : 'Modifica'}
              </button>
              {open === id ? (
                <div className="w-full">
                  <ModuleEditor
                    id={id}
                    module={module}
                    offline={status === 'offline'}
                    discovery={discovery}
                    haStates={haStates}
                    issues={issues.filter((issue) => issue.module === id)}
                    onChange={(next) => setDraft({ ...v1.draft, [id]: next })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        <div className={`${ROW} justify-between`}>
          <button type="button" onClick={onRediscover} className={UI.button}>
            <Search className="h-4 w-4" aria-hidden="true" /> Ripeti rilevamento
          </button>
          <div className="flex items-center gap-2">
            {plantDirty ? (
              <button type="button" onClick={() => { setDraft(draftFromProfile(saved)); setOpen(null); }} className={UI.button}>Annulla</button>
            ) : null}
            <button type="button" disabled={!plantDirty || issues.length > 0 || plantStatus.saving} onClick={() => void save('plant')} className={UI.primary}>
              Salva impianto
            </button>
          </div>
          <div className="w-full"><StatusLine status={plantStatus} /></div>
        </div>
      </Group>
      ) : null}

      <Group title="Tariffa e costi" description={TARIFF_HINT}>
        {tariffSupported ? (
          <>
        <TariffFields form={form} onChange={setForm} withExport={withGrid} />
        <div className={`${ROW} justify-end`}>
          {storedTariff ? (
            <button type="button" disabled={tariffStatus.saving} onClick={() => void save('tariff', null)} className={UI.button}>Rimuovi tariffa</button>
          ) : null}
          <button type="button" disabled={!tariff || tariffStatus.saving} onClick={() => void save('tariff', tariff)} className={UI.primary}>
            Salva tariffa
          </button>
          <div className="w-full text-right"><StatusLine status={tariffStatus} /></div>
        </div>
          </>
        ) : (
          <p role="status" className={`${ROW} ${UI.body}`}>{TARIFF_UPDATE_MESSAGE}</p>
        )}
      </Group>
    </div>
  );
}
