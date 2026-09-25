import { motion, type Variants } from 'framer-motion';
import type { ElementType } from 'react';
import { DURATION, EASE_OUT } from '../tokens';

type Line = string | { text: string; className?: string };

const container: Variants = {
  hidden: {},
  shown: ({ stagger, delay }: { stagger: number; delay: number }) => ({
    transition: { staggerChildren: stagger, delayChildren: delay },
  }),
};

const word: Variants = {
  hidden: { y: '108%' },
  shown: { y: '0%', transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

/**
 * Masked word-by-word reveal for large headlines.
 *
 * Screen readers get the full sentence through aria-label; the animated
 * fragments are hidden from the accessibility tree. `trigger="mount"` plays
 * immediately (hero), `"view"` plays once when scrolled into view.
 */
export function SplitReveal({
  lines,
  id,
  as: Tag = 'h2',
  className = '',
  trigger = 'view',
  delay = 0,
  stagger = 0.06,
}: {
  lines: Line[];
  id?: string;
  as?: ElementType;
  className?: string;
  trigger?: 'mount' | 'view';
  delay?: number;
  stagger?: number;
}) {
  const normalized = lines.map((line) => (typeof line === 'string' ? { text: line } : line));
  const label = normalized.map((line) => line.text).join(' ');
  const playProps =
    trigger === 'mount'
      ? { animate: 'shown' as const }
      : { whileInView: 'shown' as const, viewport: { once: true, margin: '-12% 0px' } };

  return (
    <Tag id={id} className={className} aria-label={label}>
      <motion.span
        aria-hidden
        className="block"
        initial="hidden"
        custom={{ stagger, delay }}
        variants={container}
        {...playProps}
      >
        {normalized.map((line, lineIndex) => (
          <span key={lineIndex} className={`block ${line.className ?? ''}`}>
            {line.text.split(' ').map((fragment, index) => (
              <span key={index} className="s-mask">
                <motion.span className="inline-block" variants={word}>
                  {fragment}
                  {index < line.text.split(' ').length - 1 ? ' ' : ''}
                </motion.span>
              </span>
            ))}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
