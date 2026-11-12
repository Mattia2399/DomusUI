import type { ReactNode, Ref } from 'react';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import './pageKit.css';

export type PageHeaderProps = {
  title: ReactNode;
  /** A small line under the title, only when it says something. */
  detail?: ReactNode;
  /** Shows the round ‹: the only way back. Without it there is no back button. */
  onBack?: () => void;
  /** Spoken name of ‹; "Indietro" when not given. */
  backLabel?: string;
  /** At the right: gear, pin, the main action. Use PageHeaderButton for each. */
  tools?: ReactNode;
  /** h1 for a page, h2 for a subpage opened beside it. */
  headingLevel?: 1 | 2;
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  className?: string;
};

/**
 * The header of a page: one row with the round glass ‹ (only to go back), the title
 * (30 px, 700) and the tools at the right; under it, if needed, one line of detail.
 * docs/design/app/REGOLE-app.md §2.
 */
export function PageHeader({ title, detail, onBack, backLabel, tools, headingLevel = 1, titleId, titleRef, className }: PageHeaderProps) {
  const { t } = useI18n();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className={clsx('page-header', className)} data-testid="page-header">
      <div className="page-header-row">
        {onBack ? <PageHeaderButton label={backLabel ?? t('common.back')} icon={<ChevronLeft size={20} strokeWidth={2.4} />} onClick={onBack} /> : null}
        <Heading id={titleId} ref={titleRef} tabIndex={-1} className="page-header-title">
          {title}
        </Heading>
        {tools ? <div className="page-header-tools">{tools}</div> : null}
      </div>
      {detail ? <p className="page-header-detail">{detail}</p> : null}
    </header>
  );
}

export type PageHeaderButtonProps = {
  /** Spoken name: the button shows only its icon. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** For a tool that stays on, as the pin of a function kept in the bar. */
  pressed?: boolean;
  className?: string;
};

/** A round glass button of 44 px, for ‹ and for the tools of a header. */
export function PageHeaderButton({ label, icon, onClick, pressed, className }: PageHeaderButtonProps) {
  return (
    <button type="button" className={clsx('page-round-button page-glass', className)} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <span aria-hidden="true" className="flex">
        {icon}
      </span>
    </button>
  );
}

export default PageHeader;
