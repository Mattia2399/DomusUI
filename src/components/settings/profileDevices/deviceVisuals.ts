import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  HelpCircle,
  Laptop,
  MonitorSmartphone,
  ShieldAlert,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from '../../../i18n/translations';
import type { DeviceKind, DiscoveryStatus, LiveDeviceStatus } from '../../../services/profileClient';

export const DEVICE_KIND_ICON: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  computer: Laptop,
  other: MonitorSmartphone,
};

export const DEVICE_KIND_LABEL: Record<DeviceKind, TranslationKey> = {
  phone: 'profile.devices.kind.phone',
  tablet: 'profile.devices.kind.tablet',
  computer: 'profile.devices.kind.computer',
  other: 'profile.devices.kind.other',
};

export type StatusTone = 'success' | 'warning' | 'muted';

export const TONE_CLASS: Record<StatusTone, string> = {
  success: 'text-[color:var(--ui-success)]',
  warning: 'text-[color:var(--ui-warning)]',
  muted: 'text-[color:var(--ui-text-secondary)]',
};

/** Status is always text plus icon, never colour alone. */
export const DEVICE_STATUS_VISUAL: Record<LiveDeviceStatus, { icon: LucideIcon; tone: StatusTone }> = {
  active: { icon: CheckCircle2, tone: 'success' },
  unavailable: { icon: CircleSlash, tone: 'muted' },
  unverified: { icon: ShieldAlert, tone: 'warning' },
  ownership_conflict: { icon: AlertTriangle, tone: 'warning' },
  missing: { icon: HelpCircle, tone: 'muted' },
};

export const DISCOVERY_STATUS_VISUAL: Record<DiscoveryStatus, { icon: LucideIcon; tone: StatusTone }> = {
  available: { icon: CheckCircle2, tone: 'success' },
  already_owned: { icon: CheckCircle2, tone: 'muted' },
  owned_by_other: { icon: CircleSlash, tone: 'muted' },
  ownership_conflict: { icon: AlertTriangle, tone: 'warning' },
  missing: { icon: HelpCircle, tone: 'muted' },
  unavailable: { icon: CircleSlash, tone: 'muted' },
};

export const footerButtonBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
export const neutralButtonClass =
  'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] shadow-[0_8px_18px_var(--ui-shadow)] hover:bg-[color:var(--ui-surface-glass)]';
export const accentButtonClass =
  'border-[color:rgb(var(--ui-accent-rgb)/0.55)] bg-[linear-gradient(140deg,rgb(var(--ui-accent-rgb)/0.34)_0%,rgb(var(--ui-accent-secondary-rgb)/0.24)_100%)] text-[color:var(--ui-text-primary)] shadow-[0_12px_24px_var(--ui-shadow-soft)] hover:brightness-105';
export const dangerButtonClass =
  'border-[color:var(--ui-danger)] bg-[color:var(--ui-danger)] text-[color:var(--ui-danger-contrast)] shadow-[0_12px_24px_var(--ui-shadow-soft)] hover:brightness-105';
