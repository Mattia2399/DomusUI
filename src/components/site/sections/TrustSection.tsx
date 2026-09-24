import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { Blocks, Cpu, Fingerprint, LayoutGrid, Server, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import { CtaLink } from '../ui/CtaLink';
import { SCROLL_SPRING, SECTION_IDS, SITE_LINKS } from '../tokens';

/**
 * TRUST — architecture and security as one vertical flow, "from your finger
 * to the device". A light pulse travels down the spine with the scroll and
 * each layer lights up as it is reached. Every layer and claim maps to what
 * the repository actually ships (see README and docs/security-and-privacy.md).
 */

const LAYERS: { icon: LucideIcon; name: string; stack: string; text: string }[] = [
  {
    icon: LayoutGrid,
    name: 'Interfaccia',
    stack: 'React 19 · TypeScript · Vite',
    text: 'Card, builder e pannelli. Allarmi e serrature possono chiedere un PIN o WebAuthn sul dispositivo prima di agire.',
  },
  {
    icon: Blocks,
    name: 'Pannello Home Assistant',
    stack: 'panel_custom · sessione HA',
    text: 'Domus UI vive nella sidebar e usa la sessione autenticata di Home Assistant. Nessun token da copiare.',
  },
  {
    icon: Server,
    name: 'Integrazione Domus UI',
    stack: 'Python · HACS',
    text: 'Registra il pannello, il calendario nativo e il motore di irrigazione Domus Core, che lavora lato server anche a schermi chiusi.',
  },
  {
    icon: Fingerprint,
    name: 'Home Assistant',
    stack: 'WebSocket · autorizzazione',
    text: 'Identità, ruoli e comandi restano di Home Assistant, come il layout condiviso e le sue versioni. Token, PIN e codici restano fuori da layout, backup e sincronizzazione.',
  },
  {
    icon: Cpu,
    name: 'I tuoi dispositivi',
    stack: 'Entità di Home Assistant',
    text: 'Luci, clima, allarmi, telecamere e tutto ciò che le tue integrazioni espongono.',
  },
];

function Layer({
  layer,
  index,
  progress,
}: {
  layer: (typeof LAYERS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const at = (index + 0.35) / LAYERS.length;
  const lit = useTransform(progress, [at - 0.08, at], [0, 1]);
  const nodeScale = useTransform(lit, [0, 1], [0.6, 1]);
  const textOpacity = useTransform(lit, [0, 1], [0.35, 1]);
  const Icon = layer.icon;

  return (
    <li className="relative grid grid-cols-[3.5rem_1fr] gap-5 pb-16 last:pb-0 md:grid-cols-[4.5rem_1fr] md:gap-8 md:pb-24">
      <div className="relative flex justify-center">
        <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[var(--s-bg-raised)] md:h-[4.5rem] md:w-[4.5rem]">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle,rgb(91_168_255/0.35),transparent_70%)] ring-1 ring-[var(--s-blue)]/60"
            style={{ opacity: lit, scale: nodeScale }}
          />
          <Icon className="relative h-5 w-5 text-white md:h-6 md:w-6" strokeWidth={1.6} />
        </span>
      </div>
      <motion.div style={{ opacity: textOpacity }} className="pt-1 md:pt-3">
        <p className="s-label">{layer.stack}</p>
        <h3 className="mt-2 text-[clamp(1.4rem,2.2vw,2rem)] font-[560] tracking-[-0.03em] text-white">{layer.name}</h3>
        <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-white/60">{layer.text}</p>
      </motion.div>
    </li>
  );
}

export function TrustSection() {
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 70%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, SCROLL_SPRING);
  const spine = useTransform(progress, [0, 1], [0, 1]);
  const pulseY = useTransform(progress, [0, 1], ['0%', '100%']);

  return (
    <section id={SECTION_IDS.trust} aria-labelledby="trust-title" className="relative py-28 md:py-44">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_40%_at_20%_20%,rgb(23_104_213/0.12),transparent_70%)]"
      />
      <div className="s-container relative grid gap-16 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-24">
        <div className="lg:sticky lg:top-[calc(var(--s-nav-h)+4rem)] lg:self-start">
          <p className="s-label mb-6">06 — Sicurezza e architettura</p>
          <h2 id="trust-title" className="s-title text-white">
            Home Assistant
            <br />
            <span className="s-mute">resta l’autorità.</span>
          </h2>
          <p className="s-lead mt-6">
            Domus UI è l’interfaccia, non un nuovo cloud. Identità, permessi e comandi passano da Home Assistant, dal
            tuo dito fino al dispositivo.
          </p>
          <p className="mt-6 border-l border-[var(--s-warm)]/50 pl-4 text-[0.85rem] leading-relaxed text-white/50">
            La conferma WebAuthn è una protezione locale, non un secondo fattore certificato lato server. Domus UI non è
            un sistema di allarme o di sicurezza certificato.
          </p>
          <div className="mt-8">
            <CtaLink href={SITE_LINKS.security} variant="ghost">
              Sicurezza e privacy
            </CtaLink>
          </div>
        </div>

        <div className="relative">
          {/* Spine */}
          <div aria-hidden className="absolute bottom-6 left-7 top-6 w-px bg-white/[0.08] md:left-9">
            <motion.div
              className="absolute inset-x-0 top-0 h-full origin-top bg-gradient-to-b from-[var(--s-blue)] to-[var(--s-blue-deep)]"
              style={{ scaleY: spine }}
            />
            <motion.div className="absolute inset-0" style={{ y: pulseY }}>
              <span className="absolute left-1/2 top-0 h-24 w-[3px] -translate-x-1/2 -translate-y-full rounded-full bg-gradient-to-b from-transparent to-white shadow-[0_0_18px_4px_rgb(91_168_255/0.6)]" />
            </motion.div>
          </div>
          <ol ref={listRef} className="relative">
            {LAYERS.map((layer, index) => (
              <Layer key={layer.name} layer={layer} index={index} progress={progress} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
