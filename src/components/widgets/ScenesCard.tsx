import React, { useEffect, useRef, useState } from 'react';
import { mdiCarHatchback } from '@mdi/js';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  BedDouble,
  CheckCircle2,
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
  isEditMode?: boolean;
  runningSceneId?: SceneKey | null;
  runningSceneStartedAt?: number | null;
  onAddScene?: (sceneId: SceneKey) => void;
  onSceneTrigger?: (sceneId: SceneKey) => void;
};

export function ScenesCard({
  title,
  scenes,
  sceneLabels,
  sceneIcons,
  compact = false,
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
  const iconSize = isShortCard ? 14 : isTinyCard || compact ? 15 : 16;
  const titleLabel = title?.trim() || 'Scenari';
  const headerClass = isShortCard
    ? 'mb-1.5 flex items-center justify-between px-3 pt-2'
    : 'mb-3 flex items-center justify-between px-3 pt-3 sm:px-4 sm:pt-4';
  const titleClass = isShortCard
    ? 'text-[0.92rem] font-semibold text-[color:var(--ui-text-secondary)] tracking-tight'
    : 'text-base font-semibold text-[color:var(--ui-text-secondary)] tracking-tight';
  const carouselClass = isShortCard
    ? 'flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pl-3 pr-3 pb-2 snap-x snap-mandatory scroll-pl-3 [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden'
    : 'flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pl-3 pr-4 pb-3 snap-x snap-mandatory scroll-pl-3 [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:px-4 sm:pb-4 sm:scroll-pl-4';
  const tileClass = isShortCard
    ? 'w-[4.15rem] gap-1.5 rounded-[1.15rem] p-2'
    : 'w-[4.75rem] gap-2 rounded-2xl p-2.5';
  const iconShellClass = isShortCard ? 'w-7 h-7' : 'w-8 h-8';
  const labelClass = isShortCard
    ? 'text-[0.76rem] font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)] truncate leading-none'
    : 'text-[0.85rem] font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)] truncate leading-tight';

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
                statusIconSize={Math.max(14, iconSize)}
                tileClass={tileClass}
                iconShellClass={iconShellClass}
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
              className={`widget-action group relative flex shrink-0 snap-start flex-col items-center justify-center border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:bg-[color:var(--ui-fill-secondary)] active:scale-[0.96] transition-all duration-200 cursor-pointer overflow-hidden ${tileClass}`}
            >
              <span className={`relative flex-shrink-0 rounded-full bg-[color:var(--ui-fill-secondary)] flex items-center justify-center overflow-hidden text-[color:var(--ui-text-secondary)] group-hover:text-[color:var(--ui-text-primary)] transition-colors ${iconShellClass}`}>
                <Plus size={iconSize} />
              </span>
              <span className={`w-full min-w-0 text-center ${labelClass}`}>
                {t('card.add')}
              </span>
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
  tileClass,
  iconShellClass,
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
  tileClass: string;
  iconShellClass: string;
  labelClass: string;
  isShortCard: boolean;
  onClick?: () => void;
}) {
  const iconVariants = SCENE_ICON_MOTION_VARIANTS[iconKey] ?? SCENE_ICON_MOTION_VARIANTS.music;
  const tileStyle: React.CSSProperties = {
    '--scene-accent': accentRgb,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 24px rgba(${accentRgb}, 0.055)`,
  } as React.CSSProperties;

  if (isRunning || isCompleting) {
    tileStyle.borderColor = `rgba(${accentRgb}, 0.34)`;
    tileStyle.background = `rgba(${accentRgb}, 0.075)`;
  }
  const hasActiveBorder = ringProgress !== null || isConfirmed;
  const activeBorderProgress = ringProgress !== null ? Math.max(0.08, Math.min(1, ringProgress)) : 1;
  const activeBorderStyle = {
    borderRadius: 'inherit',
    padding: isShortCard ? '1.35px' : '1.75px',
    background: `conic-gradient(from -90deg, rgba(${accentRgb}, 0.95) 0deg ${activeBorderProgress * 360}deg, rgba(${accentRgb}, 0.16) ${activeBorderProgress * 360}deg 360deg)`,
    boxShadow: `0 0 ${isShortCard ? 16 : 22}px rgba(${accentRgb}, 0.18)`,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
  } as React.CSSProperties;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isRunning}
      aria-busy={isRunning}
      whileTap={{ scale: 0.96 }}
      style={tileStyle}
      className={`widget-action group relative flex shrink-0 snap-start flex-col items-center justify-center border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] active:scale-[0.96] transition-all duration-200 cursor-pointer overflow-hidden hover:bg-[color:var(--ui-fill-secondary)] ${tileClass} ${
        isRunning ? 'cursor-wait' : ''
      }`}
    >
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-[rgb(var(--scene-accent))]/18 blur-xl transition-opacity duration-200 group-hover:opacity-90 ${
          isShortCard ? 'top-1.5 h-10 w-10' : 'top-2 h-12 w-12'
        }`}
        aria-hidden="true"
      />
      {hasActiveBorder ? (
        <motion.span
          className="pointer-events-none absolute inset-0"
          style={activeBorderStyle}
          initial={{ opacity: 0 }}
          animate={
            isRunning
              ? { opacity: [0.58, 1, 0.58] }
              : isConfirmed
                ? { opacity: [1, 0.55, 0] }
                : { opacity: 1 }
          }
          transition={
            isRunning
              ? { duration: 1.15, repeat: Infinity, ease: 'easeInOut' }
              : { duration: isConfirmed ? 0.9 : 0.22, ease: 'easeOut' }
          }
        />
      ) : null}

      <span className={`relative flex-shrink-0 rounded-full bg-gradient-to-br ${color} flex items-center justify-center overflow-hidden text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)] ring-1 ring-white/15 transition-transform duration-200 group-hover:scale-105 ${iconShellClass}`}>
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
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-full border border-white/30 bg-white/[0.18] backdrop-blur-md"
            >
              <CheckCircle2 size={statusIconSize} className="text-white drop-shadow-[0_1px_4px_rgba(255,255,255,0.35)]" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={`w-full min-w-0 text-center ${labelClass}`}>
        {label}
      </span>
    </motion.button>
  );
}
