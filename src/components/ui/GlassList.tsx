import { useId, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import './pageKit.css';
import './glassListRow.css';
import './glassList.css';

export type GlassListProps = {
  /** The rows: GlassListRow, with iconShape="square". Nothing interactive inside a row. */
  children: ReactNode;
  /** The title of the section (22 px, 700). */
  title?: ReactNode;
  /** Beside the title, small: "tutte chiuse", "2 aperte". */
  detail?: ReactNode;
  /** A small capital caption over the block, as in the Settings. Instead of a title. */
  caption?: ReactNode;
  /** "Tutte ›": opens the whole list as a subpage. */
  more?: { label: string; onPress: () => void };
  /** "Tutti i sensori · 12 ›": a last row inside the block, in the colour of the function, that opens the whole list. */
  allRow?: { label: string; count?: ReactNode; onPress: () => void };
  /** A note under the block. */
  footer?: ReactNode;
  headingLevel?: 2 | 3;
  /** Spoken name of the block when it has no title. */
  ariaLabel?: string;
  className?: string;
};

/**
 * A group of rows in one block of glass, with separators inside: the lists of the new pages.
 * docs/design/app/sicurezza.html (.sec, .list, .li) and impostazioni.html (.gr, .cap, .foot).
 */
export function GlassList({ children, title, detail, caption, more, allRow, footer, headingLevel = 2, ariaLabel, className }: GlassListProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const titleId = useId();
  const hasHead = Boolean(title || detail || more);
  return (
    <section className={clsx('glass-list-group', className)} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : ariaLabel}>
      {hasHead ? (
        <div className="glass-list-head">
          {title ? (
            <Heading id={titleId} className="glass-list-title">
              {title}
            </Heading>
          ) : null}
          {detail ? <span className="glass-list-detail">{detail}</span> : null}
          {more ? (
            <button type="button" className="glass-list-more" onClick={more.onPress}>
              {more.label}
              <ChevronRight size={17} strokeWidth={2.4} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {caption ? <span className="glass-list-caption">{caption}</span> : null}
      <div className="glass-list page-glass">
        {children}
        {allRow ? (
          <button type="button" className="glass-list-row glass-list-all" onClick={allRow.onPress}>
            <span className="glass-list-row-text">
              <b>{allRow.label}</b>
            </span>
            {allRow.count !== undefined ? <em>{allRow.count}</em> : null}
            <ChevronRight className="glass-list-row-opens" size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {footer ? <p className="glass-list-footer">{footer}</p> : null}
    </section>
  );
}

export default GlassList;
