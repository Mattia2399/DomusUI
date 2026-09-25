import {
  cubicBezier,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DemoCard, type CardSpan } from '../demo/DemoCard';
import type { DemoCardId } from '../demo/fixtures';
import { useFinePointer, useIsWide } from '../hooks/useMediaQuery';
import { useSceneProgress } from '../hooks/useSceneProgress';
import { AttentionBanner, BottomBar, Greeting, SideRail } from '../ui/BoardChrome';
import { CtaLink } from '../ui/CtaLink';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import { SplitReveal } from '../ui/SplitReveal';
import { APP_VERSION, DURATION, EASE_OUT, SECTION_IDS, SITE_LINKS } from '../tokens';

/**
 * HERO — "the home assembles itself".
 *
 * Real cards float in depth around the wordmark. Scrolling pulls them into
 * the production grid (48px rows, 16px gaps) and the Domus UI shell fades in
 * around them. The assembled dashboard stays pinned while the manifesto
 * curtain slides over it.
 */

type Scatter = { x: number; y: number; r: number; s: number; depth: number };
type HeroCell = { id: DemoCardId; col: number; row: number; span: CardSpan; scatter: Scatter };

// 12-column xl board — same geometry as a real desktop dashboard.
const WIDE_CELLS: HeroCell[] = [
  // Top row orbits the wordmark…
  { id: 'alarm', col: 4, row: 1, span: { w: 3, h: 3 }, scatter: { x: -20, y: -31, r: -4, s: 0.82, depth: 18 } },
  { id: 'light', col: 7, row: 1, span: { w: 2, h: 2 }, scatter: { x: 10, y: -30, r: 5, s: 1.04, depth: 40 } },
  { id: 'sensor', col: 9, row: 1, span: { w: 2, h: 3 }, scatter: { x: 21, y: -13, r: -5, s: 0.86, depth: 24 } },
  { id: 'climate', col: 1, row: 1, span: { w: 3, h: 3 }, scatter: { x: -6, y: 12, r: -5, s: 0.94, depth: 34 } },
  { id: 'switch', col: 7, row: 3, span: { w: 2, h: 1 }, scatter: { x: 15, y: 5, r: -3, s: 0.92, depth: 20 } },
  { id: 'lock', col: 11, row: 1, span: { w: 2, h: 3 }, scatter: { x: 5, y: 20, r: 6, s: 0.96, depth: 46 } },
  // …the bottom row rises from below the fold as the scroll begins.
  { id: 'camera', col: 1, row: 4, span: { w: 4, h: 3 }, scatter: { x: -8, y: 50, r: 3, s: 0.94, depth: 28 } },
  { id: 'media', col: 5, row: 4, span: { w: 2, h: 3 }, scatter: { x: -2, y: 60, r: -5, s: 1.04, depth: 52 } },
  { id: 'cover', col: 7, row: 4, span: { w: 2, h: 3 }, scatter: { x: 4, y: 55, r: 4, s: 0.9, depth: 16 } },
  { id: 'vacuum', col: 9, row: 4, span: { w: 4, h: 3 }, scatter: { x: 8, y: 48, r: -3, s: 0.92, depth: 30 } },
];

// 2-column xs board — the phone layout of the same home.
const NARROW_CELLS: HeroCell[] = [
  // On phones the cards wait below the fold and rise into the grid, keeping the wordmark clean.
  { id: 'climate', col: 1, row: 1, span: { w: 2, h: 3 }, scatter: { x: -6, y: 78, r: -5, s: 0.92, depth: 0 } },
  { id: 'light', col: 1, row: 4, span: { w: 1, h: 2 }, scatter: { x: -10, y: 82, r: -7, s: 0.9, depth: 0 } },
  { id: 'lock', col: 2, row: 4, span: { w: 1, h: 2 }, scatter: { x: 10, y: 88, r: 7, s: 0.9, depth: 0 } },
  { id: 'media', col: 1, row: 6, span: { w: 2, h: 3 }, scatter: { x: 0, y: 100, r: 3, s: 0.92, depth: 0 } },
];

const ASSEMBLE_END = 0.4;
const assembleEase = cubicBezier(0.33, 0, 0.12, 1);

