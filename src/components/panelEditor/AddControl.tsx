import React from 'react';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { lookNameOf } from '../../i18n/editorTranslations';
import { EntityPicker, type PickerEntity } from '../editor/EntityPicker';
import { IconPicker } from '../editor/IconPicker';
import { LookPicker } from '../editor/LookPicker';
import { GlassButton } from '../ui/GlassButton';
import { GlassSegmented } from '../ui/GlassSegmented';
import { GlassTextInput } from '../ui/GlassTextInput';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { PanelPlace } from '../devices/panels/registry';
import { newRelatedControl, RELATED_PREFIX, relatedLooksOf, type ControlRow } from './controlsModel';

export type AddControlProps = {
  widget: Widget;
  rows: readonly ControlRow[];
  haStates: MockEntityStateMap;
  entities: readonly PickerEntity[];
  onAdd: (rows: ControlRow[]) => void;
  onCancel: () => void;
};

/* Two steps: the entity by its name, then its look, name, icon and place. */
export function AddControl({ widget, rows, haStates, entities, onAdd, onCancel }: AddControlProps) {
  const words = usePanelEditorWords();
  const [entityId, setEntityId] = React.useState<string | null>(null);
  const [look, setLook] = React.useState('');
  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState<string | undefined>(undefined);
  const [place, setPlace] = React.useState<PanelPlace>('more');
  const used = new Set([widget.entityId, ...rows.map((row) => row.related?.entityId).filter((id): id is string => Boolean(id))]);
  const looks = entityId ? relatedLooksOf(haStates)({ entityId }).filter(Boolean) : [];

  if (!entityId) {
    return (
      <div className="panel-editor-tab">
        <div className="panel-editor-detail-head">
          <GlassButton variant="text" onClick={onCancel}>
            {words('backToControls')}
          </GlassButton>
          <b>{words('addStepEntity')}</b>
        </div>
        <EntityPicker
          entities={entities}
          used={used}
          onPick={(picked) => {
            setEntityId(picked);
            setLook(relatedLooksOf(haStates)({ entityId: picked }).filter(Boolean)[0] ?? 'value');
          }}
        />
      </div>
    );
  }

  const entityName = entities.find((entity) => entity.entityId === entityId)?.name ?? entityId;
  return (
    <div className="panel-editor-tab">
      <div className="panel-editor-detail-head">
        <GlassButton variant="text" onClick={() => setEntityId(null)}>
          {words('back')}
        </GlassButton>
        <b>{entityName}</b>
      </div>
      <section>
        <h4 className="panel-editor-heading">{words('look')}</h4>
        <LookPicker<string> label={words('look')} looks={looks} recommended={looks[0]} value={look} nameOf={lookNameOf} onChange={setLook} />
      </section>
      <section>
        <GlassTextInput label={words('name')} value={name} placeholder={entityName} maxLength={40} clearLabel={words('clear')} describeProblem={() => words('nameTooLong')} onCommit={setName} />
      </section>
      <section>
        <h4 className="panel-editor-heading">{words('icon')}</h4>
        <IconPicker label={words('icon')} value={icon} onChange={setIcon} />
      </section>
      <section>
        <h4 className="panel-editor-heading">{words('place')}</h4>
        <GlassSegmented<PanelPlace>
          ariaLabel={words('place')}
          options={[
            { value: 'main', label: words('placeMain') },
            { value: 'more', label: words('placeMore') },
            { value: 'hidden', label: words('placeHidden') },
          ]}
          value={place}
          onChange={setPlace}
        />
      </section>
      <GlassButton
        variant="filled"
        onClick={() => {
          const control = newRelatedControl(entityId, look, { name: name.trim() || undefined, icon, place });
          onAdd([...rows, { id: `${RELATED_PREFIX}${control.id}`, source: 'related', name: control.name ?? '', looks, look: control.look, place, related: control }]);
        }}
      >
        {words('addIt')}
      </GlassButton>
    </div>
  );
}

export default AddControl;
