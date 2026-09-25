import { useScroll, useSpring, type MotionValue, type UseScrollOptions } from 'framer-motion';
import type { RefObject } from 'react';
import { SCROLL_SPRING } from '../tokens';

type Offset = NonNullable<UseScrollOptions['offset']>;

/**
 * Scroll progress (0 → 1) of a pinned scene's track.
 *
 * Default offset maps 0 to "track top reaches viewport top" and 1 to "track
 * bottom reaches viewport bottom" — i.e. exactly the time the sticky stage is
 * pinned. A light spring removes wheel jitter; it adds no perceptible lag.
 */
export function useSceneProgress(
  target: RefObject<HTMLElement | null>,
  offset: Offset = ['start start', 'end end'],
): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target, offset });
  return useSpring(scrollYProgress, SCROLL_SPRING);
}
