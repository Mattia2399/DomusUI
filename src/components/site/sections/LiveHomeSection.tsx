import { motion, useScroll, useTransform } from 'framer-motion';
import { MousePointerClick } from 'lucide-react';
import { useRef } from 'react';
import poolImage from '../../../assets/pool-spa-preview.jpg';
import { DemoCard, type CardSpan } from '../demo/DemoCard';
import { useDemoHome } from '../demo/DemoHomeProvider';
import type { DemoCardId } from '../demo/fixtures';
import { useIsWide } from '../hooks/useMediaQuery';
import { SplitReveal } from '../ui/SplitReveal';
import { DURATION, EASE_OUT, SECTION_IDS } from '../tokens';

/**
 * LIVE — "touch it, the room answers".
 *
 * A stylised living room reacts to the real cards: the Light card sets the
 * colour and intensity of the lamp glow, the Cover card lowers the curtain
 * over the window, the Climate mode tints the air. Everything is local demo
 * state shared with the rest of the site.
 */

type Placement = { id: DemoCardId; col: number; row: number; span: CardSpan };

const WIDE_CARDS: Placement[] = [
  { id: 'light', col: 1, row: 1, span: { w: 3, h: 2 } },
  { id: 'cover', col: 4, row: 1, span: { w: 2, h: 3 } },
  { id: 'climate', col: 6, row: 1, span: { w: 3, h: 3 } },
];

const NARROW_CARDS: Placement[] = [
  { id: 'light', col: 1, row: 1, span: { w: 2, h: 2 } },
  { id: 'cover', col: 1, row: 3, span: { w: 1, h: 3 } },
  { id: 'climate', col: 2, row: 3, span: { w: 1, h: 3 } },
];

function hsl([h, s]: [number, number], lightness: number, alpha: number) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${lightness}% / ${alpha})`;
}

function Room() {
  const { home } = useDemoHome();
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'center center'] });
  // The window opens up from a narrow slit to the full frame as it enters.
  const clip = useTransform(
    scrollYProgress,
    [0, 1],
    ['inset(18% 22% 18% 22% round 2rem)', 'inset(0% 0% 0% 0% round 2rem)'],
  );
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.25, 1.02]);

  const glow = home.lampOn ? home.lampBrightness / 100 : 0;
  const curtain = 100 - home.coverPosition;
  const climateTint = !home.climateOn
    ? 'transparent'
    : home.climateMode === 'cool'
      ? 'rgb(91 168 255 / 0.12)'
      : 'rgb(255 154 77 / 0.1)';

  return (
    <div ref={sectionRef} className="relative h-full min-h-[22rem] w-full">
      {/* Window onto the garden */}
      <motion.div className="absolute inset-0 overflow-hidden rounded-[2rem]" style={{ clipPath: clip }}>
        <motion.img
          src={poolImage}
          alt="Vista notturna dalla finestra del soggiorno sul giardino con piscina"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          style={{ scale: imageScale }}
        />
        {/* Curtain (Cover card position) */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 origin-top transition-[height] duration-[900ms] ease-[var(--s-ease-out)] motion-reduce:transition-none"
          style={{
            height: `${curtain}%`,
            background:
              'repeating-linear-gradient(90deg, rgb(28 26 34) 0 18px, rgb(40 37 46) 18px 30px, rgb(24 22 30) 30px 44px), linear-gradient(180deg, rgb(0 0 0 / 0), rgb(0 0 0 / 0.5))',
            backgroundBlendMode: 'multiply',
            boxShadow: '0 18px 40px -8px rgb(0 0 0 / 0.8)',
          }}
        />
        {/* Mullions */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3">
          <span className="border-r border-black/60" />
          <span className="border-r border-black/60" />
        </div>
        {/* Room light reflected on the glass */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-[background,opacity] duration-700"
          style={{
            background: `radial-gradient(90% 70% at 0% 0%, ${hsl(home.lampHs, 60, 0.4)}, transparent 70%)`,
            opacity: glow,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-white/10"
        />
      </motion.div>

      {/* Climate air tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 rounded-[3rem] transition-[background] duration-1000"
        style={{ background: `radial-gradient(60% 60% at 50% 110%, ${climateTint}, transparent 70%)` }}
      />
    </div>
  );
}

function Readout() {
  const { home } = useDemoHome();
  const items = [
    { label: 'Luce', value: home.lampOn ? `${home.lampBrightness}%` : 'Spenta' },
    { label: 'Tenda', value: home.coverPosition <= 0 ? 'Chiusa' : `${home.coverPosition}%` },
    { label: 'Clima', value: home.climateOn ? `${home.climateTarget.toFixed(1)}°` : 'Spento' },
  ];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3" aria-live="polite">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt className="s-label">{item.label}</dt>
          <dd className="font-[var(--s-font-mono)] text-sm tabular-nums text-white">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LiveHomeSection() {
  const wide = useIsWide();
  const { home } = useDemoHome();
  const cards = wide ? WIDE_CARDS : NARROW_CARDS;
  const glow = home.lampOn ? home.lampBrightness / 100 : 0;

  return (
    <section id={SECTION_IDS.live} aria-labelledby="live-title" className="relative overflow-hidden py-28 md:py-40">
      {/* Lamp light spilling into the whole section. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-20%] top-[-10%] h-[120%] w-[90%] transition-[background,opacity] duration-700"
        style={{
          background: `radial-gradient(closest-side, ${hsl(home.lampHs, 70, 0.22)}, transparent 75%)`,
          opacity: 0.25 + glow * 0.75,
        }}
      />

      <div className="s-container relative grid gap-12 lg:grid-cols-[minmax(0,46rem)_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-10">
        <div className="lg:col-start-1 lg:row-start-1">
          <p className="s-label mb-6">04 — Live</p>
          <SplitReveal
            id="live-title"
            className="s-title text-white"
            lines={['Tocca.', { text: 'La casa risponde.', className: 's-mute' }]}
          />
          <motion.p
            className="s-lead mt-6 max-w-md"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.2 }}
          >
            Sono le card vere di Domus UI. Accendi la luce, cambiale colore, abbassa la tenda: la stanza segue.
          </motion.p>
        </div>

        <div className="h-[46vh] min-h-[20rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[80vh]">
          <Room />
        </div>

        <motion.div
          className="lg:col-start-1 lg:row-start-2"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.3 }}
        >
          <div
            className="s-board-grid max-w-[46rem]"
            style={{ gridTemplateColumns: `repeat(${wide ? 8 : 2}, minmax(0, 1fr))` }}
          >
            {cards.map((card) => (
              <div
                key={card.id}
                className="s-board-cell"
                style={{
                  gridColumn: `${card.col} / span ${card.span.w}`,
                  gridRow: `${card.row} / span ${card.span.h}`,
                }}
              >
                <DemoCard id={card.id} span={card.span} breakpoint={wide ? 'lg' : 'xs'} />
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
            <Readout />
            <span className="s-label flex items-center gap-2">
              <MousePointerClick className="h-3.5 w-3.5" /> Demo locale
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
