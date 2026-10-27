import type { ReactNode } from 'react';
import clsx from 'clsx';
import GlassModal from './GlassModal';

/*
 * A question to confirm, as on the Rooms board: a round mark, the question,
 * what happens, and two buttons sharing the width — Cancel, and the action
 * in its colour. Escape and the scrim cancel.
 */

export type GlassConfirmTone = 'warning' | 'danger' | 'accent';

export type GlassConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  /** The mark above the question, an icon; its colour follows `iconTone`. */
  icon?: ReactNode;
  iconTone?: GlassConfirmTone;
  /** The colour of the action: red to switch off or delete, the accent to go on. */
  confirmTone?: 'danger' | 'accent' | 'primary';
  busy?: boolean;
  zIndex?: number;
};

const CONFIRM_CLASS = {
  danger: 'glass-button-danger',
  accent: 'glass-button-accent',
  primary: 'glass-button-primary',
} as const;

export function GlassConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  icon,
  iconTone = 'warning',
  confirmTone = 'danger',
  busy = false,
  zIndex,
}: GlassConfirmDialogProps) {
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon ? <span className={clsx('glass-confirm-mark', `is-${iconTone}`)}>{icon}</span> : undefined}
      iconLayout="stacked"
      showCloseButton={false}
      size="md"
      zIndex={zIndex}
      footerClassName="!justify-stretch"
      footer={
        <>
          <button type="button" className="glass-button min-h-11 flex-1" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className={clsx('glass-button min-h-11 flex-1', CONFIRM_CLASS[confirmTone])} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}

export default GlassConfirmDialog;
