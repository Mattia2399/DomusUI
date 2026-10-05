import { Check } from 'lucide-react';
import type { EnergyModuleId } from '../../../services/energyCoreClient';
import type { EnergyDraft } from './energyDraft';
import { UI } from './energyModel';

/* Plant type picker for the bindings step: one illustrated tile per hardware combination. */

type Hardware = Exclude<EnergyModuleId, 'home'>;
export type PlantId = string;

const HARDWARE: Hardware[] = ['grid', 'solar', 'battery', 'wallbox'];

/** Every combination with a grid connection; anything else (off-grid, partial metering) is "Altro". */
const PLANTS: Array<{ id: PlantId; title: string; modules: Hardware[] }> = [
  { id: 'grid', title: 'Solo rete', modules: ['grid'] },
  { id: 'solar', title: 'Fotovoltaico', modules: ['grid', 'solar'] },
  { id: 'solar-battery', title: 'Fotovoltaico + batteria', modules: ['grid', 'solar', 'battery'] },
  { id: 'full', title: 'Impianto completo', modules: ['grid', 'solar', 'battery', 'wallbox'] },
  { id: 'solar-wallbox', title: 'Fotovoltaico + wallbox', modules: ['grid', 'solar', 'wallbox'] },
  { id: 'wallbox', title: 'Wallbox', modules: ['grid', 'wallbox'] },
  { id: 'battery', title: 'Batteria', modules: ['grid', 'battery'] },
  { id: 'battery-wallbox', title: 'Batteria + wallbox', modules: ['grid', 'battery', 'wallbox'] },
];
export const OTHER_PLANT = 'other';

const NAME: Record<EnergyModuleId, string> = {
  grid: 'la rete elettrica',
  solar: 'il fotovoltaico',
  battery: 'una batteria',
  wallbox: 'una wallbox',
  home: 'il misuratore dei consumi di casa',
};
const SHORT: Record<Hardware, string> = { grid: 'Rete', solar: 'fotovoltaico', battery: 'batteria', wallbox: 'wallbox' };

const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** "la rete elettrica, il fotovoltaico e una batteria" for the modules present in a draft. */
export const plantSentence = (ids: EnergyModuleId[]) => listOf(ids.map((id) => NAME[id]));

/** The tile matching the hardware in a draft, or null when it matches none. */
export function plantFor(draft: EnergyDraft): PlantId | null {
  const present = HARDWARE.filter((id) => draft[id].present);
  return PLANTS.find((plant) => plant.modules.length === present.length && plant.modules.every((id) => present.includes(id)))?.id ?? null;
}

export const plantModules = (id: PlantId) => PLANTS.find((plant) => plant.id === id)?.modules ?? [];
export const plantTitle = (id: PlantId) => PLANTS.find((plant) => plant.id === id)?.title ?? 'Altro';

/** Selecting a plant only toggles presence: sensors already chosen are kept for when a module comes back. */
export function applyPlant(draft: EnergyDraft, id: PlantId): EnergyDraft {
  const modules = plantModules(id);
  return Object.fromEntries(
    Object.entries(draft).map(([key, module]) => [key, key === 'home' ? module : { ...module, present: modules.includes(key as Hardware) }]),
  ) as EnergyDraft;
}

