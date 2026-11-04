import React from 'react';
import { clsx } from 'clsx';
import { PanelSheet } from './shell/PanelSheet';
import { PanelSurfaceContext } from './shell/panelSurface';
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
  /** On a phone: a short sheet, as tall as what it holds, that is not a device panel. */
  fitContent?: boolean;
  /** A panel of two columns in the dialog, instead of a form. */
  wide?: boolean;
  children: React.ReactNode;
};

function SidePanel({ isOpen, onClose, title, children }: Omit<PanelHostProps, 'presentation'>) {
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
        )}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function PanelHost({ presentation, isOpen, onClose, title, fitContent = false, wide = false, children }: PanelHostProps) {
  const content = (
    <PanelSurfaceContext.Provider value={presentation === 'side' ? 'column' : presentation}>
      <div className="dv-panel-frame">
        {children}
      </div>
    </PanelSurfaceContext.Provider>
  );

  if (presentation === 'side') {
    return (
      <SidePanel isOpen={isOpen} onClose={onClose} title={title}>
        {content}
      </SidePanel>
    );
  }
  if (presentation === 'sheet') {
    return (
      <PanelSheet isOpen={isOpen} onClose={onClose} title={title} fitContent={fitContent}>
        {content}
      </PanelSheet>
    );
  }
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={wide ? 'xl' : 'lg'}
      showCloseButton={false}
      headerClassName="sr-only"
      bodyClassName="!mt-0"
    >
      {content}
    </GlassModal>
  );
}

export default PanelHost;
