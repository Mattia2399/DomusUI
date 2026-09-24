import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { CtaLink } from '../ui/CtaLink';
import { DURATION, EASE_OUT, SECTION_IDS, SITE_LINKS } from '../tokens';

/**
 * INSTALL — the five real HACS steps from the README, followed by an honest
 * feature-status band (docs/feature-status.md).
 */

const STEPS: { title: string; detail: string }[] = [
  { title: 'Prepara HACS', detail: 'Installa e configura HACS nel tuo Home Assistant.' },
  {
    title: 'Aggiungi il repository',
    detail: 'Mattia2399/DomusUI come repository personalizzato di tipo Integrazione.',
  },
  { title: 'Scarica e riavvia', detail: 'Scarica Domus UI e riavvia Home Assistant.' },
  {
    title: 'Aggiungi l’integrazione',
    detail: 'Impostazioni → Dispositivi e servizi → Aggiungi integrazione → Domus UI.',
  },
  { title: 'Apri Domus UI', detail: 'Trovi la nuova voce nella sidebar di Home Assistant.' },
];

type Status = 'ok' | 'beta' | 'later';

const STATUS: { area: string; status: Status }[] = [
  { area: 'Home e Builder', status: 'ok' },
  { area: 'Stanze', status: 'ok' },
  { area: 'Sicurezza', status: 'ok' },
  { area: 'Consumi', status: 'ok' },
  { area: 'Calendario', status: 'ok' },
  { area: 'Profilo e Impostazioni', status: 'ok' },
  { area: 'Irrigazione', status: 'beta' },
  { area: 'Locale tecnico', status: 'later' },
  { area: 'Piscina e Spa', status: 'later' },
  { area: 'Automazioni', status: 'later' },
  { area: 'Mappa e liste', status: 'later' },
];

const STATUS_STYLE: Record<Status, { label: string; color: string }> = {
  ok: { label: 'Operativo', color: 'var(--s-ok)' },
  beta: { label: 'Beta', color: 'var(--s-beta)' },
  later: { label: 'In arrivo', color: 'var(--s-ink-3)' },
};

function StatusBand() {
  const items = [...STATUS, ...STATUS];
  return (
    <div className="relative mt-24 overflow-hidden border-y border-white/[0.07] py-5 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <ul className="s-marquee" aria-label="Stato delle funzionalità">
        {items.map((item, index) => {
          const style = STATUS_STYLE[item.status];
          return (
            <li
              key={`${item.area}-${index}`}
              aria-hidden={index >= STATUS.length ? true : undefined}
              className="flex shrink-0 items-center gap-3 pr-12"
            >
              <span className="s-dot" style={{ color: style.color }} />
              <span className="text-[0.95rem] font-medium tracking-[-0.01em] text-white">{item.area}</span>
              <span className="s-label">{style.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function InstallSection() {
  return (
    <section id={SECTION_IDS.install} aria-labelledby="install-title" className="relative pt-28 md:pt-40">
      <div className="s-container">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="s-label mb-6">07 — Installa</p>
            <h2 id="install-title" className="s-title text-white">
              Cinque passi.
              <br />
              <span className="s-mute">Zero YAML.</span>
            </h2>
          </div>
          <p className="s-lead max-w-sm">
            Nessuna modifica a configuration.yaml, nessun token manuale, nessuna copia in /www.
          </p>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-[var(--s-radius-lg)] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: index * 0.07 }}
              className="group relative flex flex-col bg-[var(--s-bg)] p-6 transition-colors duration-500 hover:bg-[var(--s-bg-raised)] last:sm:col-span-2 last:lg:col-span-1 lg:min-h-[17rem] lg:p-7"
            >
              <span className="s-blue-ink text-[3.2rem] font-semibold leading-none tracking-[-0.06em] md:text-[4rem]">
                {index + 1}
              </span>
              <h3 className="mt-6 text-[1.08rem] font-semibold tracking-[-0.02em] text-white lg:mt-16">{step.title}</h3>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-white/55">{step.detail}</p>
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[var(--s-blue)] transition-transform duration-700 ease-[var(--s-ease-out)] group-hover:scale-x-100"
              />
            </motion.li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <CtaLink href={SITE_LINKS.hacs}>Apri in HACS</CtaLink>
          <CtaLink href={SITE_LINKS.installGuide} variant="ghost" icon={<BookOpen className="h-4 w-4" />}>
            Guida completa
          </CtaLink>
        </div>
      </div>

      <StatusBand />
    </section>
  );
}
