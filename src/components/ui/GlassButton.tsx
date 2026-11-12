import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';

/**
 * `filled`, `soft`, `destructive` and `text` are the ones of the panels; `pill` is the main command of the
 * new pages and sheets, in the colour of the function; the others keep the old glass look.
 */
type GlassButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'filled' | 'soft' | 'destructive' | 'text' | 'pill';
type GlassButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-40' | 'icon-48' | 'icon-56' | 'compact';

export type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Pick<GlassControlState, 'pending' | 'error'> & {
    variant?: GlassButtonVariant;
    size?: GlassButtonSize;
    /** In the colour of the device, when filled or when `on`. */
    tone?: GlassTone;
    /** A round button that shows something is on. */
    on?: boolean;
  };

const variantClass: Record<GlassButtonVariant, string> = {
  default: 'glass-button',
  primary: 'glass-button glass-button-primary',
  danger: 'glass-button glass-button-danger',
  ghost: 'glass-button glass-button-ghost',
  filled: 'glass-btn glass-btn-filled',
  soft: 'glass-btn glass-btn-soft',
  destructive: 'glass-btn glass-btn-destructive',
  text: 'glass-btn glass-btn-text',
  pill: 'glass-btn glass-btn-pill',
};

const sizeClass: Record<GlassButtonSize, string> = {
  sm: 'min-h-10 rounded-xl px-3 py-2 text-xs',
  md: 'min-h-11',
  lg: '',
  icon: 'h-11 w-11 rounded-full p-0',
  'icon-40': 'glass-btn-icon-40',
  'icon-48': 'glass-btn-icon-48',
  'icon-56': 'glass-btn-icon-56',
  /** The pill at 44 px. */
  compact: 'glass-btn-compact',
};

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { className, variant = 'default', size = 'md', type = 'button', tone = 'neutral', on = false, pending, error, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(variantClass[variant], sizeClass[size], tone === 'device' && 'is-device', on && 'is-on', controlStateClass({ pending, error }), className)}
      disabled={controlBlocked({ disabled, pending })}
      aria-pressed={on || undefined}
      {...controlStateAria({ pending, error })}
      {...props}
    />
  );
});

export default GlassButton;
