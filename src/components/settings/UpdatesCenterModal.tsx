import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Clock, DownloadCloud, Loader2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

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
};

type UpdatesCenterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Only the entities with an update available should be passed in. */
  updates: UpdateEntity[];
  isConnected: boolean;
  isBusy: boolean;
  /** update.install — installs the available update. */
  onInstall: (entityId: string) => Promise<boolean>;
  /** update.skip — marks the currently available update as skipped ("Rimanda"). */
  onSkip: (entityId: string) => Promise<boolean>;
  onUpdateAll: () => void;
};

type Pending = { id: string; action: 'install' | 'skip' } | null;

/**
 * "Centro Aggiornamenti" secondary page.
 * Desktop: centered overlay. Mobile: full-screen page with a back arrow.
 * Shows only the components with an update available; tap a card to expand
 * it and reveal the "Rimanda" (update.skip) / "Aggiorna" (update.install) actions.
 * Services follow the official Home Assistant `update` integration (called over
 * the WebSocket API via call_service).
 */
export function UpdatesCenterModal({
  isOpen,
  onClose,
  updates,
  isConnected,
  isBusy,
  onInstall,
  onSkip,
  onUpdateAll,
}: UpdatesCenterModalProps) {
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const runItem = async (id: string, action: 'install' | 'skip') => {
    if (pending) return;
    setItemError(null);
    setPending({ id, action });
    const ok = await (action === 'install' ? onInstall(id) : onSkip(id));
    if (!ok) {
      setPending(null);
      setItemError({
        id,
        message: action === 'install' ? t('settings.updates.installFailed') : t('settings.updates.skipFailed'),
      });
      return;
    }
    setExpandedId(null);
    // For 'skip' the item leaves the list immediately; clear pending now.
    // For 'install' keep pending as a bridge until HA reports progress (effect above).
    if (action === 'skip') setPending(null);
  };

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
            className="liquid-glass-panel relative z-10 flex h-[100dvh] w-full min-h-0 max-w-none flex-col overflow-hidden rounded-none border-0 text-[color:var(--ui-text-primary)] md:h-auto md:max-h-[calc(100dvh-4rem)] md:w-full md:max-w-lg md:rounded-[2rem] md:border"
          >
            {/* Header with back arrow */}
            <div className="shrink-0 border-b border-[color:var(--ui-border)] px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-6 md:pt-6">
              <button
                type="button"
                onClick={onClose}
                className="glass-button min-h-10 w-fit rounded-full px-3 text-xs font-semibold"
              >
                <ArrowLeft size={15} />
                <span className="truncate">{t('settings.updates.back')}</span>
              </button>

              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:var(--ui-border)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)] text-[color:rgb(var(--ui-accent-rgb)/0.9)]">
                  <DownloadCloud size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[color:var(--ui-text-primary)]">{t('settings.updates.title')}</p>
                  <p className="mt-0.5 truncate text-xs text-[color:var(--ui-text-secondary)]">
                    {count > 0
                      ? t(count === 1 ? 'settings.updates.one' : 'settings.updates.many', { count })
                      : t('settings.updates.current')}
                  </p>
                </div>
              </div>
            </div>

            {/* Body: only available updates, each expandable */}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4 sm:px-6">
              {count === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-12 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/12 text-emerald-400">
                    <DownloadCloud size={20} />
                  </span>
                  <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('settings.updates.current')}</p>
                  <p className="text-xs text-[color:var(--ui-text-secondary)]">{t('settings.updates.none')}</p>
                </div>
              ) : (
                updates.map((update) => {
                  const localInstalling = pending?.id === update.entityId && pending.action === 'install';
                  const installing = Boolean(update.inProgress) || localInstalling;
                  const isSkipping = pending?.id === update.entityId && pending.action === 'skip';
                  const anyPending = pending !== null;
                  const isExpanded = expandedId === update.entityId && !installing;
                  const err = itemError?.id === update.entityId ? itemError.message : null;
                  const pct =
                    typeof update.percentage === 'number' ? Math.max(0, Math.min(100, update.percentage)) : null;

                  return (
                    <div
                      key={update.entityId}
                      className="overflow-hidden rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)]"
                    >
                      {installing ? (
                        /* Live install progress (update.in_progress / update_percentage) */
                        <div className="px-3.5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[color:var(--ui-accent)]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{update.title}</p>
                              <p className="truncate text-[11px] text-[color:rgb(var(--ui-accent-rgb)/0.9)]">
                                {pct != null ? t('settings.updates.progressPercent', { value: Math.round(pct) }) : t('settings.updates.progress')}
                              </p>
                            </div>
                            {pct != null ? (
                              <span className="shrink-0 text-xs font-semibold text-[color:rgb(var(--ui-accent-rgb)/0.95)]">
                                {Math.round(pct)}%
                              </span>
                            ) : (
                              <Loader2 size={15} className="shrink-0 animate-spin text-[color:rgb(var(--ui-accent-rgb)/0.9)]" />
                            )}
                          </div>
                          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
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
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedId((current) => (current === update.entityId ? null : update.entityId))}
                            aria-expanded={isExpanded}
                            className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{update.title}</p>
                              <p className="truncate text-[11px] text-[color:var(--ui-text-secondary)]">
                                {update.latest ? `${update.installed || '—'} → ${update.latest}` : update.installed || t('settings.updates.available')}
                              </p>
                            </div>
                            <ChevronDown
                              size={16}
                              className={`shrink-0 text-[color:var(--ui-text-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>

                          <AnimatePresence initial={false}>
                            {isExpanded ? (
                              <motion.div
                                key="body"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-[color:var(--ui-border)] px-3.5 pb-3.5 pt-3">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => runItem(update.entityId, 'skip')}
                                      disabled={!isConnected || anyPending}
                                      className="glass-button flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-semibold disabled:cursor-default disabled:opacity-45"
                                    >
                                      {isSkipping ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                                      {isSkipping ? t('settings.updates.skipping') : t('settings.updates.skip')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => runItem(update.entityId, 'install')}
                                      disabled={!isConnected || anyPending}
                                      className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[color:var(--ui-accent)] text-xs font-semibold text-[color:var(--ui-accent-contrast)] shadow-[0_6px_20px_-6px_rgb(var(--ui-accent-rgb)/0.55)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
                                    >
                                      <DownloadCloud size={14} />
                                      {t('settings.updates.install')}
                                    </button>
                                  </div>
                                  {err ? <p className="mt-2 text-[11px] font-medium text-rose-300">{err}</p> : null}
                                  {!isConnected ? (
                                    <p className="mt-2 text-[11px] text-[color:var(--ui-text-secondary)]">
                                      {t('settings.updates.offline')}
                                    </p>
                                  ) : null}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: bulk action (only when there is something to update) */}
            {count > 0 ? (
              <div className="shrink-0 border-t border-[color:var(--ui-border)] px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 sm:px-6 md:pb-6">
                <button
                  type="button"
                  onClick={onUpdateAll}
                  disabled={!isConnected || isBusy || anyInstalling}
                  className="glass-button flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:cursor-default disabled:opacity-45"
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
