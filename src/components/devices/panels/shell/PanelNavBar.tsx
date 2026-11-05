import React from 'react';
import { clsx } from 'clsx';
import { GlassShortcut, type GlassShortcutKind } from '../../../ui/GlassShortcut';

export type PanelNavItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  /** What assistive technology says, when the name alone is too short. */
  ariaLabel?: string;
  kind: Exclude<GlassShortcutKind, 'plain'>;
  /** It is on: a timer running, a light flashing. */
  lit?: boolean;
  /** You are here. */
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** Which shortcut is open. The column of the Home changes device without closing: it belongs to its `owner`. */
export function usePanelNav(owner: string, keys: readonly string[]) {
  const [opened, setOpened] = React.useState<{ owner: string; key: string; from?: string } | null>(null);
  const current = opened?.owner === owner && keys.includes(opened.key) ? opened : null;
  return {
    open: current?.key ?? null,
    /** Touching again the one that is open goes back. */
    toggle: (key: string, from?: string) => setOpened(current?.key === key ? null : { owner, key, from }),
    /** Where it was opened from: Altro. */
    from: current?.from ?? null,
    /** One step back: to the list it was opened from, or to the protagonist. */
    back: () => setOpened(current?.from ? { owner, key: current.from } : null),
    home: () => setOpened(null),
  };
}

export type PanelNavBarProps = {
  ariaLabel: string;
  items: readonly PanelNavItem[];
};

/* The row at the bottom: always the same shortcuts in the same places, whatever is open. Without shortcuts it is not there. */
export function PanelNavBar({ ariaLabel, items }: PanelNavBarProps) {
  if (items.length === 0) return null;
  return (
    <nav className={clsx('panel-nav', items.length < 3 && 'is-few')} aria-label={ariaLabel}>
      {items.map((item) => (
        <GlassShortcut
          key={item.key}
          kind={item.kind}
          icon={item.icon}
          label={item.label}
          ariaLabel={item.ariaLabel}
          on={item.lit}
          selected={item.selected}
          disabled={item.disabled}
          onPress={item.onPress}
        />
      ))}
    </nav>
  );
}

export default PanelNavBar;
