import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CircleCheck, DownloadCloud, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import GlassToggle from '../ui/GlassToggle';
import { SettingsListGroup } from './SettingsList';

export type UpdateEntity = {
  entityId: string;
  title: string;
  available: boolean;
  installed?: string | null;
  latest?: string | null;
  /** true while HA reports the update as installing. */
  inProgress?: boolean;
  /** install progress 0–100, or null/undefined when not reported. */
  percentage?: number | null;
  /** `release_summary`: a short text about the new version. */
  releaseSummary?: string | null;
  /** `release_url`: the page with the full release notes. */
  releaseUrl?: string | null;
  /** `entity_picture`, already resolved to a loadable URL. */
  picture?: string | null;
  /** The entity supports `backup: true` on `update.install`. */
  supportsBackup?: boolean;
  /** `skipped_version`, when this version was skipped. */
  skippedVersion?: string | null;
};

export type UpdateInstallOptions = { backup?: boolean };

type UpdatesCenterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The entities with an update available. */
  updates: UpdateEntity[];
  /** The entities whose latest version was skipped. */
  skipped?: UpdateEntity[];
  isConnected: boolean;
  isBusy: boolean;
  /** update.install — installs the available update, optionally after a backup. */
  onInstall: (entityId: string, options?: UpdateInstallOptions) => Promise<boolean>;
  /** update.skip — skips the version available now. */
  onSkip: (entityId: string) => Promise<boolean>;
  /** update.clear_skipped — offers a skipped version again. */
  onClearSkipped?: (entityId: string) => Promise<boolean>;
  onUpdateAll: () => void;
};

type Pending = { id: string; action: 'install' | 'skip' | 'restore' } | null;

const PILL =
  'inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45';

