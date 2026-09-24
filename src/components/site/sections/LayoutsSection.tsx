import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { History, Move, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useObservedElementSize } from '../../../hooks/useObservedElementSize';
import { DemoCard, type CardSpan } from '../demo/DemoCard';
import type { DemoCardId } from '../demo/fixtures';
import { useIsWide } from '../hooks/useMediaQuery';
import { useSceneProgress } from '../hooks/useSceneProgress';
import { AttentionBanner, BottomBar, Greeting, SideRail } from '../ui/BoardChrome';
import { DURATION, EASE_OUT, LAYOUT_SPRING, SECTION_IDS } from '../tokens';

/**
 * LAYOUTS — "one layout, three grids".
 *
 * The same ten cards physically reflow between the production grid presets
 * (xl 12 columns, lg 8 columns, xs 2 columns) as the visitor scrolls. On
 * narrow screens the morph becomes three stacked, statically scaled frames.
 */

type Mode = 'desktop' | 'tablet' | 'phone';
type Cell = { col: number; row: number; span: CardSpan };

const MODES: Record<
  Mode,
  {
    label: string;
    cols: number;
    breakpoint: 'xl' | 'lg' | 'xs';
    width: number;
    copy: string;
    cells: Partial<Record<DemoCardId, Cell>>;
  }
> = {
  desktop: {
    label: 'Desktop',
    cols: 12,
    breakpoint: 'xl',
    width: 1000,
    copy: 'Dodici colonne e tutto lo spazio per la casa intera, con i pannelli contestuali a portata di clic.',
    cells: {
      climate: { col: 1, row: 1, span: { w: 3, h: 3 } },
      alarm: { col: 4, row: 1, span: { w: 3, h: 3 } },
      light: { col: 7, row: 1, span: { w: 2, h: 2 } },
      switch: { col: 7, row: 3, span: { w: 2, h: 1 } },
      sensor: { col: 9, row: 1, span: { w: 2, h: 3 } },
      lock: { col: 11, row: 1, span: { w: 2, h: 3 } },
      camera: { col: 1, row: 4, span: { w: 4, h: 3 } },
      media: { col: 5, row: 4, span: { w: 2, h: 3 } },
      cover: { col: 7, row: 4, span: { w: 2, h: 3 } },
      vacuum: { col: 9, row: 4, span: { w: 4, h: 3 } },
    },
  },
  tablet: {
    label: 'Tablet',
    cols: 8,
    breakpoint: 'lg',
    width: 760,
    copy: 'Otto colonne. La stessa casa, ricomposta per il tablet: nessuna card tagliata, nessuno spazio sprecato.',
    cells: {
      climate: { col: 1, row: 1, span: { w: 3, h: 3 } },
      alarm: { col: 4, row: 1, span: { w: 3, h: 3 } },
      light: { col: 7, row: 1, span: { w: 2, h: 2 } },
      switch: { col: 7, row: 3, span: { w: 2, h: 1 } },
      camera: { col: 1, row: 4, span: { w: 4, h: 3 } },
      media: { col: 5, row: 4, span: { w: 2, h: 3 } },
      cover: { col: 7, row: 4, span: { w: 2, h: 3 } },
      sensor: { col: 1, row: 7, span: { w: 2, h: 3 } },
      lock: { col: 3, row: 7, span: { w: 2, h: 3 } },
      vacuum: { col: 5, row: 7, span: { w: 4, h: 3 } },
    },
  },
  phone: {
    label: 'Smartphone',
    cols: 2,
    breakpoint: 'xs',
    width: 340,
    copy: 'Due colonne e la barra in basso. Ogni card sceglie la propria variante in base allo spazio reale.',
    cells: {
      climate: { col: 1, row: 1, span: { w: 2, h: 3 } },
      light: { col: 1, row: 4, span: { w: 1, h: 2 } },
      lock: { col: 2, row: 4, span: { w: 1, h: 2 } },
      media: { col: 1, row: 6, span: { w: 1, h: 3 } },
      cover: { col: 2, row: 6, span: { w: 1, h: 3 } },
      switch: { col: 1, row: 9, span: { w: 2, h: 1 } },
      alarm: { col: 1, row: 10, span: { w: 2, h: 3 } },
      camera: { col: 1, row: 13, span: { w: 2, h: 3 } },
      sensor: { col: 1, row: 16, span: { w: 1, h: 3 } },
      vacuum: { col: 1, row: 19, span: { w: 2, h: 3 } },
    },
  },
};

const MODE_ORDER: Mode[] = ['desktop', 'tablet', 'phone'];
const CARD_ORDER: DemoCardId[] = [
  'climate',
  'alarm',
  'light',
  'switch',
  'sensor',
  'lock',
  'camera',
  'media',
  'cover',
  'vacuum',
];
const PHONE_SCREEN_HEIGHT = 700;

