import React from 'react';
import { GlassShortcut } from '../../../ui/GlassShortcut';

export type PanelShortcutItem = { key: string; icon: React.ReactNode; label: string } & (
  | { kind: 'opens'; content: React.ReactNode }
  | { kind: 'acts'; on?: boolean; onPress: () => void }
);

/**
 * Which screen of the zone is open. The column of the Home changes device without
 * closing: a screen belongs to its `owner`, and to the shortcuts that exist now.
 */
export function usePanelScreen(owner: string, shortcuts: readonly PanelShortcutItem[]) {
  const [opened, setOpened] = React.useState<{ owner: string; key: string } | null>(null);
  const open = opened?.owner === owner && shortcuts.some((item) => item.key === opened.key && item.kind === 'opens') ? opened.key : null;
  return {
    open,
    onOpen: (key: string) => setOpened({ owner, key }),
    close: () => setOpened(null),
  };
}

export type PanelControlZoneProps = {
  ariaLabel: string;
  shortcuts?: readonly PanelShortcutItem[];
  /** The key of the shortcut whose controls take the place of the row. */
  open?: string | null;
  onOpen?: (key: string) => void;
  disabled?: boolean;
  /** Controls always in view, with no shortcuts: the position of a cover. */
  children?: React.ReactNode;
};

/* 148 px whatever it holds: the shortcuts, four to a row, or the controls of the one open. */
export function PanelControlZone({ ariaLabel, shortcuts = [], open = null, onOpen, disabled, children }: PanelControlZoneProps) {
  const screen = shortcuts.find((item) => item.key === open && item.kind === 'opens');
  return (
    <div className="panel-control-zone">
      {children ? (
        <div className="panel-control-screen">{children}</div>
      ) : screen?.kind === 'opens' ? (
        <div className="panel-control-screen">{screen.content}</div>
      ) : (
        <div className="panel-control-row" role="group" aria-label={ariaLabel}>
          {shortcuts.map((item) => (
            <GlassShortcut
              key={item.key}
              kind={item.kind}
              icon={item.icon}
              label={item.label}
              on={item.kind === 'acts' ? item.on : false}
              disabled={disabled}
              onPress={item.kind === 'acts' ? item.onPress : () => onOpen?.(item.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PanelControlZone;
