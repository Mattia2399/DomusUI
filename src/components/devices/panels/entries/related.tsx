import { CirclePlay, Gauge, SlidersHorizontal, ToggleRight } from 'lucide-react';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassSlider } from '../../../ui/GlassSlider';
import { GlassChoiceRows } from '../../../ui/GlassListRow';
import { GlassVerticalSlider } from '../../../ui/GlassVerticalSlider';
import type { PanelControl, PanelPlace } from '../registry';
import { ICON } from './shared';

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

export function relatedControl(
  entity: RelatedInfo,
  { runLabel, busy = false, optionName = (option) => option, place, commands }: { runLabel: string; busy?: boolean; optionName?: (option: string) => string; place?: PanelPlace; commands: RelatedCommands },
): PanelControl | null {
  const common = { id: entity.entityId, label: entity.name, value: entity.stateLabel, place };
  if (TOGGLES.includes(entity.domain)) {
    return { ...common, icon: <ToggleRight {...ICON} />, on: ON_STATES.includes(normalized(entity.state)), disabled: busy || AWAY_STATES.includes(normalized(entity.state)), onPress: commands.toggle };
  }
  if (entity.domain === 'button' || entity.domain === 'input_button') {
    return { ...common, icon: <CirclePlay {...ICON} />, actionLabel: runLabel, disabled: busy, onPress: commands.press };
  }
  if ((entity.domain === 'select' || entity.domain === 'input_select') && entity.options?.length) {
    const options = entity.options.map((option) => ({ value: option, label: optionName(option) }));
    const current = entity.options.includes(entity.state ?? '') ? entity.state : null;
    return {
      ...common,
      icon: <SlidersHorizontal {...ICON} />,
      value: entity.stateLabel ?? (entity.state ? optionName(entity.state) : undefined),
      looks: ['list'],
      big: () => <GlassChoiceRows<string> size="hero" ariaLabel={entity.name} disabled={busy} options={options} value={current} onChange={commands.select} />,
      group: <GlassChips<string> size="dialog" ariaLabel={entity.name} disabled={busy} options={options} value={current} onChange={commands.select} />,
    };
  }
  const value = entity.numericValue ?? Number(entity.state);
  if ((entity.domain === 'number' || entity.domain === 'input_number') && Number.isFinite(value)) {
    const min = entity.min ?? 0;
    const max = entity.max ?? 100;
    const step = entity.step ?? 1;
    const text = entity.stateLabel ?? String(value);
    return {
      ...common,
      icon: <Gauge {...ICON} />,
      value: text,
      looks: ['slider'],
      big: () => <GlassVerticalSlider label={entity.name} value={value} min={min} max={max} step={step} commit="release" disabled={busy} display={text} valueText={text} subtitle={entity.name} onValueChange={commands.number} />,
      group: <GlassSlider variant="bar" tone="device" commit="release" min={min} max={max} step={step} label={entity.name} value={value} valueText={text} disabled={busy} onValueChange={commands.number} />,
    };
  }
  return null;
}
