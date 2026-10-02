import React from 'react';
import { Battery, CarFront, Home, LoaderCircle, Search, SunMedium, TowerControl, type LucideIcon } from 'lucide-react';
import GlassSegmentSelect from '../../../components/ui/GlassSegmentSelect';
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
  type EnergyTariff,
  type EnergyTariffScheme,
} from '../../../services/energyCoreClient';
import { draftFromProfile, draftToModules, sameModules, validateDraft, type EnergyDraft } from './energyDraft';
import { ERROR_TEXT, ModuleEditor } from './EnergyModuleEditor';
import { MODULE_META, UI } from './energyModel';

const ICONS: Record<EnergyModuleId, LucideIcon> = {
  grid: TowerControl,
  solar: SunMedium,
  home: Home,
  battery: Battery,
  wallbox: CarFront,
};

const SCHEMES: Array<{ value: EnergyTariffScheme; label: string; bands: Array<[string, string, string]> }> = [
  { value: 'single', label: 'Monoraria', bands: [['single', 'Prezzo unico', 'Tutte le ore']] },
  {
    value: 'two_band',
    label: 'Bioraria',
    bands: [
      ['f1', 'F1', 'Lun–ven 8–19'],
      ['f23', 'F23', 'Lun–ven 19–8, weekend e festivi'],
    ],
  },
  {
    value: 'three_band',
    label: 'Trioraria',
    bands: [
      ['f1', 'F1', 'Lun–ven 8–19'],
      ['f2', 'F2', 'Lun–ven 7–8 e 19–23, sabato 7–23'],
      ['f3', 'F3', 'Notte 23–7, domenica e festivi'],
    ],
  },
];

const GROUP = 'overflow-hidden rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] shadow-[var(--ui-shadow-card)]';
const ROW = 'flex flex-wrap items-center gap-3 border-t border-[color:var(--ui-separator)] px-4 py-3.5 first:border-t-0 sm:px-5';
const FIELD = 'liquid-glass-control min-h-10 w-28 rounded-xl px-3 text-right text-sm';

type Status = { saving?: boolean; message?: string; error?: boolean };
type TariffForm = { scheme: EnergyTariffScheme; prices: Record<string, string>; fixed: string; vat: string; export: string };

const text = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value).replace('.', ','));
const parse = (value: string) => (value.trim() ? Number(value.trim().replace(',', '.')) : null);

function tariffForm(tariff: EnergyTariff | null | undefined): TariffForm {
  return {
    scheme: tariff?.scheme ?? 'three_band',
    prices: Object.fromEntries(Object.entries(tariff?.prices ?? {}).map(([key, value]) => [key, text(value)])),
    fixed: text(tariff?.fixed_monthly),
    vat: text(tariff?.vat_percent),
    export: text(tariff?.export_price),
  };
}

/** Client-side mirror of the backend limits for immediate feedback. */
function tariffFromForm(form: TariffForm): { tariff?: EnergyTariff; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const read = (key: string, value: string, max: number, required: boolean) => {
    const number = parse(value);
    if (number === null) {
      if (required) errors[key] = 'Obbligatorio';
      return null;
    }
    if (!Number.isFinite(number) || number < 0 || number > max) errors[key] = `Tra 0 e ${max}`;
    return number;
  };
  const bands = SCHEMES.find((scheme) => scheme.value === form.scheme)?.bands ?? [];
  const prices = Object.fromEntries(bands.map(([key]) => [key, read(key, form.prices[key] ?? '', 10, true) ?? 0]));
  const tariff: EnergyTariff = {
    scheme: form.scheme,
    prices,
    fixed_monthly: read('fixed', form.fixed, 10000, false),
    vat_percent: read('vat', form.vat, 100, false),
    export_price: read('export', form.export, 10, false),
  };
  return Object.keys(errors).length ? { errors } : { tariff, errors };
}

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
  const scheme = SCHEMES.find((item) => item.value === form.scheme) ?? SCHEMES[2];
  const { tariff, errors } = tariffFromForm(form);

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

      <Group title="Tariffa e costi" description="Prezzi del tuo contratto, IVA esclusa se indichi l’aliquota. Le fasce seguono gli orari ARERA.">
        <div className={ROW}>
          <p className="min-w-0 flex-1 text-sm font-medium text-[color:var(--ui-text-primary)]">Struttura tariffaria</p>
          <GlassSegmentSelect
            value={form.scheme}
            onChange={(value) => setForm({ ...form, scheme: value as EnergyTariffScheme })}
            options={SCHEMES.map(({ value, label }) => ({ value, label }))}
            ariaLabel="Struttura tariffaria"
            className="w-full sm:w-[20rem]"
            optionClassName="!h-9 !px-2"
          />
        </div>
        {[
          ...scheme.bands.map(([key, label, hours]) => [key, `${label} · €/kWh`, hours, form.prices[key] ?? '', (value: string) => setForm({ ...form, prices: { ...form.prices, [key]: value } })] as const),
          ['fixed', 'Quota fissa · €/mese', 'Canoni e oneri fissi in bolletta', form.fixed, (value: string) => setForm({ ...form, fixed: value })] as const,
          ['vat', 'IVA · %', 'Facoltativa', form.vat, (value: string) => setForm({ ...form, vat: value })] as const,
          ...(draft.grid.present
            ? [['export', 'Energia immessa · €/kWh', 'Ritiro dedicato o scambio sul posto', form.export, (value: string) => setForm({ ...form, export: value })] as const]
            : []),
        ].map(([key, label, hint, value, onChange]) => (
          <label key={key} className={ROW}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[color:var(--ui-text-primary)]">{label}</span>
              <span className={errors[key] ? ERROR_TEXT : UI.muted}>{errors[key] ?? hint}</span>
            </span>
            <input
              inputMode="decimal"
              value={value}
              placeholder="0,00"
              aria-invalid={Boolean(errors[key])}
              onChange={(event) => onChange(event.target.value)}
              className={FIELD}
            />
          </label>
        ))}
        <div className={`${ROW} justify-end`}>
          {profile.profile.tariff ? (
            <button type="button" disabled={tariffStatus.saving} onClick={() => void save('tariff', null)} className={UI.button}>Rimuovi tariffa</button>
          ) : null}
          <button type="button" disabled={!tariff || tariffStatus.saving} onClick={() => void save('tariff', tariff)} className={UI.primary}>
            Salva tariffa
          </button>
          <div className="w-full text-right"><StatusLine status={tariffStatus} /></div>
        </div>
      </Group>
    </div>
  );
}
