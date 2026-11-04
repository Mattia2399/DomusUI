import React from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

export type PanelHeaderProps = {
  icon: React.ReactNode;
  iconClassName?: string;
  /** The icon takes the colour of the device: the device is on. */
  lit?: boolean;
  name: string;
  status: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
};

/* Icon, name and state, on the middle axis in one column and in a row in two. Close in its corner. */
export function PanelHeader({ icon, iconClassName, lit = false, name, status, closeLabel, onClose }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <span className={clsx('panel-header-icon', lit && 'is-lit', iconClassName)} aria-hidden="true">
        {icon}
      </span>
      <div className="panel-header-text">
        <h2>{name}</h2>
        <span aria-live="polite">{status}</span>
      </div>
      <button type="button" className="panel-header-close" aria-label={closeLabel} onClick={onClose}>
        <X size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

export default PanelHeader;
