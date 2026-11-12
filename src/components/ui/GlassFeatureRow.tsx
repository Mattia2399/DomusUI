import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { GlassListTone } from './GlassListRow';
import './pageKit.css';
import './glassFeatureRow.css';

export type GlassFeatureRowProps = {
  title: ReactNode;
  /** One line: the state of what the row opens. */
  status?: ReactNode;
  /** The state asks for a look: it turns to the colour of attention. */
  warn?: boolean;
  icon: ReactNode;
  /** The colour of the square: a function (glassTokens.css --fn-*). */
  tone?: GlassListTone;
  onPress: () => void;
  /** `add`: the transparent row that adds something, with a thin border and the colour of the page. */
  variant?: 'default' | 'add';
  className?: string;
};

/**
 * A large row of glass, one per thing it opens: the functions of Casa (docs/design/app/casa.html .fr).
 * The whole row is one button; nothing interactive inside it.
 */
export function GlassFeatureRow({ title, status, warn = false, icon, tone, onPress, variant = 'default', className }: GlassFeatureRowProps) {
  return (
    <button
      type="button"
      className={clsx('glass-feature-row', variant === 'add' ? 'is-add' : 'page-glass', warn && 'is-warn', className)}
      onClick={onPress}
    >
      <span
        className="glass-feature-row-icon"
        style={tone ? { background: `var(--fn-${tone})` } : undefined}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="glass-feature-row-text">
        <b>{title}</b>
        {status ? <span>{status}</span> : null}
      </span>
      {variant === 'add' ? null : <ChevronRight className="glass-feature-row-opens" size={18} strokeWidth={2.4} aria-hidden="true" />}
    </button>
  );
}

export default GlassFeatureRow;
