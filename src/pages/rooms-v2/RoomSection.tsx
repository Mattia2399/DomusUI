import React from 'react';
import { ChevronRight } from 'lucide-react';
import { buildSectionPreview, type SectionItem } from '../../components/devices/model/sectionRules';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useI18n } from '../../i18n/I18nProvider';

/** Context a section gives each of its cards. */
export type SectionCardContext = { editing: boolean; selected: boolean; onSelect: () => void };

/**
 * A section of the room: title and count, a quick action, and a preview of
 * four by the section rules, with a "+N" card for the rest. The cards are the
 * caller's; the section only orders and places them.
 */
export function RoomSection<T extends SectionItem>({
  id,
  title,
  items,
  count,
  moreLabel,
  action,
  renderCard,
  onOpenPage,
  testId,
}: {
  id: string;
  title: string;
  items: T[];
  /** "3/6" for things that turn on, or just how many. */
  count: string;
  moreLabel: string;
  action?: { label: string; onPress: () => void } | null;
  renderCard: (item: T, context: SectionCardContext) => React.ReactNode;
  onOpenPage: () => void;
  testId?: string;
}) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  if (items.length === 0) return null;
  const preview = buildSectionPreview(items, locale);
  const titleId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id={titleId} className="m-0 text-[21px] font-bold tracking-[-0.02em]">
          <button
            type="button"
            className="rv2-title-button"
            onClick={onOpenPage}
            aria-label={dt('showAllIn', { section: title, count: items.length })}
          >
            {title}
            <span className="dv-t3 font-semibold">{count}</span>
            <span className="dv-t3 flex" aria-hidden="true">
              <ChevronRight size={16} strokeWidth={2.4} />
            </span>
          </button>
        </h2>
        {action ? (
          <button type="button" className="dv-glass rv2-pill" onClick={action.onPress}>
            {action.label}
          </button>
        ) : null}
      </div>
      {preview.allHidden ? (
        <button
          type="button"
          className="dv-glass dv-t2 flex min-h-[52px] items-center justify-between rounded-[18px] px-4 text-left text-sm font-semibold"
          onClick={onOpenPage}
        >
          {preview.hiddenCount === 1 ? dt('hiddenOne') : dt('hiddenMany', { count: preview.hiddenCount })}
          <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" className="dv-t3" />
        </button>
      ) : (
        <div className="rv2-grid">
          {preview.items.map((item) => (
            <React.Fragment key={item.id}>{renderCard(item, { editing: false, selected: false, onSelect: () => undefined })}</React.Fragment>
          ))}
          {preview.more > 0 ? (
            <button
              type="button"
              className="rv2-more"
              onClick={onOpenPage}
              aria-label={dt('showMore', { section: title, count: preview.more })}
            >
              <span className="rv2-more-count">+{preview.more}</span>
              <span className="text-[15px] font-semibold">{moreLabel}</span>
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default RoomSection;
