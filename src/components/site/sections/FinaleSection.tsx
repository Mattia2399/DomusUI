import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowUp, Github } from 'lucide-react';
import { useRef } from 'react';
import { CtaLink } from '../ui/CtaLink';
import { DomusMark } from '../ui/Logo';
import { SplitReveal } from '../ui/SplitReveal';
import { APP_VERSION, SECTION_IDS, SITE_LINKS, SUPPORT_LINKS } from '../tokens';

/**
 * FINALE — closes the loop with the hero: the same light, the same tagline
 * and the wordmark rising from the bottom edge as a signature.
 */

const SUPPORT_HREF = SUPPORT_LINKS.kofi ?? SUPPORT_LINKS.githubSponsors;

const LINK_GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Progetto',
    links: [
      { label: 'GitHub', href: SITE_LINKS.repository },
      { label: 'Release', href: SITE_LINKS.releases },
      { label: 'Changelog', href: SITE_LINKS.changelog },
    ],
  },
  {
    title: 'Documentazione',
    links: [
      { label: 'Installazione con HACS', href: SITE_LINKS.installGuide },
      { label: 'Stato delle funzionalità', href: SITE_LINKS.featureStatus },
      { label: 'Sicurezza e privacy', href: SITE_LINKS.security },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Segnala un bug', href: SITE_LINKS.issues },
      { label: 'Idee e domande', href: SITE_LINKS.discussions },
      { label: 'Licenza GPL-3.0', href: SITE_LINKS.license },
      // Appears only once a support channel is configured.
      ...(SUPPORT_HREF ? [{ label: 'Supporta il progetto', href: SUPPORT_HREF }] : []),
    ],
  },
];

export function FinaleSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const markY = useTransform(scrollYProgress, [0.3, 1], ['55%', '8%']);
  const haloScale = useTransform(scrollYProgress, [0, 0.6], [0.6, 1]);
  const haloOpacity = useTransform(scrollYProgress, [0, 0.6], [0, 1]);

  return (
    <footer ref={ref} className="relative overflow-hidden pt-32 md:pt-48" aria-labelledby="finale-title">
      {/* The hero light, returning. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[8%] h-[90vh] w-[120vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(23_104_213/0.34),rgb(10_36_87/0.16)_50%,transparent_75%)]"
        style={{ scale: haloScale, opacity: haloOpacity }}
      />

      <div className="s-container relative flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          className="relative"
        >
          <span
            aria-hidden
            className="absolute inset-[-30%] rounded-full bg-[radial-gradient(circle,rgb(91_168_255/0.45),transparent_65%)] blur-2xl"
          />
          <DomusMark className="relative h-24 w-24 drop-shadow-[0_30px_60px_rgb(23_104_213/0.6)] md:h-28 md:w-28" />
        </motion.div>

        <SplitReveal
          id="finale-title"
          className="mt-12 max-w-5xl text-[clamp(2.6rem,6.4vw,6.2rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-white"
          lines={['La tua casa.', { text: "Un'unica esperienza.", className: 's-mute' }]}
        />

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <CtaLink href={SITE_LINKS.hacs}>Installa con HACS</CtaLink>
          <CtaLink href={SITE_LINKS.repository} variant="ghost" icon={<Github className="h-4 w-4" />}>
            Codice su GitHub
          </CtaLink>
        </div>
      </div>

      <nav aria-label="Link del progetto" className="s-container relative mt-32">
        <div className="grid gap-10 border-t border-white/[0.08] pt-12 sm:grid-cols-3">
          {LINK_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="s-label mb-4">{group.title}</p>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-2 text-[0.95rem] text-white/65 transition-colors duration-300 hover:text-white"
                    >
                      <span className="relative">
                        {link.label}
                        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-right scale-x-0 bg-current transition-transform duration-500 ease-[var(--s-ease-out)] group-hover:origin-left group-hover:scale-x-100" />
                      </span>
                      <span className="sr-only"> (si apre in una nuova scheda)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="s-container relative mt-16 flex flex-wrap items-center justify-between gap-4 text-[0.8rem] text-white/40">
        <p>GPL-3.0{APP_VERSION ? ` · v${APP_VERSION}` : ''} · Progetto indipendente per Home Assistant.</p>
        <a
          href={`#${SECTION_IDS.top}`}
          className="inline-flex items-center gap-2 text-white/55 transition-colors hover:text-white"
        >
          Torna su <ArrowUp className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Signature wordmark rising from the bottom edge. */}
      <div aria-hidden className="relative mt-10 h-[clamp(5rem,17vw,17rem)] overflow-hidden">
        <motion.p
          className="s-mega s-gradient-ink absolute inset-x-0 top-0 select-none whitespace-nowrap text-center opacity-80"
          style={{ y: markY }}
        >
          Domus UI
        </motion.p>
      </div>
    </footer>
  );
}
