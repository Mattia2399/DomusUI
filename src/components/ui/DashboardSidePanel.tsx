import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import GlassModal from './GlassModal';
import { useI18n } from '../../i18n/I18nProvider';

export type DashboardSidePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  headerAfter?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  zIndex?: number;
  className?: string;
  panelClassName?: string;
  bodyClassName?: string;
};

/**
 * Shared system drawer used by dashboard-level surfaces such as Notifications
 * and Home Attention. On mobile it becomes an edge-to-edge bottom sheet; from
 * md upward it uses the same floating right rail without resizing the canvas.
 */
export function DashboardSidePanel({
  isOpen,
  onClose,
  title,
  eyebrow,
  description,
  headerActions,
  headerAfter,
  children,
  closeLabel,
  zIndex = 260,
  className,
  panelClassName,
  bodyClassName,
}: DashboardSidePanelProps) {
  const { t } = useI18n();
  const resolvedCloseLabel = closeLabel ?? t('common.closePanel');
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton={false}
      zIndex={zIndex}
      className={clsx(
        'items-end justify-center !p-0 md:!items-stretch md:justify-end md:!p-4',
        className,
      )}
      panelClassName={clsx(
        'liquid-glass-panel !max-w-none !rounded-b-none !rounded-t-[2rem] !border-x !border-b-0 !border-t !p-0 md:!h-auto md:!max-h-none md:!w-[min(28rem,calc(100vw-7rem))] md:!rounded-[2rem] md:!border md:shadow-[0_32px_90px_var(--ui-glass-shadow)]',
        panelClassName,
      )}
      headerClassName="sr-only"
      bodyClassName="!mt-0 !overflow-hidden"
      backdropClassName="!bg-[color:var(--ui-scrim)] !backdrop-blur-[2px]"
    >
      <div className="flex max-h-[min(88dvh,52rem)] min-h-0 flex-col md:h-full md:max-h-none">
        <header className="shrink-0 border-b border-[color:var(--ui-border)] px-4 pb-4 pt-5 sm:px-5 md:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className={clsx('text-xl font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]', eyebrow && 'mt-1')}>
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[color:var(--ui-text-secondary)]">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="glass-icon-button h-10 w-10"
                aria-label={resolvedCloseLabel}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {headerAfter ? <div className="mt-4">{headerAfter}</div> : null}
        </header>

        <div
          className={clsx(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] glass-scrollbar md:pb-4',
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
    </GlassModal>
  );
}

export default DashboardSidePanel;
