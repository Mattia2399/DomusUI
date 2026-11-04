import { CirclePlay, Gauge, SlidersHorizontal, ToggleRight } from 'lucide-react';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassSlider } from '../../../ui/GlassSlider';
import type { PanelItem } from '../registry';
import { chipSize, ICON } from './shared';

/*
 * A control the integration of a device adds beside its entity, as a robot's or a
 * camera's: a switch or a button act at once, a list or a number open their controls.
 */

export type RelatedInfo = {
  entityId: string;
  name: string;
  domain: string;
  state?: string;
  stateLabel?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  numericValue?: number;
};

export type RelatedCommands = {
  toggle: () => void;
  press: () => void;
  select: (option: string) => void;
  number: (value: number) => void;
};

const TOGGLES = ['switch', 'input_boolean', 'light', 'fan', 'siren'];
const ON_STATES = ['on', 'open', 'playing', 'recording', 'active'];
const AWAY_STATES = ['unavailable', 'unknown', ''];
const normalized = (value: string | undefined) => `${value ?? ''}`.trim().toLowerCase();

export function relatedItem(
  entity: RelatedInfo,
  { runLabel, busy = false, optionName = (option) => option, commands }: { runLabel: string; busy?: boolean; optionName?: (option: string) => string; commands: RelatedCommands },
): PanelItem | null {
  const common = { key: entity.entityId, label: entity.name, value: entity.stateLabel };
  if (TOGGLES.includes(entity.domain)) {
    return { ...common, icon: <ToggleRight {...ICON} />, kind: 'toggle', on: ON_STATES.includes(normalized(entity.state)), disabled: busy || AWAY_STATES.includes(normalized(entity.state ?? entity.stateLabel)), onPress: commands.toggle };
  }
  if (entity.domain === 'button' || entity.domain === 'input_button') {
    return { ...common, icon: <CirclePlay {...ICON} />, kind: 'action', actionLabel: runLabel, disabled: busy, onPress: commands.press };
  }
  if ((entity.domain === 'select' || entity.domain === 'input_select') && entity.options?.length) {
    const options = entity.options;
    return {
      ...common,
      icon: <SlidersHorizontal {...ICON} />,
      kind: 'opens',
      value: entity.stateLabel ?? (entity.state ? optionName(entity.state) : undefined),
      content: (place) => (
        <GlassChips<string>
          size={chipSize(place)}
          ariaLabel={entity.name}
          disabled={busy}
          options={options.map((option) => ({ value: option, label: optionName(option) }))}
          value={options.includes(entity.state ?? '') ? entity.state : null}
          onChange={commands.select}
        />
      ),
    };
  }
  const value = entity.numericValue ?? Number(entity.state);
  if ((entity.domain === 'number' || entity.domain === 'input_number') && Number.isFinite(value)) {
    return {
      ...common,
      icon: <Gauge {...ICON} />,
      kind: 'opens',
      value: entity.stateLabel ?? String(value),
      content: () => (
        <GlassSlider variant="bar" tone="device" commit="release" min={entity.min ?? 0} max={entity.max ?? 100} step={entity.step ?? 1} label={entity.name} value={value} valueText={String(value)} disabled={busy} onValueChange={commands.number} />
      ),
    };
  }
  return null;
}