function UpdateIcon({ picture, tone }: { picture?: string | null; tone: 'warning' | 'neutral' }) {
  const [failed, setFailed] = useState(false);
  if (picture && !failed) {
    return (
      <img
        src={picture}
        alt=""
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] object-contain p-1.5"
      />
    );
  }
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border ${
        tone === 'warning'
          ? 'border-amber-400/25 bg-amber-500/10 text-amber-500'
          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
      }`}
    >
      <DownloadCloud size={17} />
    </span>
  );
}

/**
 * The update center, in the grouped style of the settings pages: every
 * component with an update has its own "Aggiorna" button and, when opened,
 * its release notes, a backup before installing and "skip this version".
 * Skipped versions can be offered again. Services follow the Home Assistant
 * `update` integration (install, skip, clear_skipped).
 */
export function UpdatesCenterModal({
  isOpen,
  onClose,
  updates,
  skipped = [],
  isConnected,
  isBusy,
  onInstall,
  onSkip,
  onClearSkipped,
  onUpdateAll,
}: UpdatesCenterModalProps) {
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [backupById, setBackupById] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Pending>(null);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  // Reset transient state whenever the page is closed.
  useEffect(() => {
    if (!isOpen) {
      setExpandedId(null);
      setPending(null);
      setItemError(null);
    }
  }, [isOpen]);

  // Bridge the gap between "install call sent" and HA reporting `in_progress`:
  // once the entity is actually installing (or has left the list), drop the
  // local pending flag and let the live progress drive the UI.
  useEffect(() => {
    if (pending?.action !== 'install') return;
    const entity = updates.find((update) => update.entityId === pending.id);
    if (!entity || entity.inProgress) setPending(null);
  }, [updates, pending]);

  if (typeof document === 'undefined') return null;

  const count = updates.length;
  const anyInstalling = pending?.action === 'install' || updates.some((update) => update.inProgress);

  const runItem = async (id: string, action: 'install' | 'skip' | 'restore') => {
    if (pending) return;
    setItemError(null);
    setPending({ id, action });
    const ok =
      action === 'install'
        ? await onInstall(id, backupById[id] ? { backup: true } : undefined)
        : action === 'skip'
          ? await onSkip(id)
          : await (onClearSkipped?.(id) ?? Promise.resolve(false));
    if (!ok) {
      setPending(null);
      setItemError({
        id,
        message:
          action === 'install'
            ? t('settings.updates.installFailed')
            : action === 'skip'
              ? t('settings.updates.skipFailed')
              : t('settings.updates.restoreFailed'),
      });
      return;
    }
    setExpandedId(null);
    // A skipped or restored item moves list at once; an install waits for HA's progress.
    if (action !== 'install') setPending(null);
  };

  const versions = (update: UpdateEntity) =>
    update.latest ? `${update.installed || '—'} → ${update.latest}` : update.installed || t('settings.updates.available');

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[200] flex items-stretch justify-stretch p-0 md:items-center md:justify-center md:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            aria-hidden="true"
            onClick={onClose}
            className="absolute inset-0 bg-[color:var(--ui-scrim)] backdrop-blur-2xl"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('settings.updates.title')}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="liquid-glass-panel relative z-10 flex h-[100dvh] w-full min-h-0 max-w-none flex-col overflow-hidden rounded-none border-0 text-[color:var(--ui-text-primary)] md:h-auto md:max-h-[calc(100dvh-4rem)] md:w-full md:max-w-xl md:rounded-[2rem] md:border"
          >
            <div className="shrink-0 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-6 md:pt-6">
              <button
                type="button"
                onClick={onClose}
                className="glass-button min-h-10 w-fit rounded-full px-3 text-xs font-semibold"
              >
                <ArrowLeft size={15} />
                <span className="truncate">{t('settings.updates.back')}</span>
              </button>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--ui-text-primary)]">
                {t('settings.updates.title')}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">
                {count > 0
                  ? t(count === 1 ? 'settings.updates.one' : 'settings.updates.many', { count })
                  : t('settings.updates.current')}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-3 sm:px-6">
              {count === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/12 text-emerald-500">
                    <CircleCheck size={26} />
                  </span>
                  <p className="mt-1 text-base font-semibold text-[color:var(--ui-text-primary)]">{t('settings.updates.current')}</p>
                  <p className="text-sm text-[color:var(--ui-text-secondary)]">{t('settings.updates.none')}</p>
                </div>
              ) : (
                <SettingsListGroup title={t('settings.updates.group.available')}>
                  {updates.map((update) => {
                    const localInstalling = pending?.id === update.entityId && pending.action === 'install';
                    const installing = Boolean(update.inProgress) || localInstalling;
                    const isSkipping = pending?.id === update.entityId && pending.action === 'skip';
                    const anyPending = pending !== null;
                    const isExpanded = expandedId === update.entityId && !installing;
                    const err = itemError?.id === update.entityId ? itemError.message : null;
                    const pct =
                      typeof update.percentage === 'number' ? Math.max(0, Math.min(100, update.percentage)) : null;
                    const detailsId = `update-details-${update.entityId}`;

                    return (
                      <div key={update.entityId} data-update={update.entityId}>
                        <div className="flex min-h-[4.4rem] items-center gap-3 px-4 py-3">
                          <UpdateIcon picture={update.picture} tone="warning" />
                          <button
                            type="button"
                            onClick={() => setExpandedId((current) => (current === update.entityId ? null : update.entityId))}
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            disabled={installing}
                            className="min-w-0 flex-1 text-left disabled:cursor-default"
                          >
                            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
                              {update.title}
                            </span>
                            <span
                              className={`mt-0.5 block truncate text-xs leading-5 ${
                                installing ? 'text-[color:rgb(var(--ui-accent-rgb)/0.95)]' : 'text-[color:var(--ui-text-secondary)]'
                              }`}
                            >
                              {installing
                                ? pct != null
                                  ? t('settings.updates.progressPercent', { value: Math.round(pct) })
                                  : t('settings.updates.progress')
                                : versions(update)}
                            </span>
                          </button>
                          {installing ? (
                            pct != null ? (
                              <span className="shrink-0 text-xs font-semibold tabular-nums text-[color:rgb(var(--ui-accent-rgb)/0.95)]">
                                {Math.round(pct)}%
                              </span>
                            ) : (
                              <Loader2 size={16} className="shrink-0 animate-spin text-[color:rgb(var(--ui-accent-rgb)/0.9)]" />
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => runItem(update.entityId, 'install')}
                              disabled={!isConnected || anyPending}
                              aria-label={`${t('settings.updates.install')} ${update.title}`}
                              className={`${PILL} bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)] hover:opacity-90`}
                            >
                              {t('settings.updates.install')}
                            </button>
                          )}
                        </div>

                        {installing ? (
                          <div className="px-4 pb-3.5 pl-[4.25rem]">
                            <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--ui-separator)]">
                              {pct != null ? (
                                <div
                                  className="h-full rounded-full bg-[color:var(--ui-accent)] transition-[width] duration-500 ease-out"
                                  style={{ width: `${pct}%` }}
                                />
                              ) : (
                                <div className="h-full w-1/2 rounded-full bg-[color:var(--ui-accent)] animate-[alarm-progress_1.4s_ease-in-out_infinite]" />
                              )}
                            </div>
                          </div>
                        ) : null}

                        <AnimatePresence initial={false}>
                          {isExpanded ? (
                            <motion.div
                              key="details"
                              id={detailsId}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-3 px-4 pb-4 pl-[4.25rem]">
                                {update.releaseSummary ? (
                                  <p className="line-clamp-6 whitespace-pre-line text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                                    {update.releaseSummary}
                                  </p>
                                ) : null}
                                {update.releaseUrl ? (
                                  <a
                                    href={update.releaseUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--ui-accent)] hover:opacity-80"
                                  >
                                    {t('settings.updates.releaseNotes')}
                                    <ExternalLink size={12} aria-hidden="true" />
                                  </a>
                                ) : null}
                                {update.supportsBackup ? (
                                  <div className="flex items-center justify-between gap-3 rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5">
                                    <span className="min-w-0">
                                      <span className="block text-xs font-semibold text-[color:var(--ui-text-primary)]">
                                        {t('settings.updates.backupFirst')}
                                      </span>
                                      <span className="block text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">
                                        {t('settings.updates.backupFirstHint')}
                                      </span>
                                    </span>
                                    <GlassToggle
                                      size="compact"
                                      checked={Boolean(backupById[update.entityId])}
                                      onChange={(value) => setBackupById((current) => ({ ...current, [update.entityId]: value }))}
                                      label={t('settings.updates.backupFirst')}
                                    />
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => runItem(update.entityId, 'skip')}
                                  disabled={!isConnected || anyPending}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  {isSkipping ? <Loader2 size={13} className="animate-spin" /> : null}
                                  {isSkipping ? t('settings.updates.skipping') : t('settings.updates.skipVersion')}
                                </button>
                                {!isConnected ? (
                                  <p className="text-[11px] text-[color:var(--ui-text-secondary)]">{t('settings.updates.offline')}</p>
                                ) : null}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                        {err ? (
                          <p role="alert" className="px-4 pb-3 pl-[4.25rem] text-[11px] font-medium text-[color:var(--ui-danger)]">
                            {err}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </SettingsListGroup>
              )}

              {skipped.length > 0 ? (
                <SettingsListGroup title={t('settings.updates.group.skipped')}>
                  {skipped.map((update) => {
                    const isRestoring = pending?.id === update.entityId && pending.action === 'restore';
                    const err = itemError?.id === update.entityId ? itemError.message : null;
                    return (
                      <div key={update.entityId} data-skipped={update.entityId}>
                        <div className="flex min-h-[4.4rem] items-center gap-3 px-4 py-3">
                          <UpdateIcon picture={update.picture} tone="neutral" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
                              {update.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                              {t('settings.updates.skippedVersion', { version: update.skippedVersion || update.latest || '—' })}
                            </span>
                          </span>
                          {onClearSkipped ? (
                            <button
                              type="button"
                              onClick={() => runItem(update.entityId, 'restore')}
                              disabled={!isConnected || pending !== null}
                              aria-label={`${t('settings.updates.restore')} ${update.title}`}
                              className={`${PILL} border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] hover:opacity-80`}
                            >
                              {isRestoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                              {t('settings.updates.restore')}
                            </button>
                          ) : null}
                        </div>
                        {err ? (
                          <p role="alert" className="px-4 pb-3 pl-[4.25rem] text-[11px] font-medium text-[color:var(--ui-danger)]">
                            {err}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </SettingsListGroup>
              ) : null}
            </div>

            {count > 1 ? (
              <div className="shrink-0 border-t border-[color:var(--ui-separator)] px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 sm:px-6 md:pb-6">
                <button
                  type="button"
                  onClick={onUpdateAll}
                  disabled={!isConnected || isBusy || anyInstalling}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--ui-accent)] text-sm font-semibold text-[color:var(--ui-accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <DownloadCloud size={16} />
                  {t('settings.updates.installAll', { count })}
                </button>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default UpdatesCenterModal;
