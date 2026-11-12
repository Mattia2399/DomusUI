/*
 * Which sheet to use: GlassSheet is the sheet of the new pages (level 3 and quick actions),
 * inside a PageFrame. GlassBottomSheet stays for the existing pages and is not used in new ones.
 */
import { useRef, type ReactNode } from 'react';
import { GlassButton } from './GlassButton';
import GlassModal from './GlassModal';
import { usePageFrame } from './PageFrame';
import { useI18n } from '../../i18n/I18nProvider';
import './pageFrame.css';

export type GlassSheetAction = {
  label: ReactNode;
  /** At the left of the label. */
  icon?: ReactNode;
  onPress: () => void;
};

export type GlassSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A small line under the title. */
  detail?: ReactNode;
  children: ReactNode;
  /** The main command, as wide as the sheet, in the colour of the function: "Inserisci · Fuori casa". */
  action?: GlassSheetAction;
  /** A small centred note under it, only when the entity tells it ("Hai 45 secondi per uscire."). */
  note?: ReactNode;
  /** Other commands at the bottom, when the main one is not enough. */
  footer?: ReactNode;
  /** Spoken name of the X; "Chiudi finestra" when not given. */
  closeLabel?: string;
};

/**
 * A sheet: the third level and the quick actions (choose a mode, type a code, start a zone).
 * In a narrow page it rises from the bottom; in a wide one it opens as a column at the right.
 * The shape comes from the page around (PageFrame), not from the window; with no PageFrame it
 * rises from the bottom. Closed by the X, Esc and a tap outside. Built on GlassModal: portal,
 * theme, focus kept inside and given back. When it opens the focus goes to the sheet, not to the
 * X: the ring of the focus shows only with the keyboard. docs/design/app/REGOLE-app.md §4.
 */
export function GlassSheet({ isOpen, onClose, title, detail, children, action, note, footer, closeLabel }: GlassSheetProps) {
  const { t } = useI18n();
  const frame = usePageFrame();
  const layout = frame?.layout ?? 'sheet';
  const contentRef = useRef<HTMLDivElement>(null);
  const bottom =
    action || note || footer ? (
      <>
        {footer}
        {action ? (
          <GlassButton variant="pill" className="page-sheet-action" onClick={action.onPress}>
            {action.icon ? (
              <span aria-hidden="true" className="flex">
                {action.icon}
              </span>
            ) : null}
            {action.label}
          </GlassButton>
        ) : null}
        {note ? <p className="page-sheet-note">{note}</p> : null}
      </>
    ) : undefined;
  return (
    <GlassModal
      // Inside a page, it waits for the page to know its width: it opens with its shape, never with the other.
      isOpen={isOpen && (frame ? frame.measured : true)}
      onClose={onClose}
      title={title}
      description={detail}
      footer={bottom}
      closeLabel={closeLabel ?? t('common.closeDialog')}
      initialFocusRef={contentRef}
      overlayData={{ layout, fn: frame?.fn }}
      panelMotion={layout === 'column' ? 'side' : 'rise'}
      className="page-sheet-overlay"
      panelClassName="page-sheet"
      bodyClassName="page-sheet-body"
      footerClassName="page-sheet-footer"
      backdropClassName="page-sheet-scrim"
    >
      <div ref={contentRef} tabIndex={-1} className="page-sheet-content">
        {children}
      </div>
    </GlassModal>
  );
}

export default GlassSheet;
