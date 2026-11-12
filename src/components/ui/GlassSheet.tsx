/*
 * Which sheet to use: GlassSheet is the sheet of the new pages (level 3 and quick actions),
 * inside a PageFrame. GlassBottomSheet stays for the existing pages and is not used in new ones.
 */
import type { ReactNode } from 'react';
import GlassModal from './GlassModal';
import { usePageFrame } from './PageFrame';
import { useI18n } from '../../i18n/I18nProvider';
import './pageFrame.css';

export type GlassSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A small line under the title. */
  detail?: ReactNode;
  children: ReactNode;
  /** Commands that stay at the bottom, always in view. */
  footer?: ReactNode;
  /** Spoken name of the X; "Chiudi finestra" when not given. */
  closeLabel?: string;
};

/**
 * A sheet: the third level and the quick actions (choose a mode, type a code, start a zone).
 * In a narrow page it rises from the bottom; in a wide one it opens as a column at the right.
 * The shape comes from the page around (PageFrame), not from the window; with no PageFrame it
 * rises from the bottom. Closed by the X, Esc and a tap outside. Built on GlassModal: portal,
 * theme, focus kept inside and given back. docs/design/app/REGOLE-app.md §4.
 */
export function GlassSheet({ isOpen, onClose, title, detail, children, footer, closeLabel }: GlassSheetProps) {
  const { t } = useI18n();
  const frame = usePageFrame();
  const layout = frame?.layout ?? 'sheet';
  return (
    <GlassModal
      // Inside a page, it waits for the page to know its width: it opens with its shape, never with the other.
      isOpen={isOpen && (frame ? frame.measured : true)}
      onClose={onClose}
      title={title}
      description={detail}
      footer={footer}
      closeLabel={closeLabel ?? t('common.closeDialog')}
      overlayData={{ layout, fn: frame?.fn }}
      panelMotion={layout === 'column' ? 'side' : 'rise'}
      className="page-sheet-overlay"
      panelClassName="page-sheet"
      bodyClassName="page-sheet-body"
      footerClassName="page-sheet-footer"
      backdropClassName="page-sheet-scrim"
    >
      {children}
    </GlassModal>
  );
}

export default GlassSheet;
