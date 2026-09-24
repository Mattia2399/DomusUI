import {
  AnimatePresence,
  interpolate,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DemoCard, type CardSpan } from '../demo/DemoCard';
import type { DemoCardId } from '../demo/fixtures';
import { useIsWide } from '../hooks/useMediaQuery';
import { useSceneProgress } from '../hooks/useSceneProgress';
import { DURATION, EASE_OUT, SECTION_IDS } from '../tokens';

/**
 * CARDS — "component storytelling".
 *
 * The assembled dashboard from the hero comes apart in space; a virtual
 * camera flies to one card family at a time and the copy explains it; then
 * the board recomposes. Everything is transform/opacity only: positions are
 * measured once (offsets are transform-independent) and every frame is
 * sampled from precomputed keyframes.
 */

type Cell = { id: DemoCardId; col: number; row: number; span: CardSpan };

const BOARD_WIDTH = 1000;
const CELLS: Cell[] = [
  { id: 'climate', col: 1, row: 1, span: { w: 3, h: 3 } },
  { id: 'alarm', col: 4, row: 1, span: { w: 3, h: 3 } },
  { id: 'light', col: 7, row: 1, span: { w: 2, h: 2 } },
  { id: 'switch', col: 7, row: 3, span: { w: 2, h: 1 } },
  { id: 'sensor', col: 9, row: 1, span: { w: 2, h: 3 } },
  { id: 'lock', col: 11, row: 1, span: { w: 2, h: 3 } },
  { id: 'camera', col: 1, row: 4, span: { w: 4, h: 3 } },
  { id: 'media', col: 5, row: 4, span: { w: 2, h: 3 } },
  { id: 'cover', col: 7, row: 4, span: { w: 2, h: 3 } },
  { id: 'vacuum', col: 9, row: 4, span: { w: 4, h: 3 } },
];

const FOCUS: { id: DemoCardId; family: string; copy: string; traits: string[] }[] = [
  {
    id: 'climate',
    family: 'Clima',
    copy: 'Temperatura, modalità, ventola e preset. La card mostra solo ciò che il tuo climatizzatore espone davvero.',
    traits: ['hvac_mode', 'fan_mode', 'preset', 'swing'],
  },
  {
    id: 'light',
    family: 'Luci',
    copy: 'Luminosità, colore e temperatura colore. Accesa si espande, spenta si compatta da sola.',
    traits: ['brightness', 'hs_color', 'color_temp'],
  },
  {
    id: 'alarm',
    family: 'Sicurezza',
    copy: 'Allarme e serrature chiedono una conferma sul dispositivo. Home Assistant resta l’autorità finale.',
    traits: ['PIN', 'WebAuthn', 'HA auth'],
  },
  {
    id: 'media',
    family: 'Media',
    copy: 'Copertina, avanzamento, sorgenti e gruppi, quando il player li supporta.',
    traits: ['seek', 'source', 'group'],
  },
  {
    id: 'camera',
    family: 'Telecamere',
    copy: 'Snapshot e stream dalle telecamere di Home Assistant, con joystick PTZ dove disponibile.',
    traits: ['stream', 'snapshot', 'PTZ'],
  },
];

const FAMILIES = [
  'Sensor',
  'Light',
  'Switch',
  'Fan',
  'Humidifier',
  'Climate',
  'Alarm',
  'Lock',
  'Cover',
  'Camera',
  'Media Player',
  'Vacuum',
  'Calendar',
  'Members',
];

// Timeline (scroll progress of the pinned track).
const T_FLAT = 0.06;
const T_EXPLODED = 0.14;
const T_FOCUS_START = 0.16;
const T_FOCUS_END = 0.84;
const T_OVERVIEW = 0.9;
const T_RECOMPOSED = 0.97;
const SEGMENT = (T_FOCUS_END - T_FOCUS_START) / FOCUS.length;
const SPREAD = 0.2;
const DIM = 0.07;

type Geometry = {
  centers: Record<string, { x: number; y: number; w: number; h: number }>;
  stageW: number;
  stageH: number;
  wide: boolean;
  still: boolean;
};

type Timeline = {
  centers: Geometry['centers'];
  scale: (v: number) => number;
  x: (v: number) => number;
  y: (v: number) => number;
  spread: (v: number) => number;
  opacity: Record<string, (v: number) => number>;
};

