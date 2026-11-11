import React from 'react';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import type { PanelKit } from './panelKit';
import { ReorderList } from '../editor/ReorderList';
import { lookNameOf } from '../../i18n/editorTranslations';
import { GlassButton } from '../ui/GlassButton';
import { GlassConfirm } from '../ui/GlassConfirm';
import { GlassListRow } from '../ui/GlassListRow';
import type { Widget } from '../../types/dashboardModels';
import { AddControl } from './AddControl';
import { ControlDetail } from './ControlDetail';
import { controlSections, rowsFromSections, writeRows, type ControlRow } from './controlsModel';
import { pickerEntitiesOf } from './deviceEntities';
import type { PanelEditorProps } from './panelEditorTypes';
import type { DashboardHouseContext } from '../../services/dashboardHouseContext';

export type ControlsTabProps = Pick<PanelEditorProps, 'widget' | 'haStates' | 'entityRegistry' | 'areas' | 'entityOptions' | 'haEntityIds' | 'onUpdateWidget'> & {
  houseContext?: DashboardHouseContext | null;
  kit: PanelKit | null;
  rows: readonly ControlRow[];
  ready: boolean;
  fixed: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
};

/* All the controls of the card in one list: In primo piano, In Altro, Nascosti. A touch opens one. */
export function ControlsTab({ widget, haStates, entityRegistry, areas, houseContext, entityOptions, haEntityIds = [], onUpdateWidget, kit, rows, ready, fixed, selected, onSelect }: ControlsTabProps) {
  const words = usePanelEditorWords();
  const [adding, setAdding] = React.useState(false);
  React.useEffect(() => setAdding(false), [widget.id]);
  const save = (next: readonly ControlRow[]) => onUpdateWidget(widget.id, (current: Widget) => ({ ...current, ...writeRows(next) }));
  const sections = kit ? controlSections(kit, rows) : { main: [], more: [], hidden: [] };
  const most = kit?.MOST_IN_THE_ROW ?? 8;
  const allIds = React.useMemo(() => [...new Set([...haEntityIds, ...Object.keys(haStates), ...Object.values(entityOptions ?? {}).flat()])], [entityOptions, haEntityIds, haStates]);
  const entities = React.useMemo(() => pickerEntitiesOf(allIds, haStates, entityRegistry, areas, houseContext), [allIds, areas, entityRegistry, haStates, houseContext]);
  // The looks of a device have their names here: the words of the row of the panels stay with the panels.
  const deviceLookName = (look: string) => words(`dlook_${look}` as 'dlook_action');
  const lookName = (row: ControlRow) => (row.source === 'device' ? deviceLookName(row.look) : lookNameOf(row.look));

  if (fixed) return <p className="panel-editor-note">{words('controlsFixed')}</p>;
  if (!ready || !kit) return <div className="panel-editor-wait" aria-busy="true" />;

  const open = rows.find((row) => row.id === selected);
  if (open) {
    return (
      <ControlDetail
        row={open}
        rows={rows}
        widget={widget}
        haStates={haStates}
        entities={entities}
        kit={kit}
        lookName={(look) => (open.source === 'device' ? deviceLookName(look) : lookNameOf(look))}
        onChange={save}
        onBack={() => onSelect(null)}
      />
    );
  }
  if (adding) {
    return (
      <AddControl
        widget={widget}
        rows={rows}
        haStates={haStates}
        entities={entities}
        icons={kit.EDITOR_ICONS}
        onAdd={(next) => {
          save(next);
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  const list = (key: 'main' | 'more' | 'hidden', items: readonly ControlRow[]) => (
    <ReorderList<ControlRow>
      label={words(key === 'main' ? 'sectionMain' : key === 'more' ? 'sectionMore' : 'sectionHidden')}
      items={items}
      onReorder={(ids) => {
        const byId = new Map(items.map((row) => [row.id, row]));
        const ordered = ids.map((id) => byId.get(id)).filter((row): row is ControlRow => Boolean(row));
        const parts = { ...sections, [key]: ordered };
        save(rowsFromSections(parts.main, parts.more, parts.hidden));
      }}
      renderItem={(row) => (
        <GlassListRow
          icon={row.icon}
          title={row.name || words('unnamed')}
          note={`${row.source === 'related' ? words('relatedNote') : words('deviceNote')} · ${lookName(row)}`}
          opens
          onPress={() => onSelect(row.id)}
        />
      )}
    />
  );

  return (
    <div className="panel-editor-tab">
      <section>
        <h4 className="panel-editor-heading">
          {words('sectionMain')} <span className="panel-editor-count">{words('mainCount', { n: sections.main.length, max: most })}</span>
        </h4>
        {sections.main.length ? list('main', sections.main) : <p className="panel-editor-note">{words('noneHere')}</p>}
        <p className="panel-editor-note">{words('mainLimit', { max: most, less: most - 1 })}</p>
      </section>
      <section>
        <h4 className="panel-editor-heading">{words('sectionMore')}</h4>
        {sections.more.length ? list('more', sections.more) : <p className="panel-editor-note">{words('noneHere')}</p>}
      </section>
      {sections.hidden.length ? (
        <section>
          <h4 className="panel-editor-heading">{words('sectionHidden')}</h4>
          {list('hidden', sections.hidden)}
        </section>
      ) : null}
      <section>
        <GlassButton variant="soft" onClick={() => setAdding(true)}>
          {words('addControl')}
        </GlassButton>
        <GlassConfirm
          label={words('restore')}
          question={words('restoreQuestion')}
          confirmLabel={words('restore')}
          cancelLabel={words('cancel')}
          onConfirm={() => onUpdateWidget(widget.id, (current: Widget) => ({ ...current, panelControls: undefined }))}
        />
      </section>
    </div>
  );
}

export default ControlsTab;
