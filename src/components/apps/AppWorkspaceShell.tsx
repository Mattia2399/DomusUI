import type { CSSProperties, ReactNode } from 'react';
import { LogOut, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '../../i18n/I18nProvider';

export type AppWorkspaceNavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  placement?: 'primary' | 'footer';
  mobileHidden?: boolean;
};

export type AppWorkspaceShellProps = {
  appName: string;
  appSubtitle?: string;
  appIcon: LucideIcon;
  accentColor?: string;
  navigationItems: readonly AppWorkspaceNavigationItem[];
  activeNavigationId: string;
  onNavigationChange: (id: string) => void;
  onBack: () => void;
  children: ReactNode;
  statusLabel?: string;
  trailing?: ReactNode;
  contentClassName?: string;
  mobileHeaderOverlay?: boolean;
  mobileHeaderHidden?: boolean;
  mobileBackInNavigation?: boolean;
  mobileNavigationHidden?: boolean;
  backLabel?: string;
};

export function AppWorkspaceShell({
  appName,
  appSubtitle,
  appIcon: AppIcon,
  accentColor = 'var(--ui-accent)',
  navigationItems,
  activeNavigationId,
  onNavigationChange,
  onBack,
  children,
  statusLabel,
  trailing,
  contentClassName,
  mobileHeaderOverlay = false,
  mobileHeaderHidden = false,
  mobileBackInNavigation = false,
  mobileNavigationHidden = false,
  backLabel,
}: AppWorkspaceShellProps) {
  const { t } = useI18n();
  const resolvedBackLabel = backLabel ?? t('apps.shell.back');
  const shellStyle = {
    '--app-workspace-accent': accentColor,
  } as CSSProperties;
  const primaryNavigationItems = navigationItems.filter((item) => item.placement !== 'footer');
  const footerNavigationItems = navigationItems.filter((item) => item.placement === 'footer');
  const mobileNavigationItems = navigationItems.filter((item) => !item.mobileHidden);

  const renderDesktopNavigationItem = (item: AppWorkspaceNavigationItem) => {
    const ItemIcon = item.icon;
    const isActive = item.id === activeNavigationId;
    return (
      <button
        key={item.id}
        type="button"
        disabled={item.disabled}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onNavigationChange(item.id)}
        className={clsx(
          'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors 2xl:h-12 2xl:w-12 2xl:rounded-2xl',
          isActive
            ? 'liquid-glass-selection text-[color:var(--app-workspace-accent)]'
            : 'text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)] hover:text-[color:var(--ui-text-primary)]',
          item.disabled && 'cursor-not-allowed opacity-40',
        )}
        title={item.label}
      >
        <ItemIcon
          className={clsx(
            'h-[1.15rem] w-[1.15rem] shrink-0 transition-transform 2xl:h-[1.3rem] 2xl:w-[1.3rem]',
            !isActive && 'group-hover:scale-105',
          )}
          strokeWidth={isActive ? 1.85 : 2}
          fill={isActive ? 'currentColor' : 'none'}
        />
      </button>
    );
  };

  return (
    <section
      data-testid="app-workspace-shell"
      className="relative flex h-full min-h-0 w-full overflow-hidden bg-[color:var(--ui-bg-canvas)] text-[color:var(--ui-text-primary)] md:gap-2.5 md:p-2.5 lg:gap-4 lg:p-4 xl:gap-6 xl:p-5"
      style={shellStyle}
      aria-label={appName}
    >
      <aside
        data-testid="app-workspace-sidebar"
        className="liquid-glass-panel relative z-50 hidden h-full min-h-0 w-[3.75rem] shrink-0 flex-col items-center py-5 md:flex lg:w-[4.25rem] 2xl:w-20 2xl:py-7"
        aria-label={t('apps.shell.sidebar', { app: appName })}
      >
        <div
          className="mb-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] shadow-[var(--ui-shadow-control)] 2xl:mb-10"
          title={appSubtitle ? `${appName} · ${appSubtitle}` : appName}
          aria-label={appSubtitle ? `${appName}, ${appSubtitle}` : appName}
        >
          <AppIcon className="h-[1.15rem] w-[1.15rem] text-[color:var(--app-workspace-accent)] 2xl:h-5 2xl:w-5" strokeWidth={1.9} />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto hide-scrollbar 2xl:gap-6" aria-label={t('apps.shell.navigation', { app: appName })}>
          {primaryNavigationItems.map(renderDesktopNavigationItem)}
        </nav>

        {footerNavigationItems.length > 0 ? (
          <div className="mb-3 flex flex-col items-center gap-3 2xl:mb-4">
            {footerNavigationItems.map(renderDesktopNavigationItem)}
          </div>
        ) : null}

        {statusLabel ? (
          <span
            className="mb-3 h-2 w-2 shrink-0 rounded-full bg-[color:var(--app-workspace-accent)] shadow-[0_0_12px_var(--app-workspace-accent)] 2xl:mb-4"
            title={statusLabel}
            aria-label={statusLabel}
          />
        ) : null}

        <button
          type="button"
          onClick={onBack}
          className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)] hover:text-[color:var(--ui-text-primary)] 2xl:h-12 2xl:w-12 2xl:rounded-2xl"
          aria-label={resolvedBackLabel}
          title={resolvedBackLabel}
        >
          <LogOut className="h-[1.15rem] w-[1.15rem] transition-transform group-hover:translate-x-0.5 2xl:h-5 2xl:w-5" />
        </button>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!mobileHeaderHidden ? <header
          className={clsx(
            'z-30 flex min-h-[calc(env(safe-area-inset-top)+4.5rem)] shrink-0 items-center gap-3 px-3 pt-[env(safe-area-inset-top)] md:hidden',
            mobileHeaderOverlay
              ? 'absolute inset-x-0 top-0 bg-gradient-to-b from-black/45 via-black/15 to-transparent text-white'
              : 'liquid-glass-navigation relative rounded-none border-x-0 border-t-0',
          )}
        >
          {!mobileBackInNavigation ? <button
            type="button"
            onClick={onBack}
            className={clsx(
              'liquid-glass-control flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              mobileHeaderOverlay && '!border-white/25 !bg-black/20 !text-white',
            )}
            aria-label={resolvedBackLabel}
          >
            <LogOut className="h-[1.1rem] w-[1.1rem]" />
          </button> : null}
          <span className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border',
            mobileHeaderOverlay ? 'border-white/25 bg-black/20' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)]',
          )}>
            <AppIcon className={clsx('h-[1.1rem] w-[1.1rem]', mobileHeaderOverlay ? 'text-white' : 'text-[color:var(--app-workspace-accent)]')} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.95rem] font-semibold tracking-[-0.02em]">{appName}</span>
            {appSubtitle ? (
              <span className={clsx('block truncate text-[11px]', mobileHeaderOverlay ? 'text-white/70' : 'text-[color:var(--ui-text-secondary)]')}>{appSubtitle}</span>
            ) : null}
          </span>
          {trailing ? <span className="shrink-0">{trailing}</span> : null}
        </header> : null}

        <main
          className={clsx(
            'min-h-0 flex-1 overflow-y-auto custom-scrollbar md:pb-0',
            mobileNavigationHidden
              ? 'pb-[env(safe-area-inset-bottom)]'
              : 'pb-[calc(env(safe-area-inset-bottom)+5.75rem)]',
            contentClassName,
          )}
        >
          {children}
        </main>

        {!mobileNavigationHidden ? <nav className="liquid-glass-navigation absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.65rem)] z-30 grid min-h-14 grid-flow-col auto-cols-fr rounded-[1.35rem] p-1.5 md:hidden" aria-label={t('apps.shell.navigation', { app: appName })}>
          {mobileNavigationItems.map((item) => {
            const ItemIcon = item.icon;
            const isActive = item.id === activeNavigationId;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigationChange(item.id)}
                className={clsx(
                  'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1.5 text-[10px] font-semibold transition-all',
                  isActive
                    ? 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--app-workspace-accent)] shadow-[var(--ui-shadow-control)]'
                    : 'text-[color:var(--ui-text-secondary)]',
                  item.disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <ItemIcon className="h-[1.05rem] w-[1.05rem]" strokeWidth={2} />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
          {mobileBackInNavigation ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={resolvedBackLabel}
              className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1.5 text-[10px] font-semibold text-[color:var(--ui-text-secondary)] transition-all active:scale-95"
            >
              <LogOut className="h-[1.05rem] w-[1.05rem]" strokeWidth={2} />
              <span className="max-w-full truncate">{t('apps.shell.library')}</span>
            </button>
          ) : null}
        </nav> : null}
      </div>
    </section>
  );
}

export default AppWorkspaceShell;
