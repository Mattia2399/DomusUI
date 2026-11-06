import { isInternalPath } from '../devices/panels/related/relatedModel';
import React from 'react';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { EntityPicker, type PickerEntity } from '../editor/EntityPicker';
import { FoldRow, useOneOpen } from '../editor/FoldRow';
import { IconPicker } from '../editor/IconPicker';
import { LookPicker } from '../editor/LookPicker';
import { moveItem } from '../editor/ReorderList';
import type { EditorIcons } from '../editor/editorIcons';
import { GlassButton } from '../ui/GlassButton';
import { GlassConfirm } from '../ui/GlassConfirm';
import { GlassSegmented } from '../ui/GlassSegmented';
import { GlassTextInput } from '../ui/GlassTextInput';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { RelatedControl } from '../../types/relatedControl';
import type { PanelPlace } from '../devices/panels/registry';
import { relatedLooksOf, relatedWithLook, type ControlRow } from './controlsModel';

type Fold = 'name' | 'icon' | 'place' | 'look' | 'entity' | 'position' | 'page' | 'send';

export type ControlDetailProps = {
  row: ControlRow;
  rows: readonly ControlRow[];
  widget: Widget;
  haStates: MockEntityStateMap;
  entities: readonly PickerEntity[];
  lookName: (look: string) => string;
  icons: EditorIcons;
  onChange: (rows: ControlRow[]) => void;
  onBack: () => void;
};

