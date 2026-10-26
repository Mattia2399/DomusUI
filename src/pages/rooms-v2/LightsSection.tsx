import { ChevronRight } from 'lucide-react';
import { LightCard } from '../../components/devices/cards/LightCard';
import type { LightAction, LightModel } from '../../components/devices/model/light';
import { buildSectionPreview, type SectionItem } from '../../components/devices/model/sectionRules';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useI18n } from '../../i18n/I18nProvider';

export type RoomLightItem = SectionItem & { model: LightModel };

/** The lights of the room: title and count, "turn all off", and a preview of four. */
export function LightsSection({
  items,
  onAction,
  onOpenPanel,
  onOpenPage,
  onTurnOffAll,
}: {
  items: RoomLightItem[];
  onAction: (entityId: string, action: LightAction) => void;
  onOpenPanel: (entityId: string) => void;
  onOpenPage: () => void;
  onTurnOffAll: () => void;
}) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  if (items.length === 0) return null;
  const preview = buildSectionPreview(items, locale);
  const lit = items.filter((item) => item.model.on && item.model.available).length;
  const title = dt('lights');

  return (
    <section id="rv2-lights" aria-labelledby="rv2-lights-title" className="flex min-w-0 flex-col gap-3" data-testid="rooms-v2-lights">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="rv2-lights-title" className="m-0 text-[21px] font-bold tracking-[-0.02em]">
          <button
            type="button"
            className="rv2-title-button"
            onClick={onOpenPage}
            aria-label={dt('showAllIn', { section: title, count: items.length })}
          >
            {title}
            <span className="dv-t3 font-semibold">
              {lit}/{items.length}
            </span>
            <span className="dv-t3 flex" aria-hidden="true">
              <ChevronRight size={16} strokeWidth={2.4} />
            </span>
          </button>
        </h2>
        {lit > 0 ? (
          <button type="button" className="dv-glass rv2-pill" onClick={onTurnOffAll}>
            {dt('lightsOff')}
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
            <LightCard
              key={item.id}
              model={item.model}
              format="U×2"
              onAction={(action) => onAction(item.id, action)}
              onOpenPanel={() => onOpenPanel(item.id)}
            />
          ))}
          {preview.more > 0 ? (
            <button
              type="button"
              className="rv2-more"
              onClick={onOpenPage}
              aria-label={dt('showMore', { section: title, count: preview.more })}
            >
              <span className="rv2-more-count">+{preview.more}</span>
              <span className="text-[15px] font-semibold">{dt('moreLights')}</span>
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default LightsSection;