function buildTimeline(geo: Geometry): Timeline {
  const { stageW, stageH, wide, still } = geo;
  const boardH = 6 * 48 + 5 * 16;
  if (still) return buildStillTimeline(geo, boardH);
  const overview = Math.min(1, (stageW * (wide ? 0.82 : 0.94)) / BOARD_WIDTH, (stageH * 0.56) / boardH);
  const exploded = overview * 0.86;
  // Focal point: left third on desktop, upper half on phones.
  const fx = wide ? -stageW * 0.2 : 0;
  const fy = wide ? stageH * 0.03 : -stageH * 0.14;

  const times: number[] = [0, T_FLAT, T_EXPLODED];
  const scale: number[] = [overview, overview, exploded];
  const x: number[] = [0, 0, 0];
  const y: number[] = [0, 0, 0];
  const spread: number[] = [0, 0, SPREAD];
  const focusIndex: number[] = [-1, -1, -1];

  FOCUS.forEach((focus, index) => {
    const c = geo.centers[focus.id];
    if (!c) return;
    const target = Math.min(
      wide ? (stageW * 0.36) / c.w : (stageW * 0.84) / c.w,
      wide ? (stageH * 0.52) / c.h : (stageH * 0.4) / c.h,
      2.4,
    );
    const start = T_FOCUS_START + index * SEGMENT;
    const tx = fx - target * c.x * (1 + SPREAD);
    const ty = fy - target * c.y * (1 + SPREAD);
    times.push(start + SEGMENT * 0.38, start + SEGMENT * 0.82);
    scale.push(target, target);
    x.push(tx, tx);
    y.push(ty, ty);
    spread.push(SPREAD, SPREAD);
    focusIndex.push(index, index);
  });

  times.push(T_OVERVIEW, T_RECOMPOSED, 1);
  scale.push(exploded, overview, overview);
  x.push(0, 0, 0);
  y.push(0, 0, 0);
  spread.push(SPREAD, 0, 0);
  focusIndex.push(-1, -1, -1);

  const opacity: Record<string, (v: number) => number> = {};
  CELLS.forEach((cell) => {
    const focusSlot = FOCUS.findIndex((focus) => focus.id === cell.id);
    const values = focusIndex.map((slot) => (slot === -1 || slot === focusSlot ? 1 : DIM));
    opacity[cell.id] = interpolate(times, values);
  });

  return {
    centers: geo.centers,
    scale: interpolate(times, scale),
    x: interpolate(times, x),
    y: interpolate(times, y),
    spread: interpolate(times, spread),
    opacity,
  };
}

/** Reduced motion: the board stays put beside the copy; only the focus (opacity) changes. */
function buildStillTimeline(geo: Geometry, boardH: number): Timeline {
  const { stageW, stageH, wide } = geo;
  const scale = Math.min(1, (stageW * (wide ? 0.56 : 0.94)) / BOARD_WIDTH, (stageH * (wide ? 0.6 : 0.4)) / boardH);
  const x = wide ? -stageW * 0.2 : 0;
  const y = wide ? 0 : -stageH * 0.16;
  const times = [0, T_FOCUS_START];
  const slots = [-1, -1];
  FOCUS.forEach((_, index) => {
    const start = T_FOCUS_START + index * SEGMENT;
    times.push(start + SEGMENT * 0.2, start + SEGMENT * 0.9);
    slots.push(index, index);
  });
  times.push(T_OVERVIEW, 1);
  slots.push(-1, -1);
  const opacity: Record<string, (v: number) => number> = {};
  CELLS.forEach((cell) => {
    const focusSlot = FOCUS.findIndex((focus) => focus.id === cell.id);
    opacity[cell.id] = interpolate(
      times,
      slots.map((slot) => (slot === -1 || slot === focusSlot ? 1 : 0.25)),
    );
  });
  return { centers: geo.centers, scale: () => scale, x: () => x, y: () => y, spread: () => 0, opacity };
}

const IDENTITY: Timeline = {
  centers: {},
  scale: () => 1,
  x: () => 0,
  y: () => 0,
  spread: () => 0,
  opacity: {},
};

function ExplodedCell({
  cell,
  progress,
  timeline,
}: {
  cell: Cell;
  progress: MotionValue<number>;
  timeline: { current: Timeline };
}) {
  // Read geometry through the ref so a re-measure never needs a re-render.
  const x = useTransform(progress, (v) => (timeline.current.centers[cell.id]?.x ?? 0) * timeline.current.spread(v));
  const y = useTransform(progress, (v) => (timeline.current.centers[cell.id]?.y ?? 0) * timeline.current.spread(v));
  const opacity = useTransform(progress, (v) => timeline.current.opacity[cell.id]?.(v) ?? 1);
  return (
    <motion.div
      data-cell={cell.id}
      className="s-board-cell"
      style={{
        gridColumn: `${cell.col} / span ${cell.span.w}`,
        gridRow: `${cell.row} / span ${cell.span.h}`,
        x,
        y,
        opacity,
      }}
    >
      <DemoCard id={cell.id} span={cell.span} breakpoint="xl" />
    </motion.div>
  );
}

