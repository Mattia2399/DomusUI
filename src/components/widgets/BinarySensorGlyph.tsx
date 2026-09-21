import { Activity, BatteryFull, BatteryWarning, CircleAlert, CircleCheck, DoorClosed, DoorOpen, DropletOff, Droplets, House, Radar, Wifi, WifiOff } from 'lucide-react';
import type { BinarySensorIcon, BinarySensorState } from './binarySensorPresentation';

const ICONS = {
  door: DoorOpen,
  motion: Radar,
  connection: Wifi,
  hazard: CircleAlert,
  water: Droplets,
  battery: BatteryWarning,
  presence: House,
  generic: Activity,
} as const;

export function BinarySensorGlyph({ icon, state, size = 22 }: { icon: BinarySensorIcon; state?: BinarySensorState; size?: number }) {
  const Icon = state === 'off'
    ? icon === 'door' ? DoorClosed
      : icon === 'connection' ? WifiOff
        : icon === 'hazard' ? CircleCheck
          : icon === 'water' ? DropletOff
            : icon === 'battery' ? BatteryFull : ICONS[icon]
    : ICONS[icon];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
