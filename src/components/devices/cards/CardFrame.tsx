import type React from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import type { DeviceCardFormat } from './DeviceCardShell';
import '../theme/devices.css';
import '../theme/cardSizes.css';

/*
 * The frame of a Standard or Expanded card: the tile, the body that opens the
 * detail (or selects while editing) and the check of the edit mode. What sits
 * inside is the card's own; the Mini of a room keeps DeviceCardShell.
 */

export type CardFrameProps = {
  format: DeviceCardFormat;
  available: boolean;
  /** A device that is on: the tile turns white. */
  on?: boolean;
  /** A lit light: the tile takes its colour. */
  lit?: { background: string; lightRgb: string } | null;
  /** The colour of the icon of a device that is on (data-tone of devices.css). */
  tone?: string | null;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  openLabel: string;
  selectLabel: string;
  onOpen?: () => void;
  onSelect?: () => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  children: React.ReactNode;
};

export function CardFrame({
  format,
  available,
  on = false,
  lit = null,
  tone = null,
  editing = false,
  selected = false,
  hiddenItem = false,
  openLabel,
  selectLabel,
  onOpen,
  onSelect,
  className,
  style,
  testId,
  children,
}: CardFrameProps) {
  const litStyle = lit ? ({ background: lit.background, '--dv-light-rgb': lit.lightRgb } as React.CSSProperties) : undefined;
  return (
    <div
      className={clsx(
        'dv-tile',
        lit && 'is-lit',
        !lit && on && 'is-on',
        editing && 'is-editing',
        editing && selected && 'is-selected',
        hiddenItem && 'is-hidden-item',
        !available && 'is-unavailable',
        className,
      )}
      style={{ ...litStyle, ...style }}
      data-format={format}
      data-tone={!lit && tone ? tone : undefined}
      data-testid={testId}
    >
      <button
        type="button"
        className="dv-tile-body"
        onClick={editing ? onSelect : onOpen}
        disabled={!editing && (!available || !onOpen)}
        aria-pressed={editing ? selected : undefined}
        aria-label={editing ? selectLabel : openLabel}
      />
      {children}
      {editing ? (
        <span className={clsx('dv-check', selected && 'is-selected')} aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      ) : null}
    </div>
  );
}

/** The round icon of a card: it commands the device, and steps aside while editing. */
export function CardIcon({
  children,
  label,
  pressed,
  editing = false,
  disabled = false,
  onPress,
  className,
}: {
  children: React.ReactNode;
  label?: string;
  pressed?: boolean;
  editing?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  if (!onPress) {
    return (
      <span className={clsx('dv-icon-button pointer-events-none', className)} aria-hidden="true">
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={clsx('dv-icon-button', className)}
      onClick={onPress}
      disabled={disabled && !editing}
      aria-pressed={editing ? undefined : pressed}
      aria-label={editing ? undefined : label}
      aria-hidden={editing ? true : undefined}
      tabIndex={editing ? -1 : undefined}
    >
      {children}
    </button>
  );
}

/** Icon, name and status, with an optional figure or switch at the right. */
export function CardHead({
  icon,
  name,
  status,
  aside,
  oneLine = false,
  nameNode,
  statusClassName,
}: {
  icon?: React.ReactNode;
  name: string;
  status: React.ReactNode;
  aside?: React.ReactNode;
  oneLine?: boolean;
  /** Draws the name in its own way, as one that scrolls. */
  nameNode?: React.ReactNode;
  statusClassName?: string;
}) {
  return (
    <div className="dv-size-head">
      {icon}
      <span className="dv-size-text">
        {nameNode ?? <span className={clsx('dv-name', oneLine && 'dv-name-1')}>{name}</span>}
        <span className={clsx('dv-status', statusClassName)}>{status}</span>
      </span>
      {aside}
    </div>
  );
}

export default CardFrame;
