import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export { ProfileGroup as SettingsListGroup } from './ProfileGroup';

export type SettingsListTone = 'default' | 'success' | 'warning' | 'danger';

const ICON_TONE: Record<SettingsListTone, string> = {
  default: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
  success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-500',
  warning: 'border-amber-400/25 bg-amber-500/10 text-amber-500',
  danger: 'border-rose-400/25 bg-rose-500/10 text-[color:var(--ui-danger)]',
};

const METER_TONE: Record<Exclude<SettingsListTone, 'default'>, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-[color:var(--ui-danger)]',
};

export type SettingsListRowProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Short value on the right, such as a percentage or a count. */
  value?: string;
  tone?: SettingsListTone;
  /** A filled, coloured icon tile (as on the Settings overview); replaces the tone. */
  iconClassName?: string;
  /** A destructive action: the title is drawn in the danger color. */
  destructive?: boolean;
  /** A thin 0–100 bar under the text, coloured by `meterTone`. */
  meter?: { percent: number; tone: Exclude<SettingsListTone, 'default'> };
  onClick?: () => void;
  disabled?: boolean;
  /** Extra content under the text, such as a small chart. */
  children?: ReactNode;
};

/** A row of a settings list, in the grouped style of the Profile pages. */
export function SettingsListRow({
  icon: Icon,
  title,
  subtitle,
  value,
  tone = 'default',
  iconClassName,
  destructive = false,
  meter,
  onClick,
  disabled = false,
  children,
}: SettingsListRowProps) {
  const content = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border ${
          iconClassName
            ? `border-transparent text-white shadow-[0_6px_14px_var(--ui-shadow-soft)] ${iconClassName}`
            : ICON_TONE[tone]
        }`}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold tracking-[-0.01em] ${
            destructive ? 'text-[color:var(--ui-danger)]' : 'text-[color:var(--ui-text-primary)]'
          }`}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{subtitle}</span>
        ) : null}
        {meter ? (
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[color:var(--ui-separator)]" aria-hidden="true">
            <span
              className={`block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${METER_TONE[meter.tone]}`}
              style={{ width: `${Math.max(0, Math.min(100, meter.percent))}%` }}
            />
          </span>
        ) : null}
        {children}
      </span>
      {/* The value sits on the right, centred with the arrow, as in iOS Settings. */}
      {value ? (
        <span className="min-w-0 max-w-[40%] shrink-0 truncate text-right text-sm font-semibold tabular-nums text-[color:var(--ui-text-secondary)]">
          {value}
        </span>
      ) : null}
      {onClick ? <ChevronRight size={17} className="shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" /> : null}
    </>
  );

  const className = 'flex min-h-[4.4rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${className} hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
