import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { useFinePointer } from '../hooks/useMediaQuery';

const MAGNET_SPRING = { stiffness: 260, damping: 20, mass: 0.5 };

/**
 * Call-to-action link with a subtle magnetic pull on mouse devices.
 * External links open in a new tab and announce it to assistive tech.
 */
export function CtaLink({
  href,
  children,
  variant = 'primary',
  icon = <ArrowUpRight className="h-4 w-4" strokeWidth={2} />,
  className = '',
  external = true,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  icon?: ReactNode;
  className?: string;
  external?: boolean;
}) {
  const finePointer = useFinePointer();
  const reduceMotion = useReducedMotion();
  const magnetic = finePointer && !reduceMotion;
  const x = useSpring(useMotionValue(0), MAGNET_SPRING);
  const y = useSpring(useMotionValue(0), MAGNET_SPRING);

  const onPointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    if (!magnetic) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - (bounds.left + bounds.width / 2)) * 0.22);
    y.set((event.clientY - (bounds.top + bounds.height / 2)) * 0.32);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      href={href}
      style={{ x, y }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onBlur={reset}
      className={`s-btn ${variant === 'primary' ? 's-btn-primary' : 's-btn-ghost'} ${className}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
      {icon}
      {external ? <span className="sr-only"> (si apre in una nuova scheda)</span> : null}
    </motion.a>
  );
}
