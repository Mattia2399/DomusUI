import type { ReactNode } from 'react';
import './DeviceControlCardHeader.css';

type Props = {
  title: string;
  status: string;
  icon: ReactNode;
  onOpen: () => void;
  openLabel: string;
  onToggle?: () => void;
  toggleLabel: string;
  isOn: boolean;
  toggleDisabled: boolean;
  secondaryIcon?: ReactNode;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondaryClick?: () => void;
};

export function DeviceControlCardHeader({
  title, status, icon, onOpen, openLabel, onToggle, toggleLabel, isOn, toggleDisabled,
  secondaryIcon, secondaryLabel, secondaryDisabled = false, onSecondaryClick,
}: Props) {
  const hasSecondary = secondaryIcon !== undefined && secondaryLabel !== undefined;

  return (
    <div className="device-control-card__header" data-has-secondary={hasSecondary ? 'true' : 'false'}>
      <button
        type="button"
        className="device-control-card__toggle"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onToggle?.(); }}
        disabled={toggleDisabled || !onToggle}
        aria-label={toggleLabel}
        aria-pressed={isOn}
      >
        {icon}
      </button>
      <button
        type="button"
        className="device-control-card__meta"
        onClick={(event) => { event.stopPropagation(); onOpen(); }}
        aria-label={openLabel}
      >
        <strong title={title}>{title}</strong>
        <small>{status}</small>
      </button>
      {hasSecondary ? (
        <button
          type="button"
          className="device-control-card__secondary"
          aria-label={secondaryLabel}
          title={secondaryLabel}
          disabled={secondaryDisabled || !onSecondaryClick}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onSecondaryClick?.(); }}
        >
          {secondaryIcon}
        </button>
      ) : null}
    </div>
  );
}
