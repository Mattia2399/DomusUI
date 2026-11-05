import React from 'react';
import { clsx } from 'clsx';
import { GlassButton } from '../../../ui/GlassButton';

/*
 * Rows in the space a protagonist has, which never scrolls and never cuts a row: as many
 * as fit, and a button with how many are left, which opens the page with them all.
 */

export type PanelFitListProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  rows: readonly React.ReactNode[];
  moreLabel: (count: number) => string;
  onMore: () => void;
};

export function PanelFitList({ rows, moreLabel, onMore, className, ...rest }: PanelFitListProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const rowHeight = React.useRef(0);
  const [room, setRoom] = React.useState(Number.POSITIVE_INFINITY);

  React.useLayoutEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const first = node.firstElementChild as HTMLElement | null;
      if (first?.offsetHeight) rowHeight.current = first.offsetHeight;
      if (!rowHeight.current || !node.clientHeight) return;
      const gap = Number.parseFloat(getComputedStyle(node).rowGap) || 0;
      setRoom(Math.floor((node.clientHeight + gap) / (rowHeight.current + gap)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows.length]);

  const fits = rows.length <= room;
  const shown = fits ? rows.length : Math.max(1, room - 1);
  return (
    <div ref={box} className={clsx('panel-fit-list', className)} {...rest}>
      {rows.slice(0, shown)}
      {fits ? null : (
        <GlassButton variant="soft" className="panel-fit-more" onClick={onMore}>
          {moreLabel(rows.length - shown)}
        </GlassButton>
      )}
    </div>
  );
}

export default PanelFitList;
