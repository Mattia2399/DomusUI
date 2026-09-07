import type { ReactNode } from 'react';
import clsx from 'clsx';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { useI18n } from '../../i18n/I18nProvider';

type ContextPanelHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  fallbackTitle?: string;
  className?: string;
  iconClassName?: string;
  subtitleClassName?: string;
};

export function ContextPanelHeader({
  title,
  subtitle,
  icon,
  fallbackTitle,
  className,
  iconClassName,
  subtitleClassName,
}: ContextPanelHeaderProps) {
  const { t } = useI18n();
  const displayTitle = title.trim() || fallbackTitle || t('builder.device');

  return (
    <div className={clsx('context-panel-header', CONTEXT_PANEL_LAYOUT.section, 'mb-1', className)}>
      <div className="flex min-w-0 items-center gap-[clamp(0.8rem,2.6vw,1.05rem)] pr-11">
        <span
          className={clsx(
            'flex h-[clamp(3rem,7.2vw,3.5rem)] w-[clamp(3rem,7.2vw,3.5rem)] shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.12)]',
            iconClassName,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[clamp(1.08rem,3.1vw,1.36rem)] font-semibold leading-[1.08] tracking-tight text-[color:var(--ui-text-primary)] [overflow-wrap:anywhere]">
            {displayTitle}
          </h2>
          {subtitle ? (
            <p className={clsx('mt-1 line-clamp-2 text-[clamp(0.78rem,2vw,0.9rem)] leading-snug', subtitleClassName ?? 'text-[color:var(--ui-text-secondary)]')}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
