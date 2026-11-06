import React from 'react';
import type { RelatedContextValue } from '../devices/panels/related/relatedContext';
import type { PanelKind } from '../devices/panels/registry';
import type { PanelKit } from './panelKit';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { ControlRow } from './controlsModel';

export type PanelPreviewProps = {
  kit: PanelKit;
  panel: { kind: PanelKind; input: unknown };
  widget: Widget;
  states: MockEntityStateMap;
  rows: readonly ControlRow[];
  selected: string | null;
  onSelect: (id: string) => void;
};

/** Which control a touch fell on: by the name its group, its shortcut or its row in Altro carries. */
export function controlAt(target: EventTarget | null, rows: readonly ControlRow[]): ControlRow | undefined {
  const element = target instanceof Element ? target.closest('section.panel-group[aria-label], .panel-nav button, .panel-page button, [role="button"]') : null;
  if (!element) return undefined;
  const said = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
  return rows.find((row) => row.name && (said === row.name || said.startsWith(row.name)));
}

/*
 * The real panel of the card, as it is saved now, in the column of the Home: the dialog
 * of the editor is not the dialog of a panel, and keeps its colour. Its commands are off:
 * a touch only chooses the control to edit.
 */
export function PanelPreview({ kit, panel, widget, states, rows, selected, onSelect }: PanelPreviewProps) {
  const { Panel, PanelSurfaceContext } = kit;
  const context = React.useMemo<RelatedContextValue>(
    () => ({
      states,
      demo: true,
      commands: {},
    }),
    [states, widget],
  );
  const stop = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const chosen = rows.find((row) => row.id === selected);
  return (
    <div
      className="panel-editor-preview dv-panel-frame"
      data-testid="panel-editor-preview"
      onPointerDownCapture={stop}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') stop(event);
      }}
      onClickCapture={(event) => {
        stop(event);
        const row = controlAt(event.target, rows);
        if (row) onSelect(row.id);
      }}
    >
      {chosen?.name ? <style>{`.panel-editor-preview [aria-label="${chosen.name.replace(/["\\]/g, '\\$&')}"]{outline:2px solid var(--control-accent, #0a84ff);outline-offset:2px;border-radius:14px}`}</style> : null}
      <React.Suspense fallback={<div className="panel-editor-preview-wait" aria-busy="true" />}>
        <PanelSurfaceContext.Provider value="column">
          <Panel
            kind={panel.kind}
            input={panel.input}
            onClose={() => undefined}
            related={widget.relatedControls?.length || widget.widgets?.length || widget.panelControls ? { source: widget, context } : undefined}
          />
        </PanelSurfaceContext.Provider>
      </React.Suspense>
    </div>
  );
}

export default PanelPreview;
