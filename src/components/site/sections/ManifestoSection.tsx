import { motion, useTransform, type MotionValue } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { useSceneProgress } from '../hooks/useSceneProgress';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import { DOMUS_GLYPH_PATHS } from '../ui/Logo';

/**
 * MANIFESTO — a curtain that slides over the pinned hero dashboard.
 * The statement lights up word by word with scroll progress while the
 * house glyph from the logo draws itself behind it.
 */

const REVEAL_START = 0.08;
const REVEAL_END = 0.72;

function Word({
  word,
  accent,
  index,
  total,
  progress,
}: {
  word: string;
  accent: boolean;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const step = (REVEAL_END - REVEAL_START) / total;
  const start = REVEAL_START + index * step;
  const opacity = useTransform(progress, [start, start + step * 3], [0.13, 1]);
  return (
    <motion.span style={{ opacity }} className={accent ? 's-blue-ink' : undefined}>
      {word}{' '}
    </motion.span>
  );
}

export function ManifestoSection() {
  const { manifesto } = useSiteCopy();
  // One entry per word, keeping the accent of the phrase it belongs to.
  const words = useMemo(
    () => manifesto.statement.flatMap((chunk) => chunk.text.split(' ').map((word) => ({ word, accent: chunk.accent }))),
    [manifesto.statement],
  );
  const trackRef = useRef<HTMLElement>(null);
  const progress = useSceneProgress(trackRef);
  const glyphLength = useTransform(progress, [0.05, 0.8], [0, 1]);
  const glyphOpacity = useTransform(progress, [0, 0.1, 0.85, 1], [0, 0.4, 0.4, 0.1]);
  const factsOpacity = useTransform(progress, [0.72, 0.84], [0, 1]);
  const factsY = useTransform(progress, [0.72, 0.84], [30, 0]);
  const exitScale = useTransform(progress, [0.88, 1], [1, 0.94]);
  const exitOpacity = useTransform(progress, [0.9, 1], [1, 0.2]);

  return (
    <section
      ref={trackRef}
      aria-label="Manifesto"
      className="s-track s-curtain"
      style={{ marginTop: '-100svh', height: '280vh' }}
    >
      <div className="s-stage">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[40vh] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgb(23_104_213/0.16),transparent_70%)]"
        />
        <motion.svg
          aria-hidden
          viewBox="40 50 176 170"
          className="pointer-events-none absolute right-[-30vw] top-1/2 h-[96vh] w-auto -translate-y-1/2 md:right-[-10vw]"
          style={{ opacity: glyphOpacity }}
        >
          {DOMUS_GLYPH_PATHS.map((d) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke="url(#manifesto-stroke)"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pathLength: glyphLength }}
            />
          ))}
          <defs>
            <linearGradient id="manifesto-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5BA8FF" />
              <stop offset="1" stopColor="#1768D5" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </motion.svg>

        <motion.div
          className="s-container relative flex h-full flex-col justify-center"
          style={{ scale: exitScale, opacity: exitOpacity }}
        >
          <p className="s-label mb-8 md:mb-10">{manifesto.label}</p>
          <p className="max-w-[62rem] text-[clamp(1.85rem,4.3vw,4.35rem)] font-[560] leading-[1.06] tracking-[-0.042em] text-white">
            {words.map((item, index) => (
              <Word
                key={index}
                word={item.word}
                accent={item.accent}
                index={index}
                total={words.length}
                progress={progress}
              />
            ))}
          </p>

          <motion.dl
            className="mt-12 grid max-w-[62rem] grid-cols-2 gap-x-6 gap-y-6 border-t border-white/[0.08] pt-8 md:mt-16 md:grid-cols-4"
            style={{ opacity: factsOpacity, y: factsY }}
          >
            {manifesto.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="sr-only">{fact.label}</dt>
                <dd className="text-[clamp(1.6rem,2.6vw,2.4rem)] font-semibold tracking-[-0.04em] text-white">
                  {fact.value}
                </dd>
                <dd className="mt-1 text-[0.82rem] leading-snug text-white/50">{fact.label}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </div>
    </section>
  );
}
