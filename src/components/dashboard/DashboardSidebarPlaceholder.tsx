import { Lightbulb } from 'lucide-react';
import DeferredGlassLoader from '../ui/DeferredGlassLoader';
import { useI18n } from '../../i18n/I18nProvider';

export const DASHBOARD_SIDEBAR_WIDTH_CLASS =
  'w-[clamp(17.5rem,46vw,22.5rem)] md:w-[clamp(18rem,34vw,24rem)] lg:w-[clamp(18rem,28vw,23rem)] xl:w-[clamp(18.5rem,25vw,24rem)] h-full min-h-0 shrink-0';

type DashboardSidebarPlaceholderProps = {
  isCompactViewport: boolean;
  loading?: boolean;
};

export function DashboardSidebarPlaceholder({
  isCompactViewport,
  loading = false,
}: DashboardSidebarPlaceholderProps) {
  const { t } = useI18n();
  if (isCompactViewport) {
    return loading ? (
      <DeferredGlassLoader
        label={t('home.sidebar.opening')}
        description={t('home.sidebar.loadingDescription')}
        overlay
      />
    ) : null;
  }

  return (
    <div
      className={`liquid-glass-panel ${DASHBOARD_SIDEBAR_WIDTH_CLASS} overflow-hidden`}
      aria-busy={loading || undefined}
    >
      <aside className="context-sidebar relative h-full min-h-0 w-full shrink-0 overflow-hidden">
        {loading ? (
          <DeferredGlassLoader
            label={t('home.sidebar.opening')}
            description={t('home.sidebar.loadingDescription')}
          />
        ) : (
          <div className="context-content-surface flex h-full min-h-0 items-center justify-center rounded-[2rem] p-8 text-center">
            <div>
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
                <Lightbulb size={22} />
              </span>
              <p className="text-lg font-semibold text-[color:var(--ui-text-primary)]">
                {t('home.sidebar.empty')}
              </p>
              <p className="mt-2 text-sm text-[color:var(--ui-text-secondary)]">
                {t('home.sidebar.emptyDescription')}
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
