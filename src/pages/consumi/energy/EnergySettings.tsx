import React from 'react';
import { Battery, CarFront, Home, LoaderCircle, Search, SunMedium, TowerControl, type LucideIcon } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  ENERGY_MODULES,
  discoverEnergy,
  getEnergyProfile,
  TARIFF_UPDATE_MESSAGE,
  saveEnergyProfile,
  supportsTariff,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyDiscovery,
  type EnergyModuleId,
  type EnergyProfileResult,
  type EnergyTariff,
} from '../../../services/energyCoreClient';
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
}: {
  callApi: EnergyCallApi;
  haStates: MockEntityStateMap;
  onRediscover: () => void;
  onSaved: () => void;
}) {
  const [profile, setProfile] = React.useState<EnergyProfileResult | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [discovery, setDiscovery] = React.useState<EnergyDiscovery | null>(null);
  const [draft, setDraft] = React.useState<EnergyDraft | null>(null);
  const [open, setOpen] = React.useState<EnergyModuleId | null>(null);
  const [form, setForm] = React.useState<TariffForm>(() => tariffForm(null));
  const [plantStatus, setPlantStatus] = React.useState<Status>({});
  const [tariffStatus, setTariffStatus] = React.useState<Status>({});

  const apply = React.useCallback((result: EnergyProfileResult) => {
    setProfile(result);
    setDraft(draftFromProfile(result.profile.modules));
    setForm(tariffForm(result.profile.tariff));
  }, []);

  React.useEffect(() => {
    getEnergyProfile(callApi).then(apply, (error) => setLoadError(toEnergyCoreError(error).message));
    // Suggestions are optional: editing works without them.
    discoverEnergy(callApi).then(setDiscovery, () => undefined);
  }, [apply, callApi]);

  if (loadError) return <p role="alert" className={`liquid-glass-card p-5 ${UI.body}`}>{loadError}</p>;
  if (!profile || !draft) {
    return <p role="status" className={`flex items-center gap-2 ${UI.body}`}><LoaderCircle className={UI.spin} aria-hidden="true" /> Caricamento impostazioni…</p>;
  }

  const saved = profile.profile.modules;
  const issues = validateDraft(draft);
  const modules = draftToModules(draft);
  const plantDirty = !sameModules(modules, draftToModules(draftFromProfile(saved)));
  const { tariff } = tariffFromForm(form, draft.grid.present);

  const save = async (kind: 'plant' | 'tariff', nextTariff?: EnergyTariff | null) => {
    const setStatus = kind === 'plant' ? setPlantStatus : setTariffStatus;
    setStatus({ saving: true });
    try {
      // Each section saves on its own: the other keeps its stored value.
      const result = kind === 'plant'
        ? await saveEnergyProfile(callApi, modules, profile.profile.revision)
        : await saveEnergyProfile(callApi, saved, profile.profile.revision, nextTariff);
      apply(result);
      setOpen(null);
      setStatus({ message: kind === 'plant' ? 'Impianto salvato.' : nextTariff ? 'Tariffa salvata.' : 'Tariffa rimossa.' });
      onSaved();
    } catch (failure) {
      setStatus({ error: true, message: `${toEnergyCoreError(failure).message} Le modifiche restano qui.` });
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      <Group title="Impianto" description="Moduli presenti e sensori di Home Assistant da cui Domus legge i valori.">
        {ENERGY_MODULES.map((id) => {
          const Icon = ICONS[id];
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
                    onChange={(next) => setDraft({ ...draft, [id]: next })}
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
        <datalist id="energy-sensors">
          {Object.keys(haStates).filter((id) => id.startsWith('sensor.')).map((id) => <option key={id} value={id} />)}
        </datalist>
      </Group>

      <Group title="Tariffa e costi" description={TARIFF_HINT}>
        {supportsTariff(profile.profile) ? (
          <>
        <TariffFields form={form} onChange={setForm} withExport={draft.grid.present} />
        <div className={`${ROW} justify-end`}>
          {profile.profile.tariff ? (
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
