import type { ReactNode } from 'react';
import { Monitor, Scan, Smartphone, Tablet } from 'lucide-react';
import type { DashboardGridBreakpoint } from '../../types/widgetTypeLayout';
import GlassSegmentSelect, { type GlassSegmentOption } from '../ui/GlassSegmentSelect';
import type { DashboardViewportPreviewMode } from './dashboardViewport';
import { useI18n } from '../../i18n/I18nProvider';

const PREVIEW_ICONS = {
  auto: Scan,
  desktop: Monitor,
  tablet: Tablet,
  compact: Tablet,
  mobile: Smartphone,
} as const;

type DashboardViewportPreviewBarProps = {
  previewMode: DashboardViewportPreviewMode;
  canvasBreakpoint: DashboardGridBreakpoint;
  onPreviewModeChange: (mode: DashboardViewportPreviewMode) => void;
  availableModes?: readonly DashboardViewportPreviewMode[];
  primaryAction?: ReactNode;
  desktopActions?: ReactNode;
};

export function DashboardViewportPreviewBar({
  previewMode,
  canvasBreakpoint,
  onPreviewModeChange,
  availableModes,
  primaryAction,
  desktopActions,
}: DashboardViewportPreviewBarProps) {
  const { t } = useI18n();
  const options: readonly GlassSegmentOption<DashboardViewportPreviewMode>[] = [
    { value: 'auto', label: t('home.preview.auto'), ariaLabel: t('home.preview.autoAria'), title: t('home.preview.autoTitle') },
    { value: 'desktop', label: t('home.preview.desktop'), ariaLabel: t('home.preview.desktopAria'), title: t('home.preview.desktopTitle') },
    { value: 'tablet', label: t('home.preview.tablet'), ariaLabel: t('home.preview.tabletAria'), title: t('home.preview.tabletTitle') },
    { value: 'compact', label: t('home.preview.compact'), ariaLabel: t('home.preview.compactAria'), title: t('home.preview.compactTitle') },
    { value: 'mobile', label: t('home.preview.mobile'), ariaLabel: t('home.preview.mobileAria'), title: t('home.preview.mobileTitle') },
  ];
  const previewOptions = availableModes
    ? options.filter((option) => availableModes.includes(option.value))
    : options;

  return (
    <div
      className="liquid-glass-navigation flex max-w-[calc(100vw-1rem)] items-center gap-1.5 overflow-visible rounded-[1.4rem] p-1.5 shadow-2xl sm:gap-2 sm:rounded-full"
      role="toolbar"
      aria-label={t('home.preview.toolbar')}
    >
      <GlassSegmentSelect
        ariaLabel={t('home.preview.size')}
        options={previewOptions}
        value={previewMode}
        onChange={onPreviewModeChange}
        minOptionWidth="2.25rem"
        className="shrink-0"
        optionClassName="!h-9 !px-2 sm:!px-2.5"
        renderOption={(option) => {
          const Icon = PREVIEW_ICONS[option.value];
          return (
            <span className="flex min-w-0 items-center justify-center gap-1.5">
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${option.value === 'compact' ? 'rotate-90' : ''}`}
                aria-hidden
              />
              <span className="hidden sm:inline">{option.label}</span>
            </span>
          );
        }}
      />

      <span
        className="liquid-glass-control flex h-9 shrink-0 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]"
        aria-label={t('home.preview.breakpointAria', { breakpoint: canvasBreakpoint.toUpperCase() })}
        title={t('home.preview.breakpointTitle')}
      >
        <span className="hidden sm:inline">{t('home.preview.view')}&nbsp;</span>
        <strong className="text-[color:var(--ui-text-primary)]">{canvasBreakpoint.toUpperCase()}</strong>
      </span>

      {primaryAction ? (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-[color:var(--ui-separator)]" />
          <div className="flex min-w-0 items-center">{primaryAction}</div>
        </>
      ) : null}

      {desktopActions ? (
        <>
          <span aria-hidden className="hidden h-5 w-px shrink-0 bg-[color:var(--ui-separator)] lg:block" />
          <div className="hidden min-w-0 items-center lg:flex">{desktopActions}</div>
        </>
      ) : null}
    </div>
  );
}

export default DashboardViewportPreviewBar;