/** Line drawing of a house with only the installed hardware around it. */
export function PlantIllustration({ modules, className = '' }: { modules: EnergyModuleId[]; className?: string }) {
  const has = (id: EnergyModuleId) => modules.includes(id);
  const other = modules.length === 0;
  return (
    <svg viewBox="0 0 176 100" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M8 88h160" stroke="currentColor" strokeOpacity=".25" className="text-[color:var(--ui-text-secondary)]" />
      <g stroke="currentColor" className="text-[color:var(--ui-text-secondary)]" strokeDasharray={other ? '3 3' : undefined}>
        <path d="M62 57v31h52V57" />
        <path d="M56 57l14-23h36l14 23" />
        <rect x="80" y="70" width="12" height="18" rx="1" />
        <rect x="67" y="64" width="8" height="8" rx="1" />
        <rect x="98" y="64" width="9" height="8" rx="1" />
      </g>
      {other ? (
        <g stroke="currentColor" className="text-[color:var(--ui-accent)]">
          <circle cx="138" cy="34" r="12" />
          <path d="M138 28v12M132 34h12" />
        </g>
      ) : null}
      {has('grid') ? (
        <g stroke="currentColor" className="text-sky-500">
          <path d="M26 88V22M15 30h22M19 38h14M21 30l5-8 5 8" />
          <circle cx="15" cy="28" r="1.4" fill="currentColor" />
          <circle cx="37" cy="28" r="1.4" fill="currentColor" />
          <path d="M37 30q14 12 25 28" strokeDasharray="2 2.5" />
        </g>
      ) : null}
      {has('solar') ? (
        <g stroke="currentColor" className="text-amber-500">
          <path d="M66 53l9-15h26l9 15z" fill="currentColor" fillOpacity=".18" />
          <path d="M83.7 38l-3 15M92.3 38l3 15M70.5 45.5h35" strokeWidth="1.1" />
        </g>
      ) : null}
      {has('battery') ? (
        <g stroke="currentColor" className="text-emerald-500">
          <rect x="46" y="67" width="11" height="21" rx="2" />
          <path d="M49.5 64.5h4" strokeWidth="2.2" />
          <rect x="48.5" y="76" width="6" height="9.5" rx=".8" fill="currentColor" fillOpacity=".55" stroke="none" />
        </g>
      ) : null}
      {has('wallbox') ? (
        <g stroke="currentColor" className="text-violet-500">
          <rect x="121" y="60" width="9" height="13" rx="2" />
          <path d="M125.5 73v15M125.5 70q2 10 12 9" />
          <path d="M136 86v-5q1-6 7-7h11q5 0 8 6l3 1v5z" fill="currentColor" fillOpacity=".15" />
          <circle cx="142" cy="87" r="3" fill="var(--ui-surface-primary)" />
          <circle cx="158" cy="87" r="3" fill="var(--ui-surface-primary)" />
        </g>
      ) : null}
    </svg>
  );
}

const TILE =
  'relative flex flex-col items-stretch gap-2 rounded-[1.35rem] border bg-[color:var(--ui-surface-primary)] p-3 text-left shadow-[var(--ui-shadow-card)] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]';

function Tile({
  title,
  caption,
  modules,
  selected,
  onSelect,
  className = '',
}: {
  title: string;
  caption: string;
  modules: EnergyModuleId[];
  selected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={title}
      onClick={onSelect}
      className={`${TILE} ${className} ${selected ? 'border-[color:var(--ui-accent)] ring-1 ring-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] hover:border-[color:var(--ui-text-tertiary)]'}`}
    >
      {selected ? (
        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--ui-accent)] text-white">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : null}
      <span className="flex h-20 items-center justify-center rounded-xl sm:h-24 bg-[color:var(--ui-fill-tertiary)] px-2">
        <PlantIllustration modules={modules} className="h-full w-full max-w-[11rem]" />
      </span>
      <span className="px-0.5">
        <span className={`block text-sm ${UI.title}`}>{title}</span>
        <span className={`block ${UI.muted}`}>{caption}</span>
      </span>
    </button>
  );
}

export function PlantPicker({ value, onSelect }: { value: PlantId | null; onSelect: (id: PlantId) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo di impianto" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
      {PLANTS.map((plant) => (
        <Tile
          key={plant.id}
          title={plant.title}
          caption={listOf(plant.modules.map((id) => SHORT[id]))}
          modules={plant.modules}
          selected={value === plant.id}
          onSelect={() => onSelect(plant.id)}
        />
      ))}
      <Tile
        title="Altro"
        caption="Configurazione manuale dei moduli"
        modules={[]}
        selected={value === OTHER_PLANT}
        onSelect={() => onSelect(OTHER_PLANT)}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}
