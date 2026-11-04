import type React from 'react';
import { useDevicesTranslations } from '../../../../i18n/devicesTranslations';
import { PanelHeader } from './PanelHeader';
import { PanelShell, type PanelLive } from './PanelShell';

/*
 * The skeleton for a panel with a structure of its own, that is not an entry of the
 * registry: the header, the common states, and whatever it draws below them.
 */

export type PanelFrameProps = {
  icon: React.ReactNode;
  /** A class of its own for the icon: the colours of a lock. */
  iconClassName?: string;
  /** The colour of the device, "r g b": the icon and the sheet or dialog take it. */
  tintRgb?: string | null;
  name: string;
  status: React.ReactNode;
  live?: PanelLive;
  closeLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
};

const INK_ON_COLOUR = '#ffffff';

export function PanelFrame({ icon, iconClassName, tintRgb, name, status, live, closeLabel, onClose, children }: PanelFrameProps) {
  const dt = useDevicesTranslations();
  return (
    <PanelShell
      accent={tintRgb ? { color: `rgb(${tintRgb})`, ink: INK_ON_COLOUR, rgb: tintRgb } : undefined}
      tint={Boolean(tintRgb) && !live?.off}
      off={live?.off}
      header={<PanelHeader icon={icon} iconClassName={iconClassName} lit={Boolean(tintRgb)} name={name} status={status} closeLabel={closeLabel ?? dt('close')} onClose={onClose} />}
      states={live?.notice}
    >
      <div className="dv-panel">{children}</div>
    </PanelShell>
  );
}

export default PanelFrame;
