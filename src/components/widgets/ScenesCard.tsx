import React, { useEffect, useRef, useState } from 'react';
import { mdiCarHatchback } from '@mdi/js';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  BedDouble,
  Check,
  Coffee,
  Film,
  Home,
  Leaf,
  Moon,
  Music,
  PersonStanding,
  Plus,
  Sparkles,
  Sun,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import type { SceneIconKey, SceneKey } from '../../types/dashboardModels';
import { useCardSize } from './useCardSize';
import { useI18n } from '../../i18n/I18nProvider';

type SceneItem = {
  id: SceneKey;
  label: string;
  color: string;
  accentRgb: string;
  defaultIcon: SceneIconKey;
};

export const SCENES_CATALOG: SceneItem[] = [
  { id: 'music', label: 'Music', color: 'from-pink-500 to-rose-500', accentRgb: '236,72,153', defaultIcon: 'music' },
  { id: 'going-out', label: 'Going out', color: 'from-blue-400 to-blue-600', accentRgb: '96,165,250', defaultIcon: 'person' },
  { id: 'night', label: 'Night', color: 'from-indigo-600 to-blue-900', accentRgb: '79,70,229', defaultIcon: 'moon' },
  { id: 'movie', label: 'Movie', color: 'from-emerald-400 to-green-600', accentRgb: '52,211,153', defaultIcon: 'film' },
  { id: 'sleep', label: 'Sleep', color: 'from-amber-400 to-orange-500', accentRgb: '245,158,11', defaultIcon: 'bed' },
  { id: 'arrive', label: 'Arrive', color: 'from-blue-500 to-indigo-600', accentRgb: '59,130,246', defaultIcon: 'home' },
  { id: 'morning', label: 'Morning', color: 'from-orange-400 to-orange-600', accentRgb: '249,115,22', defaultIcon: 'sun' },
];

export const SCENE_ICON_OPTIONS: Array<{ id: SceneIconKey; label: string }> = [
  { id: 'music', label: 'Musica' },
  { id: 'person', label: 'Persona' },
  { id: 'moon', label: 'Luna' },
  { id: 'film', label: 'Film' },
  { id: 'car', label: 'Auto' },
  { id: 'sun', label: 'Sole' },
  { id: 'home', label: 'Casa' },
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'bed', label: 'Letto' },
  { id: 'coffee', label: 'Caffe' },
  { id: 'tv', label: 'TV' },
  { id: 'leaf', label: 'Foglia' },
];

const SCENE_ICON_COMPONENTS: Record<Exclude<SceneIconKey, 'car'>, LucideIcon> = {
  music: Music,
  person: PersonStanding,
  moon: Moon,
  film: Film,
  sun: Sun,
  home: Home,
  sparkles: Sparkles,
  bed: BedDouble,
  coffee: Coffee,
  tv: Tv,
  leaf: Leaf,
};

function MdiCarHatchbackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path d={mdiCarHatchback} fill="currentColor" />
    </svg>
  );
}

export function getSceneIconNode(iconKey: SceneIconKey, size = 20) {
  if (iconKey === 'car') {
    return <MdiCarHatchbackIcon size={size} />;
  }
  const Icon = SCENE_ICON_COMPONENTS[iconKey] ?? Music;
  return <Icon size={size} />;
}

const SCENE_RUNNING_PROGRESS_TARGET = 0.75;
const SCENE_RUNNING_PROGRESS_MS = 30000;
const SCENE_COMPLETION_PROGRESS_MS = 1500;
const SCENE_MIN_VISIBLE_PROGRESS = 0.03;
// Circumference of the progress ring around a scene button (r = 47 in a 100 box).
const SCENE_RING_LENGTH = 2 * Math.PI * 47;

function createExitVariant(x = 16): Variants['completing'] {
  return {
    x,
    opacity: 0,
    scale: 0.88,
    rotate: 4,
    transition: { duration: 0.42, ease: 'easeIn' },
  };
}

