import React from 'react';
import { clsx } from 'clsx';
import GlassBottomSheet from '../../ui/GlassBottomSheet';
import GlassModal from '../../ui/GlassModal';
import '../theme/devices.css';

/*
 * Where a device panel opens. The content is the same in all three: from the
 * bottom on a phone, a centred window on a large screen, or a column at the
 * side (defined for the Home, not used yet).
 */

export type PanelPresentation = 'sheet' | 'dialog' | 'side';

export type PanelHostProps = {
  presentation: PanelPresentation;
  isOpen: boolean;
  onClose: () => void;
  /** The name of the panel for assistive technology; the content shows its own header. */
  title: string;
  /** The light's colour, "r g b", to tint the panel with; none for a plain panel. */
  tintRgb?: string | null;
  /** A lighter tint, for devices that are not lights. */
  softTint?: boolean;
  children: React.ReactNode;
};

/** Tints the dialog that holds the content, which the shared modal renders elsewhere. */
function useDialogTint(
  contentRef: React.RefObject<HTMLDivElement | null>,
  tintRgb: string | null | undefined,
  softTint: boolean,
  isOpen: boolean,
) {
  React.useLayoutEffect(() => {
    const dialog = contentRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return undefined;
    if (tintRgb) {
      dialog.style.setProperty('--dv-light-rgb', tintRgb);
      dialog.classList.add('dv-panel-tinted');
      dialog.classList.toggle('dv-panel-tint-soft', softTint);
    } else {
      dialog.classList.remove('dv-panel-tinted', 'dv-panel-tint-soft');
    }
    return () => {
      dialog.classList.remove('dv-panel-tinted', 'dv-panel-tint-soft');
      dialog.style.removeProperty('--dv-light-rgb');
    };
  }, [contentRef, tintRgb, softTint, isOpen]);
}

function SidePanel({ isOpen, onClose, title, tintRgb, softTint = false, children }: Omit<PanelHostProps, 'presentation'>) {
  const titleId = React.useId();
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[260] flex justify-end p-4">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className={clsx(
          'dv-glass pointer-events-auto max-h-full w-96 max-w-full self-start overflow-y-auto rounded-[30px] p-[18px]',
          tintRgb && 'dv-panel-tinted',
          tintRgb && softTint && 'dv-panel-tint-soft',
        )}
        style={tintRgb ? ({ '--dv-light-rgb': tintRgb } as React.CSSProperties) : undefined}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function PanelHost({ presentation, isOpen, onClose, title, tintRgb, softTint = false, children }: PanelHostProps) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  useDialogTint(contentRef, presentation === 'side' ? null : tintRgb, softTint, isOpen);
  const content = (
    <div ref={contentRef} className="dv-panel-frame">
      {children}
    </div>
  );

  if (presentation === 'side') {
    return (
      <SidePanel isOpen={isOpen} onClose={onClose} title={title} tintRgb={tintRgb} softTint={softTint}>
        {content}
      </SidePanel>
    );
  }
  if (presentation === 'sheet') {
    return (
      <GlassBottomSheet isOpen={isOpen} onClose={onClose} title={title} showHeader={false} bodyClassName="!mt-0">
        {content}
      </GlassBottomSheet>
    );
  }
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      showCloseButton={false}
      headerClassName="sr-only"
      bodyClassName="!mt-0"
    >
      {content}
    </GlassModal>
  );
}

export default PanelHost;
