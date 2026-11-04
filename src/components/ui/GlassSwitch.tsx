import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { controlStateAria, controlStateClass, type GlassControlState } from './glassControl';

export type GlassSwitchTone = 'green' | 'blue' | 'accent';

export type GlassSwitchProps = GlassControlState & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** The same as `pending`, the name it has had so far. */
  busy?: boolean;
  /** `mini` is the one beside the title of a group, 42 × 26. */
  size?: 'default' | 'compact' | 'mini';
  tone?: GlassSwitchTone;
  className?: string;
};

const ACTIVE_TONE_CLASS: Record<GlassSwitchTone, string> = {
  green: 'ios-glass-switch-on',
  blue: 'ios-glass-switch-blue-on',
  accent:
    'border-[color:rgb(var(--ui-accent-rgb)/0.72)] bg-[color:var(--ui-accent)] shadow-[0_0_22px_rgb(var(--ui-accent-rgb)/0.34),inset_0_1px_0_rgba(255,255,255,0.32)] focus-visible:ring-[rgb(var(--ui-accent-rgb)/0.42)]',
};

const THUMB_OFFSET: Record<NonNullable<GlassSwitchProps['size']>, string> = {
  default: 'translate-x-5',
  compact: 'translate-x-5',
  mini: 'translate-x-4',
};

export function GlassSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  busy: busyName = false,
  pending = false,
  error = false,
  size = 'default',
  tone = 'green',
  className,
}: GlassSwitchProps) {
  const compact = size === 'compact';
  const mini = size === 'mini';
  const busy = busyName || pending;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      {...controlStateAria({ pending: busy, error })}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={clsx(
        'ios-glass-switch',
        compact && 'h-7 w-12',
        mini && 'h-[26px] w-[42px]',
        checked && ACTIVE_TONE_CLASS[tone],
        busy && 'cursor-wait opacity-75',
        error && controlStateClass({ error }),
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'ios-glass-switch-thumb flex items-center justify-center',
          compact && 'left-[3px] h-[1.375rem] w-[1.375rem]',
          mini && 'h-[22px] w-[22px]',
          checked ? THUMB_OFFSET[size] : 'translate-x-0',
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-black/45" /> : null}
      </span>
    </button>
  );
}

export default GlassSwitch;
