import React from 'react';
import { clsx } from 'clsx';
import { GlassButton } from '../../../ui/GlassButton';

/*
 * Rows in the space a protagonist has, which never scrolls and never cuts a row: as many
 * as fit. With `moreLabel` the others are a press away, a page at a time; without it they
 * are shown somewhere else, and here they are only left out.
 */

export type PanelFitListProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  rows: readonly React.ReactNode[];
  moreLabel?: (page: number, pages: number) => string;
};

export function PanelFitList({ rows, moreLabel, className, ...rest }: PanelFitListProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const rowHeight = React.useRef(0);
  const [room, setRoom] = React.useState(Number.POSITIVE_INFINITY);
  const [page, setPage] = React.useState(0);

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
  const perPage = fits ? rows.length : moreLabel ? Math.max(1, room - 1) : room;
  const pages = perPage > 0 ? Math.ceil(rows.length / perPage) : 1;
  const current = Math.min(page, pages - 1);

  return (
    <div ref={box} className={clsx('panel-fit-list', className)} {...rest}>
      {rows.slice(current * perPage, (current + 1) * perPage)}
      {!fits && moreLabel ? (
        <GlassButton variant="soft" className="panel-group-action panel-fit-more" onClick={() => setPage((current + 1) % pages)}>
          {moreLabel(current + 1, pages)}
        </GlassButton>
      ) : null}
    </div>
  );
}

export default PanelFitList;
