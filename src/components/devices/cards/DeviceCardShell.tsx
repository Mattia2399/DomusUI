import React from 'react';
import { clsx } from 'clsx';
import { Check, ChevronRight } from 'lucide-react';
import '../theme/devices.css';

/*
 * The frame every device card shares. The card fills the box it is given and
 * knows nothing of the grid. The icon commands (on and off); the body opens
 * the panel when there is one, otherwise it commands like the icon. While
 * editing, a touch anywhere selects the card instead.
 */

/** Width class × rows of 36 px with a 10 px gap: 2 = 82 px, 3 = 128, 4 = 174, 6 = 266. */
export type DeviceCardFormat = 'U×2' | 'U×3' | 'U×4' | 'W×2' | 'W×3' | 'W×4' | 'W×6' | 'X×4';

export const DEVICE_CARD_FORMATS: DeviceCardFormat[] = ['U×2', 'U×3', 'U×4', 'W×2', 'W×3', 'W×4', 'W×6', 'X×4'];

export function deviceCardRows(format: DeviceCardFormat) {
  return Number(format.split('×')[1]);
}

export function deviceCardHeightPx(format: DeviceCardFormat) {
  const rows = deviceCardRows(format);
  return rows * 36 + (rows - 1) * 10;
}

/** Header beside the command (a row), above it (a column), or beside a side panel (split). */
export function deviceCardLayout(format: DeviceCardFormat): 'row' | 'column' | 'split' {
  if (format === 'U×2' || format === 'W×2') return 'row';
  if (format === 'X×4') return 'split';
  return 'column';
}

export type DeviceCardShellProps = {
  format: DeviceCardFormat;
  name: string;
  status: string;
  icon: React.ReactNode;
  isOn: boolean;
  available: boolean;
  /** The card's own colour when it is lit, with the light's colour for the shadow. */
  lit?: { background: string; lightRgb: string } | null;
  hasPanel: boolean;
  editing?: boolean;
  selected?: boolean;
  /** Hidden in the room: shown faded where hidden devices are listed. */
  hiddenItem?: boolean;
  toggleLabel: string;
  openLabel: string;
  selectLabel: string;
  onToggle: () => void;
  onOpenPanel?: () => void;
  onSelect?: () => void;
  /** The command of the format, under the header or beside it. */
  controls?: React.ReactNode;
  /** The right-hand column of the widest format. */
  side?: React.ReactNode;
  className?: string;
};

export function DeviceCardShell({
  format,
  name,
  status,
  icon,
  isOn,
  available,
  lit,
  hasPanel,
  editing = false,
  selected = false,
  hiddenItem = false,
  toggleLabel,
  openLabel,
  selectLabel,
  onToggle,
  onOpenPanel,
  onSelect,
  controls,
  side,
  className,
}: DeviceCardShellProps) {
  const layout = deviceCardLayout(format);
  const opensPanel = hasPanel && available && Boolean(onOpenPanel);
  const select = () => onSelect?.();
  const pressBody = editing ? select : opensPanel ? () => onOpenPanel?.() : onToggle;
  const pressIcon = editing ? select : onToggle;
  const oneLineName = format.startsWith('W') || format.startsWith('X');
  const style = lit
    ? ({ background: lit.background, '--dv-light-rgb': lit.lightRgb } as React.CSSProperties)
    : undefined;

  const header = (
    <>
      <button
        type="button"
        className="dv-icon-button"
        onClick={pressIcon}
        disabled={!available && !editing}
        aria-pressed={editing ? selected : isOn}
        aria-label={editing ? selectLabel : toggleLabel}
        tabIndex={editing ? -1 : undefined}
      >
        {icon}
      </button>
      <span className={clsx('flex min-w-0 flex-col gap-px', layout !== 'split' && 'flex-1')}>
        <span className={clsx('dv-name', oneLineName && 'dv-name-1')}>{name}</span>
        <span className="dv-status">{status}</span>
      </span>
    </>
  );

  return (
    <div
      className={clsx(
        'dv-tile',
        lit && 'is-lit',
        editing && 'is-editing',
        editing && selected && 'is-selected',
        hiddenItem && 'is-hidden-item',
        !available && 'is-unavailable',
        className,
      )}
      style={style}
      data-format={format}
    >
      <button
        type="button"
        className="dv-tile-body"
        onClick={pressBody}
        disabled={!available && !editing}
        aria-pressed={editing ? selected : opensPanel ? undefined : isOn}
        aria-label={editing ? selectLabel : opensPanel ? openLabel : toggleLabel}
      />
      {layout === 'row' ? (
        <div className={clsx('dv-tile-inner items-center gap-3 pl-3.5', controls ? 'pr-2.5' : 'pr-3.5', editing && 'pr-9')}>
          {header}
          {controls}
        </div>
      ) : layout === 'column' ? (
        <div className={clsx('dv-tile-inner flex-col p-3.5', format === 'U×3' && 'py-3')}>
          <div className={clsx('flex min-w-0 items-center gap-2.5', (opensPanel || editing) && 'pr-3.5')}>{header}</div>
          {controls}
        </div>
      ) : (
        <div className="dv-tile-inner gap-4 py-3.5 pl-3.5 pr-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-3 pr-3.5">{header}</div>
            {controls}
          </div>
          {side ? <div className="flex w-[38%] flex-none flex-col justify-center gap-2.5 pt-1.5">{side}</div> : null}
        </div>
      )}
      {opensPanel && !editing ? (
        <span className="dv-chevron" aria-hidden="true">
          <ChevronRight size={13} strokeWidth={2.4} />
        </span>
      ) : null}
      {editing ? (
        <span className={clsx('dv-check', selected && 'is-selected')} aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      ) : null}
    </div>
  );
}

export default DeviceCardShell;
