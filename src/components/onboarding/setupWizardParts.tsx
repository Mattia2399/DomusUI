import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { OnboardingTranslationKey } from '../../i18n/onboardingTranslations';

/* The pieces every setup screen is made of, in the style of Rooms (setupWizard.css). */

export type Translate = (key: OnboardingTranslationKey, parameters?: Record<string, string | number>) => string;

export function hostOf(url: string | undefined) {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Words with **strong** parts, as the texts of setup write them. */
export function rich(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <b key={index}>{part}</b> : part));
}

export function Circle({ icon: Icon, tint, size = 'md' }: { icon: LucideIcon; tint?: 'blue' | 'amber' | 'green'; size?: 'sm' | 'md' }) {
  return (
    <span className={clsx('sw-ic', size === 'sm' && 'sw-ic-sm', tint && `sw-tint-${tint}`)} aria-hidden="true">
      <Icon size={size === 'sm' ? 18 : 21} strokeWidth={2.1} />
    </span>
  );
}

export function Row({ icon, tint, title, children, aside }: { icon: LucideIcon; tint?: 'blue' | 'amber' | 'green'; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="sw-r">
      <Circle icon={icon} tint={tint} size="sm" />
      <span className="sw-pick-t">
        <b>{title}</b>
        {children ? <span>{children}</span> : null}
      </span>
      {aside}
    </div>
  );
}

export function Note({ icon: Icon, tint, title, children, warn }: { icon: LucideIcon; tint: 'blue' | 'amber' | 'green'; title: ReactNode; children: ReactNode; warn?: boolean }) {
  return (
    <div className={clsx('sw-note', warn && 'is-warn')}>
      <span className={clsx('sw-note-ic', `sw-tint-${tint}`)} aria-hidden="true"><Icon size={19} strokeWidth={2.1} /></span>
      <span className="sw-note-t">
        <b>{title}</b>
        {children}
      </span>
    </div>
  );
}

export function Head({ title, children, icon, tint }: { title: ReactNode; children?: ReactNode; icon?: LucideIcon; tint?: 'blue' | 'amber' | 'green' }) {
  const Icon = icon;
  return (
    <div className="sw-head">
      {Icon ? <span className={clsx('sw-big sw-big-sm', tint && `sw-tint-${tint}`)} aria-hidden="true"><Icon size={26} strokeWidth={2} /></span> : null}
      <h1 id="sw-h" className="sw-title" tabIndex={-1}>{title}</h1>
      {children ? <p className="sw-desc">{children}</p> : null}
    </div>
  );
}

export function Actions({ secondary, children }: { secondary?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sw-actions">
      {secondary ?? <span />}
      <div className="sw-actions-r">{children}</div>
    </div>
  );
}
