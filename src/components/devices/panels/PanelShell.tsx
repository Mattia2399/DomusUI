import React from 'react';
import { clsx } from 'clsx';
import { ChevronLeft, Power, X } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';

/*
 * The frame of every device panel: the icon in the colour of the card, the
 * name, "Room · state", the power when the device has one, Close, and below
 * them the body. Where it opens is up to PanelHost or to the Home.
 *
 * `embedded`: inside the Home's sheet on a phone, whose own title steps aside for
 * this one (panels.css), so that a panel has the same header everywhere.
 *
 * `live`: the states all panels share (panelLiveState.tsx). A device that does
 * not answer has its controls off; `tint` colours the sheet or the column that
 * holds the panel, as PanelHost does in Rooms.
 *
 * `dock`: on a phone or in a column the power moves to the bottom, within reach
 * of a thumb, with Back beside it on the screen of a shortcut. Where there is
 * room it stays in the header (devices.css): the same button in both.
 */

export type PanelTint = { rgb: string; soft?: boolean };

export type PanelLive = {
  off?: boolean;
  notice?: React.ReactNode;
  tint?: PanelTint | null;
};

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
  live?: PanelLive;
  dock?: { back?: { label: string; onPress: () => void } };
  children: React.ReactNode;
};

function PowerButton({ power }: { power: PanelPower }) {
  const dt = useDevicesTranslations();
  return (
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
  );
}

/** A round button with its name below, as the shortcuts of a panel on a phone. */
export function PanelShortcut({
  icon,
  label,
  expanded,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  expanded?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button type="button" className="dv-panel-shortcut" aria-expanded={expanded} disabled={disabled} onClick={onPress}>
      <span className="dv-round" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}

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
}: Omit<PanelShellProps, 'className' | 'children' | 'live' | 'dock'>) {
  const dt = useDevicesTranslations();
  const { t } = useI18n();

  return (
    <div className="dv-panel-head flex items-center gap-3">
      <span aria-hidden="true" className={clsx('flex h-12 w-12 flex-none items-center justify-center rounded-full', iconClassName)} style={iconStyle}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{name}</h2>
        <span className="dv-t2 text-[13px] font-semibold" aria-live={liveSubtitle ? 'polite' : undefined}>
          {subtitle}
        </span>
      </div>
      {power ? <PowerButton power={power} /> : null}
      <button type="button" className="dv-round dv-round-sm" aria-label={embedded ? t('builder.closeDevice') : dt('close')} onClick={onClose}>
        <X size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

/** The sheet or the dialog around the panel takes the colour of the device; the column of a desktop stays neutral. */
function useHostTint(ref: React.RefObject<HTMLDivElement | null>, tint: PanelTint | null | undefined) {
  const rgb = tint?.rgb;
  const soft = Boolean(tint?.soft);
  React.useLayoutEffect(() => {
    const panel = ref.current;
    const host = panel?.closest<HTMLElement>('.device-context-surface, [role="dialog"]');
    if (!host || !rgb) return undefined;
    host.style.setProperty('--dv-light-rgb', rgb);
    host.classList.add('dv-panel-tinted');
    host.classList.toggle('dv-panel-tint-soft', soft);
    return () => {
      host.classList.remove('dv-panel-tinted', 'dv-panel-tint-soft');
      host.style.removeProperty('--dv-light-rgb');
    };
  }, [ref, rgb, soft]);
}

export function PanelShell({ className, children, live, dock, ...header }: PanelShellProps) {
  const root = React.useRef<HTMLDivElement>(null);
  useHostTint(root, live?.off ? null : live?.tint);
  const power = live?.off && header.power ? { ...header.power, available: false } : header.power;
  return (
    <div ref={root} className={clsx('dv-panel', live?.off && 'dv-panel-off', dock && 'is-docked', className)}>
      <PanelHeader {...header} power={dock ? undefined : power} />
      {live?.notice}
      {live?.off ? (
        <div className="dv-panel dv-pn-dis" aria-disabled="true" inert>
          {children}
        </div>
      ) : children}
      {dock ? (
        <div className="dv-panel-dock">
          <span className="dv-panel-dock-side">
            {dock.back ? <PanelShortcut icon={<ChevronLeft size={20} strokeWidth={2.2} />} label={dock.back.label} onPress={dock.back.onPress} /> : null}
          </span>
          {power ? <PowerButton power={power} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export default PanelShell;
