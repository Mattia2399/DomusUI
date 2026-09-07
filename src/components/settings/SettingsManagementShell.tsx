import type { ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

type SettingsManagementShellProps = {
  presentation?: 'overlay' | 'embedded';
  isCompactViewport: boolean;
  showMenuOnCompact: boolean;
  showDetailOnCompact: boolean;
  menuTitle: string;
  menuSubtitle: string;
  detailTitle: string;
  detailSubtitle: string;
  displayName: string;
  displayEmail: string;
  displayRole: string;
  avatarSrc: string;
  avatarAlt: string;
  onAvatarError: () => void;
  onBack: () => void;
  onClose: () => void;
  navigation: ReactNode;
  children: ReactNode;
};

function ProfileIdentity({
  compact = false,
  displayName,
  displayEmail,
  displayRole,
  avatarSrc,
  avatarAlt,
  onAvatarError,
}: Pick<
  SettingsManagementShellProps,
  | 'displayName'
  | 'displayEmail'
  | 'displayRole'
  | 'avatarSrc'
  | 'avatarAlt'
  | 'onAvatarError'
> & {
  compact?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        compact
          ? 'rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-3 shadow-[0_14px_30px_var(--ui-shadow-soft)]'
          : 'px-1 py-2'
      }`}
    >
      <span
        className={`relative shrink-0 overflow-hidden rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-surface-glass-strong)] shadow-[0_12px_28px_var(--ui-shadow)] ${
          compact ? 'h-14 w-14' : 'h-12 w-12'
        }`}
      >
        <img
          src={avatarSrc}
          alt={avatarAlt}
          onError={onAvatarError}
          className="h-full w-full object-cover"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem] font-semibold tracking-[-0.012em] text-[color:var(--ui-text-primary)]">
          {displayName}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">
          {displayEmail}
        </span>
        <span className="mt-1 inline-flex rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">
          {displayRole}
        </span>
      </span>
    </div>
  );
}

export function SettingsManagementShell({
  presentation = 'overlay',
  isCompactViewport,
  showMenuOnCompact,
  showDetailOnCompact,
  menuTitle,
  menuSubtitle,
  detailTitle,
  detailSubtitle,
  displayName,
  displayEmail,
  displayRole,
  avatarSrc,
  avatarAlt,
  onAvatarError,
  onBack,
  onClose,
  navigation,
  children,
}: SettingsManagementShellProps) {
  const { t } = useI18n();
  const avatarLabel = avatarAlt ? t('settings.management.profile', { name: avatarAlt }) : t('settings.management.userProfile');

  if (presentation === 'embedded') {
    return <div className="w-full text-[color:var(--ui-text-primary)]">{children}</div>;
  }

  if (isCompactViewport) {
    return (
      <div className="fixed inset-0 z-[220] flex h-[100dvh] flex-col overflow-hidden bg-[var(--ui-page-bg)] text-[color:var(--ui-text-primary)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--ui-separator)] bg-[color:var(--ui-surface-glass-soft)] px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.65rem)] backdrop-blur-3xl">
          <button
            type="button"
            onClick={onBack}
            className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] transition-transform active:scale-[0.96]"
            aria-label={showDetailOnCompact ? t('settings.management.backTo', { title: menuTitle }) : t('settings.management.backDashboard')}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">
              {showDetailOnCompact ? detailSubtitle : menuSubtitle}
            </p>
            <h2 className="truncate text-[1.05rem] font-semibold tracking-[-0.015em]">
              {showDetailOnCompact ? detailTitle : menuTitle}
            </h2>
          </div>
        </header>

        {showMenuOnCompact ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
            <ProfileIdentity
              compact
              displayName={displayName}
              displayEmail={displayEmail}
              displayRole={displayRole}
              avatarSrc={avatarSrc}
              avatarAlt={avatarLabel}
              onAvatarError={onAvatarError}
            />
            <p className="mb-2 mt-6 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">
              {t('settings.management.sections')}
            </p>
            {navigation}
          </div>
        ) : null}

        {showDetailOnCompact ? (
          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
            {children}
          </main>
        ) : null}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[220] overflow-hidden">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--ui-scrim)] backdrop-blur-lg"
        aria-label={t('settings.management.closeSettings')}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5 lg:p-8">
        <section className="liquid-glass-panel pointer-events-auto grid h-[min(90dvh,840px)] w-full max-w-[1160px] grid-cols-[18.5rem_minmax(0,1fr)] overflow-hidden rounded-[2.35rem] border border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-primary)] shadow-[0_36px_100px_var(--ui-shadow)]">
          <aside className="flex min-h-0 flex-col border-r border-[color:var(--ui-separator)] bg-[color:var(--ui-surface-glass-soft)] p-4 backdrop-blur-3xl lg:p-5">
            <ProfileIdentity
              displayName={displayName}
              displayEmail={displayEmail}
              displayRole={displayRole}
              avatarSrc={avatarSrc}
              avatarAlt={avatarLabel}
              onAvatarError={onAvatarError}
            />
            <p className="mb-1 mt-6 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">
              {menuTitle}
            </p>
            <nav className="min-h-0 flex-1 overflow-y-auto pb-3" aria-label={menuTitle}>
              {navigation}
            </nav>
            <p className="border-t border-[color:var(--ui-separator)] px-2 pt-4 text-[11px] leading-5 text-[color:var(--ui-text-secondary)]">
              {t('settings.management.permissionsNote')}
            </p>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col bg-[color:var(--ui-bg-elevated)]">
            <header className="flex shrink-0 items-start justify-between gap-5 border-b border-[color:var(--ui-separator)] px-7 py-5 lg:px-9">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">
                  {detailSubtitle}
                </p>
                <h2 className="mt-1 truncate text-[clamp(1.45rem,2.2vw,2rem)] font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)]">
                  {detailTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] transition-transform hover:brightness-110 active:scale-[0.96]"
                aria-label={t('settings.management.close')}
              >
                <X size={18} />
              </button>
            </header>
            <main className="min-h-0 flex-1 overflow-y-auto px-7 py-6 lg:px-9 lg:py-7">
              <div className="mx-auto w-full max-w-[46rem]">{children}</div>
            </main>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsManagementShell;
