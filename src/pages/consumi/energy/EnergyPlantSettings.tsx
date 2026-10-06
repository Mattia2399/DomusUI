import React from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  ENERGY_MODULES,
  profileRevision,
  saveEnergyPlant,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyDiscovery,
  type EnergyModuleId,
  type EnergyProfileResult,
} from '../../../services/energyCoreClient';
import { PlantModuleSection } from './EnergyDeviceEditor';
import { ERROR_TEXT } from './EnergyModuleEditor';
import { ROW } from './EnergyTariffFields';
import { MODULE_META, UI } from './energyModel';
import {
  deviceLabel,
  plantChanged,
  plantDraftFromProfile,
  plantFromDraft,
  plantReferences,
  removedDevices,
  takenSensors,
  validatePlantDraft,
  type PlantDraft,
} from './energyPlantDraft';
import { referenceCheck } from './energySensorCatalog';

/*
 * Settings of an Energy Profile v2 plant (several devices, meters, a total):
 * configured devices and totals are edited and saved as a whole plant. New
 * devices come from the setup wizard; nothing is saved without the backend.
 */

type Status = { saving?: boolean; message?: string; error?: boolean };

export function EnergyPlantSettings({
  result,
  callApi,
  haStates,
  discovery,
  initialModule = null,
  onSaved,
  onRediscover,
}: {
  result: EnergyProfileResult & { profile_v2: NonNullable<EnergyProfileResult['profile_v2']> };
  callApi: EnergyCallApi;
  haStates: MockEntityStateMap;
  discovery: EnergyDiscovery | null;
  initialModule?: EnergyModuleId | null;
  onSaved: (result: EnergyProfileResult) => void;
  /** Opens the setup wizard on this plant: new devices, meters, totals, re-detection. */
  onRediscover?: () => void;
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
  const known = React.useMemo(() => plantReferences(stored), [stored]);
  const issues = validatePlantDraft(draft, referenceCheck(haStates, meters, known));
  const changed = plantChanged(draft, stored);
  const removals = removedDevices(draft);
  const taken = takenSensors(draft);
  const incomplete = result.energy_meters && (result.energy_meters.recorder === 'unavailable' || result.energy_meters.verification === 'incomplete');
  const shared = { haStates, discovery, meters };
  // A picker only blocks sensors held by another device or total.
  const takenBy = (holder: string) => Object.fromEntries(Object.entries(taken).filter(([, by]) => by !== holder));

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
      {ENERGY_MODULES.map((id) => (
        <PlantModuleSection
          key={id}
          {...shared}
          module={id}
          draft={draft}
          issues={issues.filter((issue) => issue.module === id)}
          open={open}
          onOpen={setOpen}
          onDraft={setDraft}
          offline={result.module_status[id] === 'offline'}
          takenFor={takenBy}
        />
      ))}
      {onRediscover ? (
        <div className={ROW}>
          <button type="button" onClick={onRediscover} className={UI.button}>
            <Search className="h-4 w-4" aria-hidden="true" /> Aggiungi dispositivi o nuovo rilevamento
          </button>
          <p className={`w-full ${UI.muted}`}>Il rilevamento guidato propone nuovi inverter, batterie, wallbox e contatori: nulla cambia senza la tua conferma.</p>
        </div>
      ) : null}
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