const BUILDER_FACTS = [
  { icon: Move, label: 'Drag & drop' },
  { icon: Undo2, label: 'Undo / redo' },
  { icon: History, label: 'Versioni e rollback' },
];

function LayoutBoard({
  mode,
  animated,
  width,
  phoneHeight = PHONE_SCREEN_HEIGHT,
  compact = false,
  phoneScroll,
}: {
  mode: Mode;
  animated: boolean;
  width: number;
  /** Phone screen height; shrinks on short viewports. */
  phoneHeight?: number;
  /** Denser rows (40px / 12px gap) so tall layouts fit short laptop screens. */
  compact?: boolean;
  phoneScroll?: MotionValue<number>;
}) {
  const config = MODES[mode];
  const isPhone = mode === 'phone';
  const layout = animated ? true : undefined;
  const transition = animated ? LAYOUT_SPRING : undefined;

  const grid = (
    <motion.div
      className="s-board-grid"
      style={{
        gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
        gridAutoRows: compact ? 40 : undefined,
        gap: compact ? 12 : undefined,
        y: isPhone ? phoneScroll : undefined,
      }}
    >
      {CARD_ORDER.map((id) => {
        const cell = config.cells[id];
        if (!cell) return null;
        return (
          <motion.div
            key={id}
            layout={layout}
            transition={transition}
            className="s-board-cell"
            style={{ gridColumn: `${cell.col} / span ${cell.span.w}`, gridRow: `${cell.row} / span ${cell.span.h}` }}
          >
            <DemoCard id={id} span={cell.span} breakpoint={config.breakpoint} />
          </motion.div>
        );
      })}
    </motion.div>
  );

  return (
    <motion.div
      layout={layout}
      transition={transition}
      className={`s-panel relative overflow-hidden ${isPhone ? 'rounded-[3rem] p-3.5 ring-[6px] ring-[#161b27]' : 'rounded-[2rem] p-4'}`}
      style={{ width, height: isPhone ? phoneHeight : undefined }}
    >
      {isPhone ? (
        <div className="relative h-full overflow-hidden rounded-[2.2rem] px-3 pt-10">
          <motion.div
            layout={layout}
            className="absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-full bg-black"
          />
          <div className="mb-4">
            <Greeting compact />
          </div>
          {grid}
          <div className="absolute inset-x-2 bottom-2">
            <BottomBar />
          </div>
        </div>
      ) : (
        <div className="flex gap-4">
          <motion.div layout={layout} transition={transition} className="flex">
            <SideRail />
          </motion.div>
          <div className="min-w-0 flex-1">
            <motion.div layout={layout} transition={transition} className="mb-4 space-y-4">
              {compact && mode === 'tablet' ? null : <AttentionBanner compact={mode === 'tablet'} />}
              <Greeting compact={mode === 'tablet'} />
            </motion.div>
            {grid}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ModeCopy({ mode, progress, titleId }: { mode: Mode; progress: MotionValue<number>; titleId: string }) {
  const config = MODES[mode];
  const rail = useTransform(progress, [0.02, 0.98], ['0%', '100%']);
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="s-label mb-6">02 — Layout</p>
      <h2
        id={titleId}
        className="text-[clamp(2.3rem,3.5vw,3.5rem)] font-[580] leading-[0.98] tracking-[-0.045em] text-white"
      >
        Un layout.
        <br />
        <span className="s-mute">Tre griglie.</span>
      </h2>

      <p className="s-label mt-12">
        Colonne · <span className="text-white">{config.label}</span>
      </p>
      <div className="mt-2">
        <div className="relative h-[clamp(6rem,10vw,9rem)] overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={config.cols}
              initial={{ y: '100%' }}
              animate={{ y: '0%' }}
              exit={{ y: '-100%' }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
              className="s-blue-ink absolute bottom-0 left-0 text-[clamp(6rem,10vw,9rem)] font-semibold leading-[0.85] tracking-[-0.07em]"
            >
              {config.cols}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative mt-8 min-h-[4.5rem] max-w-sm">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={mode}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="s-lead"
          >
            {config.copy}
          </motion.p>
        </AnimatePresence>
      </div>

      <ol
        className="relative mt-10 flex max-w-sm justify-between border-t border-white/[0.08] pt-4"
        aria-label="Griglie"
      >
        <motion.span aria-hidden className="absolute -top-px left-0 h-px bg-[var(--s-blue)]" style={{ width: rail }} />
        {MODE_ORDER.map((item) => (
          <li
            key={item}
            aria-current={item === mode ? 'step' : undefined}
            className={`s-label transition-colors duration-500 ${item === mode ? '!text-white' : ''}`}
          >
            {MODES[item].label}
          </li>
        ))}
      </ol>

      <ul className="mt-10 flex flex-wrap gap-2" aria-label="Builder visuale">
        {BUILDER_FACTS.map(({ icon: Icon, label }) => (
          <li key={label} className="s-chip">
            <Icon className="h-3.5 w-3.5 text-[var(--s-blue)]" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WideLayouts() {
  const trackRef = useRef<HTMLElement>(null);
  const progress = useSceneProgress(trackRef);
  const [mode, setMode] = useState<Mode>('desktop');

  useMotionValueEvent(progress, 'change', (value) => {
    const next: Mode = value < 0.34 ? 'desktop' : value < 0.67 ? 'tablet' : 'phone';
    setMode((current) => (current === next ? current : next));
  });

  const { ref: columnRef, size: column } = useObservedElementSize<HTMLDivElement>('layouts-column');
  const columnWidth = column?.width ?? 960;
  const columnHeight = column?.height ?? 900;
  const compact = columnHeight < 800;
  const phoneHeight = Math.min(PHONE_SCREEN_HEIGHT, columnHeight - 48);
  const frameWidth = {
    desktop: Math.min(1060, columnWidth),
    tablet: Math.min(780, columnWidth * 0.8),
    phone: 340,
  }[mode];

  // The board rises out of the manifesto while the section scrolls into place.
  // It reaches identity before pinning, so layout animations never run under a transform.
  const { scrollYProgress: enter } = useScroll({ target: trackRef, offset: ['start end', 'start start'] });
  const enterY = useTransform(enter, [0, 1], [160, 0]);
  const enterScale = useTransform(enter, [0, 1], [0.88, 1]);
  const enterOpacity = useTransform(enter, [0.2, 0.9], [0, 1]);

  // Inside the phone the dashboard scrolls, as it would under a thumb.
  const phoneScroll = useTransform(progress, [0.72, 0.98], [0, -(PHONE_SCREEN_HEIGHT * 0.95)]);

  return (
    <section
      ref={trackRef}
      id={SECTION_IDS.layouts}
      aria-labelledby="layouts-title"
      className="s-track"
      style={{ height: '360vh' }}
    >
      <div className="s-stage">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_68%_50%,rgb(23_104_213/0.13),transparent_70%)]"
        />
        <div className="mx-auto grid h-full max-w-[96rem] grid-cols-[18.5rem_1fr] gap-12 px-[var(--s-gutter)] pt-[var(--s-nav-h)]">
          <ModeCopy mode={mode} progress={progress} titleId="layouts-title" />
          <div ref={columnRef} className="flex min-w-0 items-center justify-center">
            <motion.div style={{ y: enterY, scale: enterScale, opacity: enterOpacity }}>
              <LayoutGroup id="layouts-board">
                <LayoutBoard
                  mode={mode}
                  width={frameWidth}
                  compact={compact}
                  phoneHeight={phoneHeight}
                  animated
                  phoneScroll={phoneScroll}
                />
              </LayoutGroup>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScaledBoard({ mode }: { mode: Mode }) {
  const { ref, size } = useObservedElementSize<HTMLDivElement>(`layouts-${mode}`);
  const config = MODES[mode];
  const naturalHeight = mode === 'phone' ? PHONE_SCREEN_HEIGHT : mode === 'tablet' ? 690 : 500;
  const scale = size ? Math.min(1, size.width / config.width) : 0;
  return (
    <div ref={ref} className="w-full" style={{ height: naturalHeight * (scale || 0.35) }}>
      {scale ? (
        <div style={{ width: config.width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <LayoutBoard mode={mode} width={config.width} animated={false} />
        </div>
      ) : null}
    </div>
  );
}

function NarrowLayouts() {
  return (
    <section id={SECTION_IDS.layouts} aria-labelledby="layouts-title-narrow" className="relative py-28">
      <div className="s-container">
        <p className="s-label mb-6">02 — Layout</p>
        <h2 id="layouts-title-narrow" className="s-title text-white">
          Un layout.
          <br />
          <span className="s-mute">Tre griglie.</span>
        </h2>
        <div className="mt-16 space-y-20">
          {MODE_ORDER.map((mode) => (
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15% 0px' }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            >
              <p className="s-label">
                Colonne · <span className="text-white">{MODES[mode].label}</span>
              </p>
              <p className="s-blue-ink mb-5 mt-2 text-[5.5rem] font-semibold leading-[0.9] tracking-[-0.07em]">
                {MODES[mode].cols}
              </p>
              <p className="s-lead mb-8">{MODES[mode].copy}</p>
              <ScaledBoard mode={mode} />
            </motion.div>
          ))}
        </div>
        <ul className="mt-16 flex flex-wrap gap-2" aria-label="Builder visuale">
          {BUILDER_FACTS.map(({ icon: Icon, label }) => (
            <li key={label} className="s-chip">
              <Icon className="h-3.5 w-3.5 text-[var(--s-blue)]" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LayoutsSection() {
  return useIsWide() ? <WideLayouts /> : <NarrowLayouts />;
}