const SCENE_ICON_MOTION_VARIANTS: Record<SceneIconKey, Variants> = {
  music: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -1.5, 0, 1, 0],
      rotate: [0, -6, 6, -4, 0],
      scale: [1, 1.04, 1, 1.03, 1],
      transition: { duration: 0.95, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(15),
  },
  person: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -1, 0, -1, 0],
      x: [0, 0.7, 0, -0.7, 0],
      transition: { duration: 0.55, repeat: Infinity, ease: 'linear' },
    },
    completing: createExitVariant(14),
  },
  moon: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -1.8, 0, -1.1, 0],
      rotate: [0, -3, 2, -2, 0],
      transition: { duration: 1.35, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(14),
  },
  film: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      rotate: [0, -4, 4, -3, 0],
      x: [0, -0.6, 0.6, -0.4, 0],
      transition: { duration: 0.5, repeat: Infinity, ease: 'linear' },
    },
    completing: createExitVariant(15),
  },
  car: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -1.6, 0, 1.4, 0],
      x: [0, -0.7, 0.7, 0],
      transition: { duration: 0.14, repeat: Infinity, ease: 'linear' },
    },
    completing: createExitVariant(18),
  },
  sun: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      rotate: [0, 90, 180, 270, 360],
      scale: [1, 1.03, 1.02, 1.03, 1],
      transition: { duration: 1.9, repeat: Infinity, ease: 'linear' },
    },
    completing: createExitVariant(14),
  },
  home: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -1.2, 0, -0.7, 0],
      scale: [1, 1.025, 1, 1.02, 1],
      transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(14),
  },
  sparkles: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      scale: [1, 1.12, 0.98, 1.1, 1],
      rotate: [0, 6, -4, 8, 0],
      opacity: [1, 0.88, 1, 0.9, 1],
      transition: { duration: 0.85, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(15),
  },
  bed: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -0.6, 0, -0.3, 0],
      scale: [1, 1.03, 1, 1.02, 1],
      transition: { duration: 1.25, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(13),
  },
  coffee: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      y: [0, -1.3, 0, -0.8, 0],
      rotate: [0, -1.5, 1.5, -1, 0],
      transition: { duration: 0.72, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(14),
  },
  tv: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      x: [0, -1, 1, -0.8, 0.8, 0],
      y: [0, 0.3, -0.2, 0.2, 0],
      transition: { duration: 0.34, repeat: Infinity, ease: 'linear' },
    },
    completing: createExitVariant(16),
  },
  leaf: {
    idle: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    running: {
      rotate: [0, -8, 6, -5, 0],
      y: [0, -0.8, 0.6, -0.3, 0],
      transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
    },
    completing: createExitVariant(14),
  },
};

type ScenesCardProps = {
  title?: string;
  scenes: SceneKey[];
  sceneLabels?: Partial<Record<SceneKey, string>>;
  sceneIcons?: Partial<Record<SceneKey, SceneIconKey>>;
  compact?: boolean;
  /** Without its own background: no inner margin, the title lines up with the page. */
  flush?: boolean;
  isEditMode?: boolean;
  runningSceneId?: SceneKey | null;
  runningSceneStartedAt?: number | null;
  onAddScene?: (sceneId: SceneKey) => void;
  onSceneTrigger?: (sceneId: SceneKey) => void | Promise<boolean | void>;
};

