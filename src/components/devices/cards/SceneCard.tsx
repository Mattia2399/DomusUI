import type React from 'react';
import { BookOpen, Briefcase, Check, Clapperboard, Heart, Leaf, Moon, Star, Sun, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import type { SceneIcon, SceneModel } from '../model/scene';
import '../theme/devices.css';

/*
 * A scene of the room: a coloured round mark, its name and what it does. A
 * touch runs it; the scene in place reads "Attiva", the one running says how
 * many devices it is setting. While editing, a touch selects.
 */

export const SCENE_ICONS: Record<SceneIcon, LucideIcon> = {
  leaf: Leaf,
  film: Clapperboard,
  book: BookOpen,
  moon: Moon,
  sun: Sun,
  star: Star,
  heart: Heart,
  briefcase: Briefcase,
};

export type SceneCardProps = {
  model: SceneModel;
  /** What the round mark shows, when it is not the icon of the model (the icons of a Home scene). */
  mark?: React.ReactNode;
  /** A Home scene: instead of turning white, the pill fills with this colour ("r g b") up to `fill` (0 to 1). */
  tone?: string;
  fill?: number;
  active: boolean;
  applying: boolean;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  onRun: () => void;
  onSelect?: () => void;
  className?: string;
};

export function SceneCard({ model, mark, tone, fill = 0, active, applying, editing = false, selected = false, hiddenItem = false, onRun, onSelect, className }: SceneCardProps) {
  const dt = useDevicesTranslations();
  const Icon = SCENE_ICONS[model.icon];
  const count = model.entityIds.length;
  const status = applying
    ? count
      ? dt('sceneApplying', { count })
      : dt('sceneApplyingPlain')
    : active
      ? dt('sceneActive')
      : count === 0
        ? ''
        : count === 1
          ? dt('sceneDevicesOne')
          : dt('sceneDevicesMany', { count });
  const lit = active || applying;

  return (
    <button
      type="button"
      className={clsx('dv-tile dv-scene', tone ? 'is-toned' : lit && 'is-on', editing && selected && 'is-selected', hiddenItem && 'is-hidden-item', className)}
      onClick={editing ? onSelect : onRun}
      style={tone ? ({ '--dv-scene-tone': tone } as React.CSSProperties) : undefined}
      disabled={!model.available && !editing}
      aria-pressed={editing ? selected : lit}
      aria-label={editing ? dt('select', { name: model.name }) : dt('sceneRunAria', { name: model.name, status: status || model.name })}
    >
      {tone ? <span className="dv-scene-fill" style={{ transform: `scaleX(${fill.toFixed(3)})` }} aria-hidden="true" /> : null}
      <span className="dv-scene-mark" style={{ background: model.color }} aria-hidden="true">
        {mark ?? <Icon size={19} strokeWidth={2} />}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className={clsx('truncate text-[15px] font-semibold', editing && 'pr-6')}>{model.name}</span>
        {status ? <span className="dv-status !text-xs">{status}</span> : null}
      </span>
      {editing ? (
        <span className={clsx('dv-check', selected && 'is-selected')} aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      ) : null}
    </button>
  );
}

export default SceneCard;
