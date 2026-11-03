import React from 'react';
import { clsx } from 'clsx';

/*
 * The name of a card on one line: when it does not fit it scrolls by itself, in a
 * loop, instead of going to a second line. A name that fits stays still.
 */

const SPEED_PX_PER_SECOND = 28;
/** Part of the loop the name waits before moving, so that it can be read from its start. */
const MOVING_SHARE = 0.8;
/** The gap between the name and its copy, as in the styles. */
const GAP_PX = 28;

export function ScrollingName({ name, still = false }: { name: string; still?: boolean }) {
  const box = React.useRef<HTMLSpanElement>(null);
  const text = React.useRef<HTMLSpanElement>(null);
  const [width, setWidth] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const boxNode = box.current;
    const textNode = text.current;
    if (!boxNode || !textNode) return undefined;
    const measure = () => {
      const needed = textNode.getBoundingClientRect().width;
      setWidth(needed > boxNode.getBoundingClientRect().width + 0.5 ? needed : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(boxNode);
    observer.observe(textNode);
    return () => observer.disconnect();
  }, [name]);

  const moving = width !== null && !still;
  const style = moving
    ? ({ '--dv-name-time': `${Math.max(5, (width + GAP_PX) / SPEED_PX_PER_SECOND / MOVING_SHARE).toFixed(1)}s` } as React.CSSProperties)
    : undefined;

  return (
    <span ref={box} className={clsx('dv-name dv-name-scroll', width !== null && 'is-long', moving && 'is-moving')} style={style}>
      <span className="dv-name-track">
        <span ref={text}>{name}</span>
        {moving ? <span aria-hidden="true">{name}</span> : null}
      </span>
    </span>
  );
}

export default ScrollingName;
