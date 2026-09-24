import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Github, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DomusMark } from './ui/Logo';
import { DURATION, EASE_OUT, NAV_ITEMS, SECTION_IDS, SITE_LINKS, type SectionId } from './tokens';

function useActiveSection(ids: SectionId[]) {
  const [active, setActive] = useState<SectionId | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id as SectionId);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    const elements = [SECTION_IDS.top, ...ids]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

const NAV_IDS = NAV_ITEMS.map((item) => item.id);

export function SiteNav() {
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useActiveSection(NAV_IDS);

  useMotionValueEvent(scrollY, 'change', (value) => setCondensed(value > 80));

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.2 }}
        className="fixed inset-x-0 top-0 z-[var(--s-z-nav)] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <nav
          aria-label="Navigazione principale"
          className={`flex w-full items-center justify-between gap-4 rounded-full transition-[max-width,background-color,border-color,padding,box-shadow] duration-500 ease-[var(--s-ease-out)] ${
            condensed
              ? 's-glass max-w-[52rem] py-1.5 pl-2 pr-1.5 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)]'
              : 'max-w-[82rem] border border-transparent py-2 pl-2 pr-2'
          }`}
        >
          <a
            href={`#${SECTION_IDS.top}`}
            className="flex items-center gap-2.5 rounded-full pr-2"
            onClick={() => setMenuOpen(false)}
          >
            <DomusMark className="h-8 w-8" />
            <span className="text-[0.95rem] font-semibold tracking-[-0.02em] text-white">Domus UI</span>
          </a>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.id;
              return (
                <li key={item.id} className="relative">
                  <a
                    href={`#${item.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={`relative z-10 block rounded-full px-3.5 py-2 text-[0.82rem] font-medium transition-colors duration-300 ${
                      isActive ? 'text-white' : 'text-white/55 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </a>
                  {isActive ? (
                    <motion.span
                      layoutId="site-nav-active"
                      className="absolute inset-0 rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/10"
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-1.5">
            <a
              href={SITE_LINKS.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white sm:flex"
            >
              <Github className="h-4 w-4" />
              <span className="sr-only">Domus UI su GitHub (si apre in una nuova scheda)</span>
            </a>
            <a
              href={`#${SECTION_IDS.install}`}
              className="hidden h-9 items-center rounded-full bg-white px-4 text-[0.82rem] font-semibold text-[#050a14] transition-shadow hover:shadow-[0_8px_30px_-8px_rgb(91_168_255/0.9)] lg:flex"
            >
              Installa
            </a>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="site-mobile-menu"
              aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white lg:hidden"
            >
              {menuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            id="site-mobile-menu"
            key="menu"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="fixed inset-0 z-[45] flex flex-col justify-end bg-[#03050a]/97 px-[var(--s-gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
          >
            <ul className="space-y-1">
              {NAV_ITEMS.map((item, index) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.15 + index * 0.05 }}
                >
                  <a
                    href={`#${item.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-baseline justify-between border-b border-white/[0.07] py-4 text-[2.4rem] font-semibold tracking-[-0.04em] text-white"
                  >
                    {item.label}
                    <span className="s-label">0{index + 1}</span>
                  </a>
                </motion.li>
              ))}
            </ul>
            <a
              href={SITE_LINKS.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex items-center gap-2 text-sm text-white/60"
            >
              <Github className="h-4 w-4" /> github.com/Mattia2399/DomusUI
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
