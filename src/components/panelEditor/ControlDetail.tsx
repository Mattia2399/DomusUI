import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { isInternalPath } from '../devices/panels/related/relatedModel';
import { EntityPicker, type PickerEntity } from '../editor/EntityPicker';
import { FoldRow, useOneOpen } from '../editor/FoldRow';
import { IconPicker } from '../editor/IconPicker';
import { LookPicker } from '../editor/LookPicker';
import { moveItem } from '../editor/ReorderList';
import { GlassButton } from '../ui/GlassButton';
import { GlassConfirm } from '../ui/GlassConfirm';
import { GlassSegmented } from '../ui/GlassSegmented';
import { GlassTextInput } from '../ui/GlassTextInput';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { RelatedControl } from '../../types/relatedControl';
import type { PanelPlace } from '../devices/panels/registry';
import { relatedLooksOf, relatedWithLook, type ControlRow } from './controlsModel';
import type { PanelKit } from './panelKit';

export type ControlDetailProps = {
  row: ControlRow;
  rows: readonly ControlRow[];
  widget: Widget;
  haStates: MockEntityStateMap;
  entities: readonly PickerEntity[];
  lookName: (look: string) => string;
  kit: PanelKit;
  onChange: (rows: ControlRow[]) => void;
  onBack: () => void;
};

/*
 * One control, as the pages of the panel: back to Controlli, its name, the real control at
 * the top. What is short to choose is in view at once; only the entity opens, being large.
 */
export function ControlDetail({ row, rows, widget, haStates, entities, lookName, kit, onChange, onBack }: ControlDetailProps) {
  const words = usePanelEditorWords();
  const fold = useOneOpen<'entity'>();
  const [choosingIcon, setChoosingIcon] = React.useState(false);
  const [pathProblem, setPathProblem] = React.useState(false);
  const related = row.related;
  const icons = kit.EDITOR_ICONS;
  const replace = (next: ControlRow) => onChange(rows.map((entry) => (entry.id === row.id ? next : entry)));
  const changeRelated = (control: RelatedControl, extra: Partial<ControlRow> = {}) => replace({ ...row, ...extra, related: control, look: control.look, name: control.name ?? row.name });
  const ids = rows.map((entry) => entry.id);
  const position = ids.indexOf(row.id);
  const move = (by: number) => {
    const byId = new Map(rows.map((entry) => [entry.id, entry]));
    onChange(moveItem(ids, row.id, by).map((id) => byId.get(id)!));
  };
  const entityName = entities.find((entity) => entity.entityId === related?.entityId)?.name;
  const shownName = row.name || entityName || words('unnamed');
  const ChosenIcon = related?.icon ? icons[related.icon]?.icon : undefined;
  const preview = related ? <kit.RelatedPreview control={related} states={haStates} /> : row.preview;

  return (
    <div className="panel-editor-tab panel-editor-detail">
      <div>
        <GlassButton variant="soft" className="panel-editor-back" onClick={onBack}>
          <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
          {words('backToControls')}
        </GlassButton>
        <h3 className="panel-editor-detail-title">{shownName}</h3>
      </div>

      {preview ? (
        <div className="panel-editor-control-preview" inert aria-label={words('controlPreview')}>
          <React.Suspense fallback={<div className="panel-editor-wait is-small" aria-busy="true" />}>{preview}</React.Suspense>
        </div>
      ) : null}

      {related ? (
        <section>
          <div className="panel-editor-name-row">
            <GlassButton
              variant="soft"
              className="panel-editor-icon-button"
              aria-label={words('chooseIcon', { name: related.icon ? icons[related.icon]?.name ?? related.icon : words('iconAuto') })}
              aria-expanded={choosingIcon}
              onClick={() => setChoosingIcon((open) => !open)}
            >
              {ChosenIcon ? <ChosenIcon size={20} strokeWidth={2} aria-hidden="true" /> : <span aria-hidden="true">{words('iconAutoShort')}</span>}
            </GlassButton>
            <GlassTextInput
              label={words('name')}
              value={related.name ?? ''}
              placeholder={entityName}
              maxLength={40}
              clearLabel={words('clear')}
              describeProblem={() => words('nameTooLong')}
              onCommit={(name) => {
                const { name: _old, ...rest } = related;
                changeRelated((name.trim() ? { ...rest, name: name.trim() } : rest) as RelatedControl, { name: name.trim() || entityName || '' });
              }}
            />
          </div>
          {choosingIcon ? (
            <IconPicker
              icons={icons}
              label={words('icon')}
              value={related.icon}
              onChange={(icon) => {
                const { icon: _old, ...rest } = related;
                changeRelated((icon ? { ...rest, icon } : rest) as RelatedControl);
                setChoosingIcon(false);
              }}
            />
          ) : null}
        </section>
      ) : null}

      <section>
        <h4 className="panel-editor-heading">{words('place')}</h4>
        <GlassSegmented<PanelPlace>
          ariaLabel={words('place')}
          options={[
            { value: 'main', label: words('placeMain') },
            { value: 'more', label: words('placeMore') },
            { value: 'hidden', label: words('placeHidden') },
          ]}
          value={row.place}
          onChange={(place) => replace({ ...row, place })}
        />
      </section>

      {row.looks.length > 1 ? (
        <section>
          <h4 className="panel-editor-heading">{words('look')}</h4>
          <LookPicker<string>
            layout="row"
            label={words('look')}
            looks={row.looks}
            recommended={row.looks[0]}
            value={row.look}
            nameOf={lookName}
            onChange={(look) => (related ? changeRelated(relatedWithLook(related, look)) : replace({ ...row, look }))}
          />
        </section>
      ) : null}

      {related && (related.look === 'bar' || related.look === 'bar-value') ? (
        <section>
          <h4 className="panel-editor-heading">{words('send')}</h4>
          <GlassSegmented<'live' | 'release'>
            ariaLabel={words('send')}
            options={[
              { value: 'release', label: words('sendRelease') },
              { value: 'live', label: words('sendLive') },
            ]}
            value={related.options?.commit ?? 'release'}
            onChange={(commit) => changeRelated({ ...related, options: { commit } } as RelatedControl)}
          />
        </section>
      ) : null}

      {related?.look === 'page' ? (
        <section>
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
        </section>
      ) : null}

      {related && related.look !== 'page' ? (
        <FoldRow label={words('linkedTo')} value={entityName ?? related.entityId} open={fold.isOpen('entity')} onToggle={() => fold.toggle('entity')}>
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

      <div className="panel-editor-actions">
        <GlassButton variant="soft" size="sm" disabled={position <= 0} onClick={() => move(-1)}>
          {words('moveUp')}
        </GlassButton>
        <GlassButton variant="soft" size="sm" disabled={position >= rows.length - 1} onClick={() => move(1)}>
          {words('moveDown')}
        </GlassButton>
      </div>

      {related ? (
        <GlassConfirm
          className="panel-editor-remove"
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
