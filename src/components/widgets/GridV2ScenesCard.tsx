import React from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { SceneIconKey, SceneKey } from '../../types/dashboardModels';
import { SceneCard } from '../devices/cards/SceneCard';
import { SCENE_ACTIVE_HOURS, sceneFill, type SceneModel } from '../devices/model/scene';
import { getSceneIconNode, SCENES_CATALOG } from './ScenesCard';
import './gridV2Scenes.css';

/*
 * The scenes section on a Home with the v2 metrics: the strip of pills of a
 * room (SceneCard). The Home runs them through its own actions, and knows only
 * the scene it started: while it runs its pill fills with the colour of its
 * icon, at the pace of the real duration of its last run, and stays full once
 * it is in place. The title gives way when the section is too low to hold it.
 */

export type GridV2ScenesCardProps = {
  title?: string;
  scenes: SceneKey[];
  sceneLabels?: Partial<Record<SceneKey, string>>;
  sceneIcons?: Partial<Record<SceneKey, SceneIconKey>>;
  /** The section keeps a background or a border: the strip takes a margin from it. */
  framed?: boolean;
  isEditMode?: boolean;
  runningSceneId?: SceneKey | null;
  runningSceneStartedAt?: number | null;
  /** Whose durations these are, on this device; without it they are not remembered. */
  durationScope?: string;
  onAddScene?: (sceneId: SceneKey) => void;
  /** Resolves to false when Home Assistant refused the scene. */
  onSceneTrigger?: (sceneId: SceneKey) => void | Promise<boolean | void>;
};

const NO_OPERATION = () => undefined;
const DURATIONS_KEY = 'ha.dashboard.sceneDurations.v1';

function readDurations(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DURATIONS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function expectedDuration(scope: string | undefined, sceneId: SceneKey) {
  if (!scope) return null;
  const value = readDurations()[`${scope}:${sceneId}`];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function rememberDuration(scope: string | undefined, sceneId: SceneKey, duration: number) {
  if (!scope) return;
  try {
    window.localStorage.setItem(DURATIONS_KEY, JSON.stringify({ ...readDurations(), [`${scope}:${sceneId}`]: duration }));
  } catch {
    // Without storage the fill keeps its first-run pace.
  }
}

export default function GridV2ScenesCard({
  title,
  scenes,
  sceneLabels,
  sceneIcons,
  framed = false,
  isEditMode = false,
  runningSceneId = null,
  runningSceneStartedAt = null,
  durationScope,
  onAddScene,
  onSceneTrigger,
}: GridV2ScenesCardProps) {
  const { t } = useI18n();
  const [lastRun, setLastRun] = React.useState<{ id: SceneKey; at: number } | null>(null);
  const [fill, setFill] = React.useState(0);
  const previousRun = React.useRef<{ id: SceneKey; startedAt: number } | null>(null);
  const refused = React.useRef<SceneKey | null>(null);

  React.useEffect(() => {
    const previous = previousRun.current;
    previousRun.current = runningSceneId ? { id: runningSceneId, startedAt: runningSceneStartedAt ?? Date.now() } : null;
    if (!previous || previous.id === runningSceneId) return;
    if (refused.current === previous.id) {
      refused.current = null;
      setLastRun(null);
      return;
    }
    const at = Date.now();
    rememberDuration(durationScope, previous.id, at - previous.startedAt);
    setLastRun({ id: previous.id, at });
  }, [durationScope, runningSceneId, runningSceneStartedAt]);

  React.useEffect(() => {
    if (!runningSceneId) {
      setFill(0);
      return undefined;
    }
    const startedAt = runningSceneStartedAt ?? Date.now();
    const expected = expectedDuration(durationScope, runningSceneId);
    let frame = 0;
    const tick = () => {
      setFill((current) => {
        const next = sceneFill(Date.now() - startedAt, expected);
        return Math.abs(next - current) >= 0.002 ? next : current;
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [durationScope, runningSceneId, runningSceneStartedAt]);

  const run = (sceneId: SceneKey) => {
    refused.current = null;
    setLastRun(null);
    void Promise.resolve(onSceneTrigger?.(sceneId)).then((result) => {
      if (result !== false) return;
      refused.current = sceneId;
      setLastRun(null);
    });
  };

  const activeId = lastRun && !runningSceneId && Date.now() - lastRun.at < SCENE_ACTIVE_HOURS * 3_600_000 ? lastRun.id : null;
  const addable = isEditMode ? SCENES_CATALOG.filter((scene) => !scenes.includes(scene.id)) : [];
  const nameOf = (scene: (typeof SCENES_CATALOG)[number]) => sceneLabels?.[scene.id]?.trim() || scene.label;

  return (
    <div className="dv-scenes" data-framed={framed || undefined}>
      <p className="dv-scenes-title">{title?.trim() || 'Scenari'}</p>
      <div className="dv-scenes-strip">
        {scenes.map((sceneId) => {
          const scene = SCENES_CATALOG.find((item) => item.id === sceneId);
          if (!scene) return null;
          const model: SceneModel = {
            entityId: scene.id,
            name: nameOf(scene),
            icon: 'star',
            color: `rgb(${scene.accentRgb})`,
            entityIds: [],
            ranAt: null,
            available: true,
          };
          const applying = !isEditMode && runningSceneId === scene.id;
          const active = !isEditMode && activeId === scene.id;
          return (
            <SceneCard
              key={scene.id}
              model={model}
              mark={getSceneIconNode(sceneIcons?.[scene.id] ?? scene.defaultIcon, 19)}
              tone={scene.accentRgb.replaceAll(',', ' ')}
              fill={applying ? fill : active ? 1 : 0}
              active={active}
              applying={applying}
              // While editing a touch reaches the section, which selects the whole strip.
              onRun={isEditMode || applying ? NO_OPERATION : () => run(scene.id)}
            />
          );
        })}
        {addable.map((scene) => (
          <button key={scene.id} type="button" className="dv-tile dv-scene dv-scenes-add widget-action" onClick={() => onAddScene?.(scene.id)}>
            <span className="dv-scene-mark" aria-hidden="true">
              <Plus size={19} strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-col gap-px">
              <span className="truncate text-[15px] font-semibold">{nameOf(scene)}</span>
              <span className="dv-status !text-xs">{t('card.add')}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
