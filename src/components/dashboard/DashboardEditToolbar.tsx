import { Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import type { DashboardLayoutSaveStatus } from '../../hooks/useDashboardLayoutPersistence';
import { DashboardSaveIndicator } from './DashboardSaveIndicator';
import { useI18n } from '../../i18n/I18nProvider';

type DashboardEditToolbarProps = {
  saveStatus: DashboardLayoutSaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  embedded?: boolean;
  remoteRevision?: number | null;
  onRemoteUpdateClick?: () => void;
};

export function DashboardEditToolbar({
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  embedded = false,
  remoteRevision = null,
  onRemoteUpdateClick,
}: DashboardEditToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${embedded ? '' : 'liquid-glass-control shadow-xl'} flex min-h-11 items-center rounded-full p-1`}
        role={embedded ? 'group' : 'toolbar'}
        aria-label={t('dashboard.history')}
      >
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex min-h-9 min-w-11 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('common.undo')}
          title={t('dashboard.undo.title')}
        >
          <Undo2 size={15} aria-hidden />
        </button>
        <span aria-hidden className="h-4 w-px bg-[color:var(--ui-separator)]" />
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex min-h-9 min-w-11 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('common.redo')}
          title={t('dashboard.redo.title')}
        >
          <Redo2 size={15} aria-hidden />
        </button>
      </div>
      <DashboardSaveIndicator status={saveStatus} embedded={embedded} />
      {remoteRevision !== null ? (
        <button
          type="button"
          onClick={onRemoteUpdateClick}
          className={`${embedded ? 'bg-amber-500/12' : 'liquid-glass-control shadow-xl'} flex min-h-11 items-center gap-2 rounded-full px-3 text-amber-500 transition hover:brightness-110 active:scale-[0.98]`}
          aria-label={t('dashboard.remoteVersion.aria', { revision: remoteRevision })}
        >
          <TriangleAlert size={15} aria-hidden />
          <span className="hidden whitespace-nowrap text-xs font-semibold sm:inline">
            {t('dashboard.remoteVersion.label', { revision: remoteRevision })}
          </span>
          <span className="text-xs font-semibold sm:hidden">v{remoteRevision}</span>
        </button>
      ) : null}
    </div>
  );
}
