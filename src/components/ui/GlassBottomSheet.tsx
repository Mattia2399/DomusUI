/*
 * Which sheet to use: GlassBottomSheet stays for the existing pages and is not used in new ones.
 * The sheet of the new pages (level 3 and quick actions, inside a PageFrame) is GlassSheet.
 */
import type { ReactNode } from 'react';
import clsx from 'clsx';
import GlassModal from './GlassModal';

export type GlassBottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  position?: 'viewport' | 'container';
  usePortal?: boolean;
  dismissible?: boolean;
  showHeader?: boolean;
  showCloseButton?: boolean;
  zIndex?: number;
  className?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
};

export function GlassBottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  position = 'viewport',
  usePortal = position === 'viewport',
  dismissible = true,
  showHeader = true,
  showCloseButton = false,
  zIndex = 260,
  className,
  panelClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
}: GlassBottomSheetProps) {
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      dismissible={dismissible}
      showCloseButton={showHeader && showCloseButton}
      usePortal={usePortal}
      zIndex={zIndex}
      className={clsx(
        'items-end justify-center !p-2 !pb-[calc(env(safe-area-inset-bottom)+8px)] md:items-center md:!p-6',
        position === 'container' && '!absolute',
        className,
      )}
      panelClassName={clsx(
        '!max-w-none md:!max-w-md',
        panelClassName,
      )}
      headerClassName={clsx(
        showHeader ? undefined : 'sr-only',
        headerClassName,
      )}
      bodyClassName={clsx(showHeader ? undefined : '!mt-0', bodyClassName)}
      footerClassName={clsx('w-full', footerClassName)}
      backdropClassName="!bg-[color:var(--ui-scrim)]"
      footer={footer}
    >
      {children}
    </GlassModal>
  );
}

export default GlassBottomSheet;
