import type React from 'react';
import { clsx } from 'clsx';
import { Power, X } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';

/*
 * The frame of every device panel: the icon in the colour of the card, the
 * name, "Room · state", the power when the device has one, Close, and below
 * them the body. Where it opens is up to PanelHost or to the Home.
 *
 * `embedded`: the Home's sheet on a phone has its own title and Close, so here
 * only the power stays.
 */

export type PanelPower = {
  on: boolean;
  /** The button lights up: a light that is on and answers. */
  highlighted: boolean;
  available: boolean;
  name: string;
  onToggle: () => void;
};

export type PanelShellProps = {
  icon: React.ReactNode;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  name: string;
  subtitle: string;
  /** The subtitle says the state of a device that changes while it is read. */
  liveSubtitle?: boolean;
  power?: PanelPower;
  embedded?: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
};

export function PanelHeader({
  icon,
  iconClassName,
  iconStyle,
  name,
  subtitle,
  liveSubtitle = false,
  power,
  embedded = false,
  onClose,
}: Omit<PanelShellProps, 'className' | 'children'>) {
  const dt = useDevicesTranslations();
  const powerButton = power ? (
    <button
      type="button"
      className={clsx('dv-round', power.highlighted && 'is-on')}
      aria-pressed={power.on}
      aria-label={dt(power.on ? 'turnOff' : 'turnOn', { name: power.name })}
      disabled={!power.available}
      onClick={power.onToggle}
    >
      <Power size={20} strokeWidth={2.2} aria-hidden="true" />
    </button>
  ) : null;

  if (embedded) return powerButton ? <div className="flex items-center justify-end gap-3">{powerButton}</div> : null;

  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={clsx('flex h-12 w-12 flex-none items-center justify-center rounded-full', iconClassName)} style={iconStyle}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{name}</p>
        <span className="dv-t2 text-[13px] font-semibold" aria-live={liveSubtitle ? 'polite' : undefined}>
          {subtitle}
        </span>
      </div>
      {powerButton}
      <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
        <X size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PanelShell({ className, children, ...header }: PanelShellProps) {
  return (
    <div className={clsx('dv-panel', className)}>
      <PanelHeader {...header} />
      {children}
    </div>
  );
}

export default PanelShell;
