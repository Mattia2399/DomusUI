import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { useRef } from 'react';
import irrigationImage from '../../../assets/irrigation-smart-hero.jpg';
import poolImage from '../../../assets/pool-spa-preview.jpg';
import technicalImage from '../../../assets/technical-room-preview.jpg';
import { useObservedElementSize } from '../../../hooks/useObservedElementSize';
import { useIsWide } from '../hooks/useMediaQuery';
import { useSceneProgress } from '../hooks/useSceneProgress';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import { DURATION, EASE_OUT, SECTION_IDS } from '../tokens';

/**
 * APPS — the App Gallery as a horizontal, scroll-driven strip.
 * Statuses mirror docs/feature-status.md: only Irrigation is available (beta).
 */

type AppStatus = 'beta' | 'dev';

// Visual data per app; the texts come from copy.apps.items (same order).
const APPS: { status: AppStatus; image: string }[] = [
  { status: 'beta', image: irrigationImage },
  { status: 'dev', image: technicalImage },
  { status: 'dev', image: poolImage },
];

const STATUS_COLOR: Record<AppStatus, string> = {
  beta: 'var(--s-beta)',
  dev: 'var(--s-ink-3)',
};

function useApps() {
  const { apps } = useSiteCopy();
  return APPS.map((app, index) => ({ ...app, ...apps.items[index] }));
}

type App = ReturnType<typeof useApps>[number];

function AppPanel({
  app,
  index,
  progress,
  className = '',
}: {
  app: App;
  index: number;
  progress?: MotionValue<number>;
  className?: string;
}) {
  // Each image drifts against the strip for a subtle depth parallax.
  const still = useMotionValue(0);
  const imageX = useTransform(progress ?? still, [0, 1], [`${6 - index * 6}%`, `${-6 - index * 6}%`]);
  const { apps } = useSiteCopy();

  return (
    <article
      className={`relative overflow-hidden rounded-[var(--s-radius-xl)] border border-white/[0.08] bg-[var(--s-bg-raised)] ${className}`}
    >
      <motion.img
        src={app.image}
        alt={app.alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-y-0 left-[-12%] h-full w-[124%] max-w-none object-cover"
        style={{ x: progress ? imageX : 0 }}
      />
      <div
        aria-hidden
        className={`absolute inset-0 ${
          app.status === 'dev' ? 'bg-[rgb(3_5_10/0.55)]' : ''
        } bg-[linear-gradient(180deg,rgb(3_5_10/0.15)_0%,transparent_35%,rgb(3_5_10/0.88)_100%)]`}
      />
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
        <p className="s-chip mb-5 !bg-black/40 backdrop-blur-md" style={{ color: STATUS_COLOR[app.status] }}>
          <span className="s-dot" />
          {apps.status[app.status]}
        </p>
        <h3 className="s-subtitle text-white">{app.name}</h3>
        <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-white/70">{app.summary}</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {app.facts.map((fact) => (
            <li key={fact} className="s-chip !bg-black/35 backdrop-blur-md">
              {fact}
            </li>
          ))}
        </ul>
      </div>
      <span aria-hidden className="s-label absolute right-6 top-6 md:right-10 md:top-9">
        0{index + 1}
      </span>
    </article>
  );
}

function WideApps() {
  const copy = useSiteCopy().apps;
  const items = useApps();
  const trackRef = useRef<HTMLElement>(null);
  const progress = useSceneProgress(trackRef);
  const { ref: stripRef, size } = useObservedElementSize<HTMLDivElement>('apps-strip');
  const travel = size ? Math.max(0, size.width - document.documentElement.clientWidth) : 0;
  const x = useTransform(progress, [0.05, 0.95], [0, -travel]);
  const barScale = useTransform(progress, [0.05, 0.95], [0, 1]);

  return (
    <section
      ref={trackRef}
      id={SECTION_IDS.apps}
      aria-labelledby="apps-title"
      className="s-track"
      style={{ height: '320vh' }}
    >
      <div className="s-stage flex flex-col justify-center">
        <motion.div
          ref={stripRef}
          className="flex w-max items-stretch gap-6 pl-[var(--s-gutter)] pr-[12vw]"
          style={{ x }}
        >
          <div className="flex w-[34vw] min-w-[24rem] shrink-0 flex-col justify-center pr-8">
            <p className="s-label mb-6">{copy.label}</p>
            <h2 id="apps-title" className="s-title text-white">
              {copy.title}
              <br />
              {copy.titleMuted}
            </h2>
            <p className="s-lead mt-6 max-w-sm">{copy.lead}</p>
          </div>
          {items.map((app, index) => (
            <AppPanel
              key={app.name}
              app={app}
              index={index}
              progress={progress}
              className={`h-[74vh] shrink-0 ${index === 0 ? 'w-[62vw]' : 'w-[44vw]'}`}
            />
          ))}
        </motion.div>
        <div className="s-container mt-8">
          <div className="h-px w-full bg-white/10">
            <motion.div className="h-px origin-left bg-[var(--s-blue)]" style={{ scaleX: barScale }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function NarrowApps() {
  const copy = useSiteCopy().apps;
  const items = useApps();
  return (
    <section id={SECTION_IDS.apps} aria-labelledby="apps-title-narrow" className="py-28">
      <div className="s-container">
        <p className="s-label mb-6">{copy.label}</p>
        <h2 id="apps-title-narrow" className="s-title text-white">
          {copy.title} {copy.titleMuted}
        </h2>
        <p className="s-lead mt-6">{copy.lead}</p>
        <div className="mt-12 space-y-5">
          {items.map((app, index) => (
            <motion.div
              key={app.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            >
              <AppPanel app={app} index={index} className="h-[68vh] min-h-[26rem]" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AppsSection() {
  const wide = useIsWide();
  const reduceMotion = useReducedMotion();
  return wide && !reduceMotion ? <WideApps /> : <NarrowApps />;
}
