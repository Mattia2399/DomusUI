import { motion } from 'framer-motion';
import { Coffee, Heart } from 'lucide-react';
import { CtaLink } from '../ui/CtaLink';
import { DURATION, EASE_OUT, SUPPORT_LINKS } from '../tokens';

/**
 * SUPPORT — a quiet invitation before the finale. Renders nothing until at
 * least one channel is configured in SUPPORT_LINKS, so no dead links ship.
 */
export function SupportSection() {
  const { kofi, githubSponsors } = SUPPORT_LINKS;
  if (!kofi && !githubSponsors) return null;

  return (
    <section aria-labelledby="support-title" className="relative pt-28 md:pt-40">
      <div className="s-container">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: DURATION.slow, ease: EASE_OUT }}
          className="relative overflow-hidden rounded-[var(--s-radius-xl)] border border-white/[0.08] bg-[var(--s-bg-raised)] px-6 py-12 md:px-14 md:py-16"
        >
          {/* Warm light, like the first coffee of the morning. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[10%] -top-[40%] h-[140%] w-[60%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_154_77/0.18),transparent_75%)]"
          />

          <div className="relative flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--s-warm)]/30 bg-[var(--s-warm)]/10 text-[#ffb27a]">
                <Coffee className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <p className="s-label mb-4">Supporta il progetto</p>
              <h2 id="support-title" className="s-subtitle text-white">
                Domus UI è gratuito e open source.
                <br />
                <span className="s-mute">Se rende migliore la tua casa, offrimi un caffè.</span>
              </h2>
              <p className="mt-5 max-w-lg text-[0.95rem] leading-relaxed text-white/55">
                Ogni contributo aiuta a dedicare più tempo a Domus UI: nuove card, test su dispositivi reali e
                traduzioni. Nessun obbligo, nessuna funzione a pagamento.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:shrink-0">
              {kofi ? (
                <CtaLink href={kofi} variant="warm" icon={<Coffee className="h-4 w-4" />}>
                  Offrimi un caffè
                </CtaLink>
              ) : null}
              {githubSponsors ? (
                <CtaLink href={githubSponsors} variant="ghost" icon={<Heart className="h-4 w-4" />}>
                  Diventa sponsor
                </CtaLink>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