export function ScenesCard({
  title,
  scenes,
  sceneLabels,
  sceneIcons,
  compact = false,
  flush = false,
  isEditMode = false,
  runningSceneId = null,
  runningSceneStartedAt = null,
  onAddScene,
  onSceneTrigger,
}: ScenesCardProps) {
  const { t } = useI18n();
  const [runningProgress, setRunningProgress] = useState(0);
  const runningProgressRef = useRef(0);
  const runningAnimationFrameRef = useRef<number | null>(null);
  const previousRunningSceneRef = useRef<SceneKey | null>(null);

  const [completedSceneId, setCompletedSceneId] = useState<SceneKey | null>(null);
  const [completedProgress, setCompletedProgress] = useState(0);
  const completionAnimationFrameRef = useRef<number | null>(null);
  const [confirmedSceneId, setConfirmedSceneId] = useState<SceneKey | null>(null);
  const confirmationHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const previousRunningSceneId = previousRunningSceneRef.current;
    if (previousRunningSceneId && previousRunningSceneId !== runningSceneId) {
      const startProgress = Math.max(
        0,
        Math.min(SCENE_RUNNING_PROGRESS_TARGET, runningProgressRef.current),
      );
      if (completionAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(completionAnimationFrameRef.current);
      }
      if (confirmationHideTimerRef.current !== null) {
        window.clearTimeout(confirmationHideTimerRef.current);
        confirmationHideTimerRef.current = null;
      }
      setConfirmedSceneId(null);
      setCompletedSceneId(previousRunningSceneId);
      setCompletedProgress(startProgress);
      const animationStart = window.performance.now();
      const animateCompletion = (timestamp: number) => {
        const elapsed = Math.max(0, timestamp - animationStart);
        const progress = Math.min(1, elapsed / SCENE_COMPLETION_PROGRESS_MS);
        const easedProgress = 1 - Math.pow(1 - progress, 2);
        const nextProgress = startProgress + (1 - startProgress) * easedProgress;
        setCompletedProgress(nextProgress);
        if (progress < 1) {
          completionAnimationFrameRef.current = window.requestAnimationFrame(animateCompletion);
          return;
        }
        completionAnimationFrameRef.current = null;
        setCompletedSceneId((current) => (current === previousRunningSceneId ? null : current));
        setCompletedProgress(0);
        setConfirmedSceneId(previousRunningSceneId);
        confirmationHideTimerRef.current = window.setTimeout(() => {
          setConfirmedSceneId((current) => (current === previousRunningSceneId ? null : current));
          setCompletedProgress(0);
          confirmationHideTimerRef.current = null;
        }, 1100);
      };
      completionAnimationFrameRef.current = window.requestAnimationFrame(animateCompletion);
    }
    previousRunningSceneRef.current = runningSceneId ?? null;
  }, [runningSceneId]);

  useEffect(() => {
    if (runningAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(runningAnimationFrameRef.current);
      runningAnimationFrameRef.current = null;
    }

    if (!runningSceneId) {
      runningProgressRef.current = 0;
      setRunningProgress(0);
      return;
    }

    const startedAt =
      typeof runningSceneStartedAt === 'number' && Number.isFinite(runningSceneStartedAt)
        ? runningSceneStartedAt
        : Date.now();

    const updateProgress = () => {
      const elapsed = Math.max(0, Date.now() - startedAt);
      const normalized = Math.min(
        SCENE_RUNNING_PROGRESS_TARGET,
        (elapsed / SCENE_RUNNING_PROGRESS_MS) * SCENE_RUNNING_PROGRESS_TARGET,
      );
      const nextProgress = Math.max(SCENE_MIN_VISIBLE_PROGRESS, normalized);
      if (Math.abs(nextProgress - runningProgressRef.current) >= 0.002) {
        runningProgressRef.current = nextProgress;
        setRunningProgress(nextProgress);
      }
      runningAnimationFrameRef.current = window.requestAnimationFrame(updateProgress);
    };

    runningAnimationFrameRef.current = window.requestAnimationFrame(updateProgress);

    return () => {
      if (runningAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(runningAnimationFrameRef.current);
        runningAnimationFrameRef.current = null;
      }
    };
  }, [runningSceneId, runningSceneStartedAt]);

  useEffect(
    () => () => {
      if (runningAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(runningAnimationFrameRef.current);
      }
      if (completionAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(completionAnimationFrameRef.current);
      }
      if (confirmationHideTimerRef.current !== null) {
        window.clearTimeout(confirmationHideTimerRef.current);
      }
    },
    [],
  );

  const {
    ref: cardRef,
    density: cardDensity,
    hasSize: hasCardSize,
    width: cardWidth,
    height: cardHeight,
  } = useCardSize({
    tinyWidth: 280,
    tinyHeight: 160,
    compactWidth: 460,
    compactHeight: 240,
  });

  const selectedScenes = scenes;
  const isTinyCard = hasCardSize && cardDensity === 'tiny';
  const isShortCard = hasCardSize ? cardHeight <= 132 : compact;
  const displayedScenes = selectedScenes;
  const availableScenes = SCENES_CATALOG.filter((scene) => !selectedScenes.includes(scene.id));
  const addSlots = isEditMode ? availableScenes : [];
  // Past the width the buttons need, they widen so that half of the next one
  // shows at the edge: the row visibly scrolls.
  const slotCount = displayedScenes.length + addSlots.length;
  const rowPadding = flush ? 6 : isShortCard ? 8 : 12;
  const rowGap = isShortCard ? 4 : 6;
  const minSlotWidth = isShortCard ? 64 : 76;
  const rowWidth = cardWidth - rowPadding * 2;
  const fittingSlots = Math.max(1, Math.floor((rowWidth + rowGap) / (minSlotWidth + rowGap)));
  const fullSlots = Math.max(1, fittingSlots - 1);
  const peekSlotStyle: React.CSSProperties | undefined = hasCardSize && slotCount > fittingSlots
    ? { flex: `0 0 ${(rowWidth - fullSlots * rowGap) / (fullSlots + 0.5)}px` }
    : undefined;
  // The round buttons grow with the card height, leaving room for the title and the names.
  const shellSize = hasCardSize
    ? Math.round(Math.max(40, Math.min(64, cardHeight - (isShortCard ? 72 : 104))))
    : isShortCard || isTinyCard || compact ? 44 : 56;
  const iconSize = Math.round(shellSize * 0.4);
  const titleLabel = title?.trim() || 'Scenari';
  const headerClass = flush
    ? isShortCard
      ? 'mb-1 flex items-center justify-between'
      : 'mb-2 flex items-center justify-between'
    : isShortCard
      ? 'mb-1 flex items-center justify-between px-3 pt-2'
      : 'mb-2 flex items-center justify-between px-3 pt-3 sm:px-4 sm:pt-4';
  // The rings around the buttons still need a few pixels on the sides.
  const rowPaddingClass = flush ? 'px-1.5' : isShortCard ? 'px-2' : 'px-3';
  const rowScrollPaddingClass = flush ? 'scroll-px-1.5' : isShortCard ? 'scroll-px-2' : 'scroll-px-3';
  const titleClass = isShortCard
    ? 'text-[0.92rem] font-semibold text-[color:var(--ui-text-secondary)] tracking-tight'
    : 'text-base font-semibold text-[color:var(--ui-text-secondary)] tracking-tight';
  // Round buttons share the width; past their minimum they scroll sideways.
  const carouselClass = isShortCard
    ? `flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain ${rowPaddingClass} pb-2 snap-x snap-mandatory ${rowScrollPaddingClass} [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden`
    : `flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain ${rowPaddingClass} pb-3 snap-x snap-mandatory ${rowScrollPaddingClass} [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:pb-4`;
  const tileClass = isShortCard ? 'min-w-[4rem] gap-1.5 pt-1.5' : 'min-w-[4.75rem] gap-2 pt-2';
  const labelClass = isShortCard
    ? 'text-[0.72rem] font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)] leading-[1.25] pb-px'
    : 'text-[0.8rem] font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)] leading-[1.25] pb-px';

  return (
    <div
      ref={cardRef}
      className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <div className={headerClass}>
        <p className={titleClass}>{titleLabel}</p>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className={carouselClass}>
          {displayedScenes.map((sceneId) => {
            const scene = SCENES_CATALOG.find((item) => item.id === sceneId);
            if (!scene) {
              return null;
            }
            const configuredLabel = sceneLabels?.[scene.id]?.trim();
            const displayLabel = configuredLabel && configuredLabel.length > 0 ? configuredLabel : scene.label;
            const iconKey = sceneIcons?.[scene.id] ?? scene.defaultIcon;
            const isRunning = !isEditMode && runningSceneId === scene.id;
            const isCompleting = !isEditMode && !isRunning && completedSceneId === scene.id;
            const isConfirmed = !isEditMode && !isRunning && confirmedSceneId === scene.id;
            const ringProgress = isRunning ? runningProgress : isCompleting ? completedProgress : null;
            return (
              <SceneButton
                key={scene.id}
                icon={getSceneIconNode(iconKey, iconSize)}
                label={displayLabel}
                color={scene.color}
                accentRgb={scene.accentRgb}
                iconKey={iconKey}
                isRunning={isRunning}
                isCompleting={isCompleting}
                isConfirmed={isConfirmed}
                ringProgress={ringProgress}
                statusIconSize={iconSize}
                statusLabel={isRunning ? t('home.scene.running') : isConfirmed ? t('home.scene.done') : ''}
                tileClass={tileClass}
                shellSize={shellSize}
                slotStyle={peekSlotStyle}
                labelClass={labelClass}
                isShortCard={isShortCard}
                onClick={() => {
                  if (isEditMode || isRunning) {
                    return;
                  }
                  onSceneTrigger?.(scene.id);
                }}
              />
            );
          })}
          {addSlots.map((scene) => (
            <button
              key={`add-${scene.id}`}
              type="button"
              onClick={() => onAddScene?.(scene.id)}
              style={peekSlotStyle}
              className={`widget-action group relative flex min-w-0 flex-1 shrink-0 basis-0 snap-start flex-col items-center ${tileClass}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-secondary)] transition-colors group-hover:bg-[color:var(--ui-fill-tertiary)] group-hover:text-[color:var(--ui-text-primary)]`} style={{ width: shellSize, height: shellSize }}>
                <Plus size={iconSize} />
              </span>
              <span className={`w-full min-w-0 truncate text-center ${labelClass}`}>
                {t('card.add')}
              </span>
              {!isShortCard ? <span className="min-h-[0.85rem]" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneButton({
  icon,
  label,
  color,
  accentRgb,
  iconKey,
  isRunning,
  isCompleting,
  isConfirmed,
  ringProgress,
  statusIconSize,
  statusLabel,
  tileClass,
  shellSize,
  slotStyle,
  labelClass,
  isShortCard,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  accentRgb: string;
  iconKey: SceneIconKey;
  isRunning: boolean;
  isCompleting: boolean;
  isConfirmed: boolean;
  ringProgress: number | null;
  statusIconSize: number;
  statusLabel: string;
  tileClass: string;
  shellSize: number;
  slotStyle?: React.CSSProperties;
  labelClass: string;
  isShortCard: boolean;
  onClick?: () => void;
}) {
  const iconVariants = SCENE_ICON_MOTION_VARIANTS[iconKey] ?? SCENE_ICON_MOTION_VARIANTS.music;
  // A round button, as in Control Center: tinted at rest, filled while the scene runs.
  const isActive = isRunning || isCompleting || isConfirmed;
  const showRing = ringProgress !== null || isConfirmed;
  const progress = ringProgress !== null ? Math.max(0.04, Math.min(1, ringProgress)) : 1;
  const style = { ...slotStyle, '--scene-accent': accentRgb } as React.CSSProperties;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isRunning}
      aria-busy={isRunning}
      whileTap={{ scale: 0.94 }}
      style={style}
      className={`widget-action group relative flex min-w-0 flex-1 shrink-0 basis-0 snap-start flex-col items-center cursor-pointer disabled:cursor-wait ${tileClass}`}
    >
      <span
        className={`relative flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-300 group-hover:scale-[1.04] ${
          isActive
            ? `bg-gradient-to-br ${color} text-white shadow-[0_10px_24px_-8px_rgba(var(--scene-accent),0.75)]`
            : 'bg-[rgba(var(--scene-accent),0.16)] text-[color:color-mix(in_srgb,rgb(var(--scene-accent))_78%,var(--ui-text-primary))] ring-1 ring-inset ring-[rgba(var(--scene-accent),0.3)]'
        }`}
        style={{ width: shellSize, height: shellSize }}
      >
        {showRing ? (
          <motion.svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="pointer-events-none absolute -inset-[5px] h-[calc(100%+10px)] w-[calc(100%+10px)] -rotate-90"
            initial={{ opacity: 0 }}
            animate={{ opacity: isConfirmed ? [1, 0] : 1 }}
            transition={{ duration: isConfirmed ? 0.9 : 0.2, ease: 'easeOut' }}
          >
            <circle cx="50" cy="50" r="47" fill="none" stroke={`rgba(${accentRgb}, 0.22)`} strokeWidth="3.5" />
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke={`rgb(${accentRgb})`}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={SCENE_RING_LENGTH}
              strokeDashoffset={SCENE_RING_LENGTH * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-150 ease-linear"
            />
          </motion.svg>
        ) : null}
        <motion.span
          className="flex items-center justify-center leading-none"
          variants={iconVariants}
          initial="idle"
          animate={isRunning ? 'running' : isCompleting ? 'completing' : 'idle'}
        >
          {icon}
        </motion.span>
        <AnimatePresence>
          {isConfirmed && (
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.3, type: 'spring', bounce: 0.4 }}
              className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-full bg-gradient-to-br ${color} text-white`}
            >
              <Check size={statusIconSize} strokeWidth={2.6} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={`w-full min-w-0 truncate text-center ${labelClass}`}>
        {label}
      </span>
      {!isShortCard ? (
        <span
          className={`min-h-[0.85rem] text-[0.68rem] font-medium leading-none ${
            isConfirmed
              ? 'text-[color:color-mix(in_srgb,rgb(var(--scene-accent))_78%,var(--ui-text-primary))]'
              : 'text-[color:var(--ui-text-secondary)]'
          }`}
        >
          {statusLabel}
        </span>
      ) : null}
    </motion.button>
  );
}
