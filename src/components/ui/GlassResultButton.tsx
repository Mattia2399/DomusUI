import React from 'react';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { controlStateClass } from './glassControl';
import './glassActions.css';

export const GLASS_RESULT_MS = 2000;

export type GlassResultButtonProps = {
  label: React.ReactNode;
  /** True when it went well, or the reason why it did not. */
  onPress: () => Promise<true | string>;
  successLabel: React.ReactNode;
  disabled?: boolean;
  /** An action has no large version. */
  size?: 'compact' | 'group';
  className?: string;
};

/* After the touch it turns green with a tick, or red with the reason. It goes back to normal after 2 seconds. */
export function GlassResultButton({ label, onPress, successLabel, disabled = false, size = 'group', className }: GlassResultButtonProps) {
  const [outcome, setOutcome] = React.useState<{ kind: 'idle' | 'pending' | 'done' } | { kind: 'failed'; reason: string }>({ kind: 'idle' });
  const timer = React.useRef<number | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);
  const finish = (result: true | string) => {
    if (!alive.current) return;
    setOutcome(result === true ? { kind: 'done' } : { kind: 'failed', reason: result });
    timer.current = window.setTimeout(() => setOutcome({ kind: 'idle' }), GLASS_RESULT_MS);
  };
  const busy = outcome.kind !== 'idle';
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={outcome.kind === 'pending' || undefined}
      className={clsx('glass-result', `is-${size}`, `is-${outcome.kind}`, controlStateClass({ disabled, pending: outcome.kind === 'pending' }), className)}
      onClick={() => {
        setOutcome({ kind: 'pending' });
        onPress().then(finish, (reason: unknown) => finish(String(reason)));
      }}
    >
      {outcome.kind === 'done' ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : null}
      {outcome.kind === 'failed' ? <X size={18} strokeWidth={3} aria-hidden="true" /> : null}
      <b aria-live="polite">{outcome.kind === 'done' ? successLabel : outcome.kind === 'failed' ? outcome.reason : label}</b>
    </button>
  );
}

export default GlassResultButton;