/* One control: its rows open one at a time. Those of the device keep their name and icon. */
export function ControlDetail({ row, rows, widget, haStates, entities, lookName, icons, onChange, onBack }: ControlDetailProps) {
  const words = usePanelEditorWords();
  const fold = useOneOpen<Fold>();
  const related = row.related;
  const replace = (next: ControlRow) => onChange(rows.map((entry) => (entry.id === row.id ? next : entry)));
  const changeRelated = (control: RelatedControl, extra: Partial<ControlRow> = {}) => replace({ ...row, ...extra, related: control, look: control.look, name: control.name ?? '' });
  const place = (value: PanelPlace) => replace({ ...row, place: value });
  const ids = rows.map((entry) => entry.id);
  const position = ids.indexOf(row.id);
  const move = (by: number) => {
    const order = moveItem(ids, row.id, by);
    const byId = new Map(rows.map((entry) => [entry.id, entry]));
    onChange(order.map((id) => byId.get(id)!));
  };
  const [pathProblem, setPathProblem] = React.useState(false);
  const placeName = { main: words('placeMain'), more: words('placeMore'), hidden: words('placeHidden') } as const;
  const shownName = row.name || entities.find((entity) => entity.entityId === related?.entityId)?.name || words('unnamed');

  return (
    <div className="panel-editor-tab">
      <div className="panel-editor-detail-head">
        <GlassButton variant="text" onClick={onBack}>
          {words('backToControls')}
        </GlassButton>
        <b>{shownName}</b>
      </div>

      {related ? (
        <FoldRow label={words('name')} value={related.name || words('nameAuto')} open={fold.isOpen('name')} onToggle={() => fold.toggle('name')}>
          <GlassTextInput
            label={words('name')}
            value={related.name ?? ''}
            placeholder={entities.find((entity) => entity.entityId === related.entityId)?.name}
            maxLength={40}
            clearLabel={words('clear')}
            describeProblem={() => words('nameTooLong')}
            onCommit={(name) => {
              const { name: _old, ...rest } = related;
              changeRelated((name.trim() ? { ...rest, name: name.trim() } : rest) as RelatedControl);
            }}
          />
        </FoldRow>
      ) : null}

      {related ? (
        <FoldRow label={words('icon')} value={related.icon ? icons[related.icon]?.name ?? related.icon : words('iconAuto')} open={fold.isOpen('icon')} onToggle={() => fold.toggle('icon')}>
          <IconPicker
            icons={icons}
            label={words('icon')}
            value={related.icon}
            onChange={(icon) => {
              const { icon: _old, ...rest } = related;
              changeRelated((icon ? { ...rest, icon } : rest) as RelatedControl);
            }}
          />
        </FoldRow>
      ) : null}

      <FoldRow label={words('place')} value={placeName[row.place]} open={fold.isOpen('place')} onToggle={() => fold.toggle('place')}>
        <GlassSegmented<PanelPlace>
          ariaLabel={words('place')}
          options={[
            { value: 'main', label: words('placeMain') },
            { value: 'more', label: words('placeMore') },
            { value: 'hidden', label: words('placeHidden') },
          ]}
          value={row.place}
          onChange={place}
        />
      </FoldRow>

      {row.looks.length > 1 ? (
        <FoldRow label={words('look')} value={lookName(row.look)} open={fold.isOpen('look')} onToggle={() => fold.toggle('look')}>
          <LookPicker<string>
            label={words('look')}
            looks={row.looks}
            recommended={row.looks[0]}
            value={row.look}
            nameOf={lookName}
            onChange={(look) => (related ? changeRelated(relatedWithLook(related, look)) : replace({ ...row, look }))}
          />
        </FoldRow>
      ) : null}

      {related && related.look !== 'page' ? (
        <FoldRow label={words('linkedTo')} value={entities.find((entity) => entity.entityId === related.entityId)?.name ?? related.entityId} open={fold.isOpen('entity')} onToggle={() => fold.toggle('entity')}>
          <EntityPicker
            entities={entities}
            selected={related.entityId}
            compatible={(entityId) => entityId !== widget.entityId}
            onPick={(entityId) => {
              // The look stays if the new entity can take it, otherwise the one recommended for it.
              const looks = relatedLooksOf(haStates)({ entityId });
              const moved = relatedWithLook({ ...related, entityId } as RelatedControl, looks.includes(related.look) ? related.look : looks[0] ?? related.look);
              changeRelated(moved, { looks: relatedLooksOf(haStates)(moved) });
            }}
          />
        </FoldRow>
      ) : null}

      {related?.look === 'page' ? (
        <FoldRow label={words('page')} value={related.options.path} open={fold.isOpen('page')} onToggle={() => fold.toggle('page')}>
          <GlassTextInput
            label={words('page')}
            value={related.options.path}
            maxLength={120}
            clearLabel={words('clear')}
            error={pathProblem}
            describeProblem={() => words('pageProblem')}
            onCommit={(path) => {
              const fine = isInternalPath(path);
              setPathProblem(!fine);
              if (fine) changeRelated({ ...related, options: { path: path.trim() } });
            }}
          />
          {pathProblem ? <p className="panel-editor-note is-problem">{words('pageProblem')}</p> : null}
        </FoldRow>
      ) : null}

      {related && (related.look === 'bar' || related.look === 'bar-value') ? (
        <FoldRow label={words('send')} value={related.options?.commit === 'live' ? words('sendLive') : words('sendRelease')} open={fold.isOpen('send')} onToggle={() => fold.toggle('send')}>
          <GlassSegmented<'live' | 'release'>
            ariaLabel={words('send')}
            options={[
              { value: 'release', label: words('sendRelease') },
              { value: 'live', label: words('sendLive') },
            ]}
            value={related.options?.commit ?? 'release'}
            onChange={(commit) => changeRelated({ ...related, options: { commit } } as RelatedControl)}
          />
        </FoldRow>
      ) : null}

      <FoldRow label={words('position')} value={words('positionOf', { n: position + 1, of: rows.length })} open={fold.isOpen('position')} onToggle={() => fold.toggle('position')}>
        <div className="panel-editor-actions">
          <GlassButton variant="soft" disabled={position <= 0} onClick={() => move(-1)}>
            {words('moveUp')}
          </GlassButton>
          <GlassButton variant="soft" disabled={position >= rows.length - 1} onClick={() => move(1)}>
            {words('moveDown')}
          </GlassButton>
        </div>
      </FoldRow>

      {related ? (
        <GlassConfirm
          label={words('removeControl')}
          question={words('removeControlQuestion', { name: shownName })}
          confirmLabel={words('removeControl')}
          cancelLabel={words('cancel')}
          onConfirm={() => {
            onChange(rows.filter((entry) => entry.id !== row.id));
            onBack();
          }}
        />
      ) : null}
    </div>
  );
}

export default ControlDetail;