function usePointerField(enabled: boolean) {
  const x = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  useEffect(() => {
    if (!enabled) return;
    const onMove = (event: PointerEvent) => {
      x.set(event.clientX / window.innerWidth - 0.5);
      y.set(event.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [enabled, x, y]);
  return { x, y };
}

function FloatingCell({
  cell,
  progress,
  pointer,
  breakpoint,
  still,
}: {
  cell: HeroCell;
  progress: MotionValue<number>;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  breakpoint: 'xl' | 'xs';
  still: boolean;
}) {
  const { scatter } = cell;
  const range = [0, ASSEMBLE_END];
  const options = { clamp: true, ease: assembleEase };
  const spread = useTransform(progress, range, [1, 0], options);

  const x = useTransform([spread, pointer.x], ([k, px]: number[]) =>
    still ? '0vw' : `${scatter.x * k + px * scatter.depth * 0.12 * k}vw`,
  );
  const y = useTransform([spread, pointer.y], ([k, py]: number[]) =>
    still ? '0vh' : `${scatter.y * k + py * scatter.depth * 0.14 * k}vh`,
  );
  const rotate = useTransform(spread, (k) => (still ? 0 : scatter.r * k));
  const scale = useTransform(spread, (k) => (still ? 1 : 1 + (scatter.s - 1) * k));
  // Reduced motion: no flight, the assembled board simply fades in behind the receding wordmark.
  const opacity = useTransform(progress, [ASSEMBLE_END * 0.3, ASSEMBLE_END * 0.8], still ? [0, 1] : [1, 1]);

  return (
    <motion.div
      className="s-board-cell"
      style={{
        gridColumn: `${cell.col} / span ${cell.span.w}`,
        gridRow: `${cell.row} / span ${cell.span.h}`,
        x,
        y,
        rotate,
        scale,
        opacity,
        zIndex: Math.round(scatter.depth),
      }}
    >
      <motion.div
        className="h-full w-full"
        initial={still ? false : { opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.cinematic, ease: EASE_OUT, delay: 0.35 + scatter.depth / 160 }}
      >
        <DemoCard id={cell.id} span={cell.span} breakpoint={breakpoint} />
      </motion.div>
    </motion.div>
  );
}

export function HeroSection() {
  const { hero } = useSiteCopy();
  const trackRef = useRef<HTMLElement>(null);
  const wide = useIsWide();
  const finePointer = useFinePointer();
  const reduceMotion = useReducedMotion() ?? false;
  const progress = useSceneProgress(trackRef);
  const pointer = usePointerField(finePointer && wide && !reduceMotion);

  const cells = wide ? WIDE_CELLS : NARROW_CELLS;
  const breakpoint = wide ? 'xl' : 'xs';

  // Wordmark recedes as the dashboard assembles in front of it.
  const markScale = useTransform(progress, [0, ASSEMBLE_END], [1, 0.86]);
  const markOpacity = useTransform(progress, [0, ASSEMBLE_END * 0.8], [1, 0.08]);
  const markY = useTransform(progress, [0, ASSEMBLE_END], ['0vh', '-14vh']);
  // Copy exits first so the cards own the stage.
  const copyOpacity = useTransform(progress, [0, 0.12], [1, 0]);
  const copyY = useTransform(progress, [0, 0.12], [0, -40]);
  // Shell (panel, rail, greeting) materialises around the settling cards.
  const shellOpacity = useTransform(progress, [ASSEMBLE_END * 0.55, ASSEMBLE_END], [0, 1]);
  // Once the curtain starts to cover, the board sinks back into the dark.
  const boardScale = useTransform(progress, [0.45, 1], [1, 0.9]);
  const boardOpacity = useTransform(progress, [0.55, 1], [1, 0.25]);
  const glowOpacity = useTransform(progress, [0, ASSEMBLE_END, 1], [0.9, 1, 0.3]);

  return (
    <section
      ref={trackRef}
      id={SECTION_IDS.top}
      aria-labelledby="hero-title"
      className="s-track"
      style={{ height: wide ? '280vh' : '220vh' }}
    >
      <div className="s-stage s-grain">
        {/* Ambient light from the brand gradient. */}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: glowOpacity }}>
          <div className="absolute left-1/2 top-[-30%] h-[120vh] w-[140vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(23_104_213/0.42),rgb(10_36_87/0.2)_45%,transparent_75%)]" />
          <div className="absolute bottom-[-40%] left-[8%] h-[80vh] w-[60vw] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_154_77/0.1),transparent_70%)]" />
        </motion.div>
        <div aria-hidden className="s-gridlines" />

        {/* Wordmark */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center md:top-[26%]"
          style={{ scale: markScale, opacity: markOpacity, y: markY }}
        >
          <SplitReveal
            as="h1"
            id="hero-title"
            className="s-mega s-gradient-ink whitespace-nowrap text-center"
            lines={['Domus UI']}
            trigger="mount"
            delay={0.1}
            stagger={0.12}
          />
        </motion.div>

        {/* Live board */}
        <motion.div
          className="absolute inset-x-0 top-[calc(var(--s-nav-h)+1.5rem)] bottom-6 flex items-center justify-center px-[var(--s-gutter)]"
          style={{ scale: boardScale, opacity: boardOpacity }}
        >
          <div className="relative w-full" style={{ maxWidth: wide ? 1180 : 420 }}>
            <motion.div
              aria-hidden
              className="s-panel absolute -inset-3 rounded-[2.2rem] md:-inset-5"
              style={{ opacity: shellOpacity }}
            />
            <div className="relative">
              {wide ? (
                <div className="flex gap-4">
                  <motion.div className="flex" style={{ opacity: shellOpacity }}>
                    <SideRail />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <motion.div className="mb-5 space-y-5" style={{ opacity: shellOpacity }}>
                      <AttentionBanner />
                      <Greeting />
                    </motion.div>
                    <HeroGrid
                      cells={cells}
                      progress={progress}
                      pointer={pointer}
                      breakpoint={breakpoint}
                      still={reduceMotion}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <motion.div className="mb-4" style={{ opacity: shellOpacity }}>
                    <Greeting compact />
                  </motion.div>
                  <HeroGrid
                    cells={cells}
                    progress={progress}
                    pointer={pointer}
                    breakpoint={breakpoint}
                    still={reduceMotion}
                  />
                  <motion.div className="mt-4" style={{ opacity: shellOpacity }}>
                    <BottomBar />
                  </motion.div>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Copy */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[60]"
          style={{ opacity: copyOpacity, y: copyY }}
        >
          <div className="s-container flex flex-col gap-8 pb-8 md:flex-row md:items-end md:justify-between md:pb-12">
            <motion.div
              className="max-w-xl"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.9 }}
            >
              <p className="s-label mb-4">
                {hero.eyebrow}
                {APP_VERSION ? ` · v${APP_VERSION}` : ''}
              </p>
              <p className="s-subtitle text-white">{hero.tagline}</p>
              <p className="s-lead mt-3 max-w-md">{hero.lead}</p>
            </motion.div>
            <motion.div
              className="pointer-events-auto flex flex-wrap items-center gap-3"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 1.05 }}
            >
              <CtaLink href={SITE_LINKS.hacs}>{hero.install}</CtaLink>
              <CtaLink href={SITE_LINKS.repository} variant="ghost">
                {hero.github}
              </CtaLink>
              <span className="ml-3 hidden items-center gap-3 lg:flex" aria-hidden>
                <span className="s-scroll-cue" />
                <ArrowDown className="h-3.5 w-3.5 text-white/40" />
              </span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HeroGrid({
  cells,
  progress,
  pointer,
  breakpoint,
  still,
}: {
  cells: HeroCell[];
  progress: MotionValue<number>;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  breakpoint: 'xl' | 'xs';
  still: boolean;
}) {
  return (
    <div
      className="s-board-grid"
      style={{ gridTemplateColumns: `repeat(${breakpoint === 'xl' ? 12 : 2}, minmax(0, 1fr))` }}
    >
      {cells.map((cell) => (
        <FloatingCell
          key={cell.id}
          cell={cell}
          progress={progress}
          pointer={pointer}
          breakpoint={breakpoint}
          still={still}
        />
      ))}
    </div>
  );
}