export function CardsSection() {
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const wide = useIsWide();
  const reduceMotion = useReducedMotion() ?? false;
  const progress = useSceneProgress(trackRef);
  const timeline = useRef<Timeline>(IDENTITY);
  const [focus, setFocus] = useState(-1);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    const grid = gridRef.current;
    if (!stage || !grid) return;
    const next: Geometry['centers'] = {};
    grid.querySelectorAll<HTMLElement>('[data-cell]').forEach((element) => {
      next[element.dataset.cell as string] = {
        x: element.offsetLeft + element.offsetWidth / 2 - grid.offsetWidth / 2,
        y: element.offsetTop + element.offsetHeight / 2 - grid.offsetHeight / 2,
        w: element.offsetWidth,
        h: element.offsetHeight,
      };
    });
    timeline.current = buildTimeline({
      centers: next,
      stageW: stage.clientWidth,
      stageH: stage.clientHeight,
      wide,
      still: reduceMotion,
    });
  }, [wide, reduceMotion]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [measure]);

  useMotionValueEvent(progress, 'change', (v) => {
    const index =
      v >= T_FOCUS_START + SEGMENT * 0.2 && v < T_FOCUS_END
        ? Math.min(FOCUS.length - 1, Math.floor((v - T_FOCUS_START - SEGMENT * 0.2) / SEGMENT + 0.2))
        : v >= T_FOCUS_END
          ? FOCUS.length
          : -1;
    setFocus((current) => (current === index ? current : index));
  });

  const boardScale = useTransform(progress, (v) => timeline.current.scale(v));
  const boardX = useTransform(progress, (v) => timeline.current.x(v));
  const boardY = useTransform(progress, (v) => timeline.current.y(v));
  const tilt = useTransform(progress, [0, T_FLAT], [reduceMotion ? 0 : 22, 0]);
  const panelOpacity = useTransform(progress, [T_FLAT, T_EXPLODED, T_OVERVIEW, T_RECOMPOSED], [1, 0, 0, 1]);
  const introOpacity = useTransform(progress, [0, T_FLAT, T_EXPLODED], [1, 1, 0]);
  const scrimOpacity = useTransform(
    progress,
    [T_EXPLODED, T_FOCUS_START + SEGMENT * 0.3, T_FOCUS_END, T_OVERVIEW],
    [0, 1, 1, 0],
  );

  const active = focus >= 0 && focus < FOCUS.length ? FOCUS[focus] : null;

  return (
    <section
      ref={trackRef}
      id={SECTION_IDS.cards}
      aria-labelledby="cards-title"
      className="s-track"
      style={{ height: wide ? '640vh' : '560vh' }}
    >
      <div ref={stageRef} className="s-stage">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_55%_at_30%_55%,rgb(23_104_213/0.12),transparent_70%)]"
        />

        {/* Intro headline over the tilted board. */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-[calc(var(--s-nav-h)+2vh)] z-10 text-center"
          style={{ opacity: introOpacity }}
        >
          <p className="s-label mb-4">03 — Card</p>
          <h2 id="cards-title" className="s-title mx-auto max-w-4xl px-6 text-white">
            Ogni card, <span className="s-mute">un dispositivo.</span>
          </h2>
        </motion.div>

        {/* Board */}
        <div className="absolute inset-0 flex items-center justify-center [perspective:1600px]">
          <motion.div
            style={{ width: BOARD_WIDTH, scale: boardScale, x: boardX, y: boardY, rotateX: tilt }}
            className="relative shrink-0"
          >
            <motion.div
              aria-hidden
              className="s-panel absolute -inset-5 rounded-[2rem]"
              style={{ opacity: panelOpacity }}
            />
            <div
              ref={gridRef}
              className="s-board-grid relative"
              style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
            >
              {CELLS.map((cell) => (
                <ExplodedCell key={cell.id} cell={cell} progress={progress} timeline={timeline} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Scrim keeps the focus copy legible over the dimmed board. */}
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute z-[5] ${
            wide
              ? 'inset-y-0 right-0 w-[48vw] bg-[linear-gradient(90deg,transparent,rgb(3_5_10/0.86)_38%)]'
              : 'inset-x-0 bottom-0 h-[52vh] bg-[linear-gradient(180deg,transparent,rgb(3_5_10/0.92)_45%)]'
          }`}
          style={{ opacity: scrimOpacity }}
        />

        {/* Focus copy */}
        <div
          className={`pointer-events-none absolute z-10 ${
            wide
              ? 'right-[max(var(--s-gutter),calc((100vw-var(--s-container))/2+var(--s-gutter)))] top-1/2 w-[min(34vw,27rem)] -translate-y-1/2'
              : 'inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] px-[var(--s-gutter)]'
          }`}
          aria-live="polite"
        >
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
              >
                <p className="s-label mb-4">
                  {String(focus + 1).padStart(2, '0')} / {String(FOCUS.length).padStart(2, '0')}
                </p>
                <h3 className="s-display text-white">{active.family}</h3>
                <p className="s-lead mt-5">{active.copy}</p>
                <ul className="mt-6 flex flex-wrap gap-2">
                  {active.traits.map((trait) => (
                    <li key={trait} className="s-chip">
                      {trait}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Closing line under the recomposed board. */}
        <AnimatePresence>
          {focus === FOCUS.length ? (
            <motion.div
              key="families"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
              className="pointer-events-none absolute inset-x-0 bottom-[max(2.5rem,6vh)] z-10 px-[var(--s-gutter)] text-center"
            >
              <p className="s-subtitle text-white">
                14 famiglie. <span className="s-mute">Un solo linguaggio.</span>
              </p>
              <p className="mx-auto mt-3 max-w-3xl text-[0.8rem] leading-relaxed text-white/40">
                {FAMILIES.join(' · ')}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
