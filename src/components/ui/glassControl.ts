import clsx from 'clsx';

/*
 * What the shared controls have in common: the three states and the colour they
 * light up with. No control knows about Home Assistant: whoever uses it says what it
 * means. Small on purpose, because the first pages load it through GlassButton.
 */

export type GlassControlState = {
  disabled?: boolean;
  /** A command waits for its answer: it can be read, not pressed. */
  pending?: boolean;
  /** The last command failed. */
  error?: boolean;
};

/** Neutral, or in the colour of the device (--device-accent, set by whoever opens the panel). */
export type GlassTone = 'neutral' | 'device';

export function controlBlocked({ disabled, pending }: GlassControlState) {
  return Boolean(disabled || pending);
}

export function controlStateClass({ disabled, pending, error }: GlassControlState) {
  return clsx(disabled && 'glass-is-disabled', pending && 'glass-is-pending', error && 'glass-is-error');
}

export function controlStateAria({ pending, error }: GlassControlState) {
  return { 'aria-busy': pending || undefined, 'aria-invalid': error || undefined };
}
