import React from 'react';
import type { panelEditorKit } from '../settings/HomePanel';

/*
 * The code of the panels, as the edit mode uses it: from the piece of the Home that already
 * carries it, only when Controlli opens.
 */
export type PanelKit = typeof panelEditorKit;

let kit: PanelKit | null = null;
let loading: Promise<PanelKit> | null = null;

export const loadPanelKit = () =>
  (loading ??= import('../settings/HomePanel').then((module) => (kit = module.panelEditorKit)).catch((error) => {
    // The next time it is asked, it tries again.
    loading = null;
    throw error;
  }));

/** The kit, once here; null while it arrives or when it is not wanted yet. */
export function usePanelKit(wanted: boolean) {
  const [value, setValue] = React.useState<PanelKit | null>(kit);
  React.useEffect(() => {
    if (!wanted || value) return undefined;
    let live = true;
    void loadPanelKit()
      .then((loaded) => live && setValue(loaded))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [value, wanted]);
  return value;
}
