import type { MockEntityStateMap } from '../../../types/ha';
import type { EnergyConfidence, EnergyDiscovery, EnergyModuleId } from '../../../services/energyCoreClient';
import { activeRoles, type DraftIssue, type DraftModule } from './energyDraft';
import { MODULE_META, REASON_LABEL, UI, formatQuantity } from './energyModel';

/* Module binding editor shared by the setup wizard and the Energy settings. */

const CONFIDENCE: Record<EnergyConfidence, string> = { high: 'alta', medium: 'media', low: 'bassa' };
export const ERROR_TEXT = 'text-xs text-[color:var(--ui-danger)]';
const SELECTED = 'aria-pressed:ring-2 aria-checked:ring-2 ring-[color:var(--ui-accent)]';

export const roleLabel = (id: EnergyModuleId, role: string) =>
  MODULE_META[id].roles.find((spec) => spec.role === role)?.label ?? role;

export const Confidence = ({ value }: { value: EnergyConfidence }) => (
  <span className={UI.muted}>confidenza {CONFIDENCE[value]}</span>
);

function hintFor(value: string, discovery: EnergyDiscovery | null, haStates: MockEntityStateMap) {
  const preview = value ? discovery?.candidates[value]?.preview : undefined;
  if (preview) {
    return preview.status === 'ok'
      ? `Lettura attuale: ${formatQuantity(preview)}`
      : `Lettura: ${REASON_LABEL[preview.reason ?? ''] ?? 'non disponibile'}`;
  }
  const raw = value ? haStates[value] : undefined;
  return raw ? `Stato attuale: ${raw.state} ${raw.unit ?? ''} (verificato al salvataggio)` : 'Scegli un suggerimento o inserisci un’entità sensor.*';
}

function SensorField({
  id,
  role,
  value,
  discovery,
  haStates,
  error,
  onChange,
}: {
  id: EnergyModuleId;
  role: string;
  value: string;
  discovery: EnergyDiscovery | null;
  haStates: MockEntityStateMap;
  error?: DraftIssue;
  onChange: (value: string) => void;
}) {
  const inputId = `energy-${id}-${role}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className={`block text-sm ${UI.title}`}>{roleLabel(id, role)}</label>
      <input
        id={inputId}
        list="energy-sensors"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="sensor.…"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={`${inputId}-hint`}
        className="liquid-glass-control min-h-10 w-full rounded-xl px-3 font-mono text-sm"
      />
      <p id={`${inputId}-hint`} className={error ? ERROR_TEXT : UI.muted}>{error?.message ?? hintFor(value, discovery, haStates)}</p>
      <div className="flex flex-wrap gap-1.5">
        {(discovery?.proposals[id]?.[role] ?? []).slice(0, 3).map((proposal) => (
          <button
            key={proposal.entity_id}
            type="button"
            aria-pressed={value === proposal.entity_id}
            onClick={() => onChange(proposal.entity_id)}
            className={`${UI.chip} ${SELECTED}`}
          >
            <span className="font-mono">{proposal.entity_id}</span>
            <Confidence value={proposal.confidence} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModuleEditor({
  id,
  module,
  offline,
  discovery,
  haStates,
  issues,
  locked = false,
  onChange,
}: {
  id: EnergyModuleId;
  module: DraftModule;
  /** Presence is decided elsewhere (the plant type), so the module cannot be toggled here. */
  locked?: boolean;
  offline: boolean;
  discovery: EnergyDiscovery | null;
  haStates: MockEntityStateMap;
  issues: DraftIssue[];
  onChange: (module: DraftModule) => void;
}) {
  const meta = MODULE_META[id];
  const moduleIssue = issues.find((issue) => !issue.role);
  return (
    <fieldset className={UI.card}>
      <legend className="sr-only">{meta.label}</legend>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={UI.title}>{meta.label}</p>
          <p className={UI.muted}>{module.present ? meta.hint : 'Non incluso nell’impianto'}{offline ? ' · sensori offline' : ''}</p>
        </div>
        {locked ? null : (
          <button
            type="button"
            aria-label={`${module.present ? 'Rimuovi' : 'Configura'} ${meta.label}`}
            onClick={() => onChange({ ...module, present: !module.present })}
            className={`${UI.chip} ${module.present ? '' : 'font-semibold text-[color:var(--ui-accent)]'}`}
          >
            {module.present ? 'Rimuovi' : 'Configura'}
          </button>
        )}
      </div>
      {module.present ? (
        <div className="mt-3 space-y-3">
          {meta.conventions ? (
            <div role="radiogroup" aria-label={`Collegamento ${meta.label}`} className="flex flex-wrap gap-1.5">
              {(['split', 'net'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={module.mode === mode}
                  onClick={() => onChange({ ...module, mode })}
                  className={`${UI.chip} ${SELECTED}`}
                >
                  {mode === 'split' ? 'Sensori separati per direzione' : 'Un sensore con segno'}
                </button>
              ))}
            </div>
          ) : null}
          {activeRoles(id, module.mode).map((role) => (
            <SensorField
              key={role}
              id={id}
              role={role}
              value={module.sensors[role] ?? ''}
              discovery={discovery}
              haStates={haStates}
              error={issues.find((issue) => issue.role === role)}
              onChange={(value) => onChange({ ...module, sensors: { ...module.sensors, [role]: value } })}
            />
          ))}
          {module.mode === 'net' && meta.conventions && module.sensors.net_power ? (
            <fieldset>
              <legend className={`text-sm ${UI.title}`}>Cosa indicano i valori positivi?</legend>
              <p className={UI.muted}>Domus non deduce il segno: verificalo nella tua integrazione.</p>
              {meta.conventions.map(([value, label]) => (
                <label key={value} className={`flex min-h-9 items-center gap-2 ${UI.body}`}>
                  <input
                    type="radio"
                    name={`energy-${id}-sign`}
                    checked={module.signConvention === value}
                    onChange={() => onChange({ ...module, signConvention: value })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {moduleIssue ? <p className={ERROR_TEXT}>{moduleIssue.message}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
