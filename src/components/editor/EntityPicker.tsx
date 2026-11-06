import React from 'react';
import { Search } from 'lucide-react';
import { useEditorWords } from '../../i18n/editorTranslations';
import { GlassChips } from '../ui/GlassChips';
import { GlassListRow } from '../ui/GlassListRow';
import './editor.css';

/** What can only be read: everything else can be commanded. */
const READ_DOMAINS = new Set(['sensor', 'binary_sensor', 'weather', 'sun', 'person', 'device_tracker', 'zone', 'calendar', 'image', 'event', 'update']);

export type EntityRole = 'control' | 'read';
export const entityRoleOf = (entityId: string): EntityRole => (READ_DOMAINS.has(entityId.split('.')[0] ?? '') ? 'read' : 'control');

export type PickerEntity = {
  entityId: string;
  name: string;
  areaId?: string;
  areaName?: string;
  deviceId?: string;
};

export type EntityFilter = 'all' | EntityRole;

/** Without accents and capitals, so "umidita" finds "Umidità". */
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type EntityGroups = { sameDevice: PickerEntity[]; sameRoom: PickerEntity[]; others: PickerEntity[] };

/** The entities that answer the search and the filter, in three groups by how near they are. */
export function groupEntities(entities: readonly PickerEntity[], { query = '', filter = 'all', near = {}, compatible }: { query?: string; filter?: EntityFilter; near?: { deviceId?: string; areaId?: string }; compatible?: (entityId: string) => boolean }): EntityGroups {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const kept = entities
    .filter((entity) => !compatible || compatible(entity.entityId))
    .filter((entity) => filter === 'all' || entityRoleOf(entity.entityId) === filter)
    .filter((entity) => {
      const text = plain(`${entity.name} ${entity.areaName ?? ''} ${entity.entityId}`);
      return words.every((word) => text.includes(word));
    })
    .sort((first, second) => first.name.localeCompare(second.name));
  const groups: EntityGroups = { sameDevice: [], sameRoom: [], others: [] };
  for (const entity of kept) {
    if (near.deviceId && entity.deviceId === near.deviceId) groups.sameDevice.push(entity);
    else if (near.areaId && entity.areaId === near.areaId) groups.sameRoom.push(entity);
    else groups.others.push(entity);
  }
  return groups;
}

/** How many it shows at once in a group, before asking to search. */
const MOST_SHOWN = 60;

export type EntityPickerProps = {
  entities: readonly PickerEntity[];
  onPick: (entityId: string) => void;
  /** The device and the room of the card, to put its own entities first. */
  near?: { deviceId?: string; areaId?: string };
  /** Already in the panel: shown, but not to be chosen again. */
  used?: ReadonlySet<string>;
  /** Only the types that fit, for example the entities a card of this kind can command. */
  compatible?: (entityId: string) => boolean;
  /** Without the filters, when the type already decides. */
  showFilters?: boolean;
  selected?: string;
};

/* Choosing an entity by its name, never typing it: the nearest first. */
export function EntityPicker({ entities, onPick, near, used, compatible, showFilters = true, selected }: EntityPickerProps) {
  const words = useEditorWords();
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<EntityFilter>('all');
  const groups = groupEntities(entities, { query, filter, near, compatible });
  const total = groups.sameDevice.length + groups.sameRoom.length + groups.others.length;
  const section = (title: string, list: PickerEntity[]) => {
    if (list.length === 0) return null;
    const shown = list.slice(0, MOST_SHOWN);
    return (
      <React.Fragment key={title}>
        <p className="editor-heading">{title}</p>
        {shown.map((entity) => {
          const taken = Boolean(used?.has(entity.entityId));
          return (
            <GlassListRow
              key={entity.entityId}
              title={entity.name}
              note={taken ? words('used') : [entity.areaName, entity.entityId].filter(Boolean).join(' · ')}
              selected={entity.entityId === selected}
              disabled={taken}
              onPress={() => onPick(entity.entityId)}
            />
          );
        })}
        {list.length > shown.length ? <p className="editor-empty">{words('moreToSearch', { n: list.length - shown.length })}</p> : null}
      </React.Fragment>
    );
  };
  return (
    <div className="editor-entities">
      <label className="editor-search">
        <Search size={18} strokeWidth={2.2} aria-hidden="true" />
        <input type="search" aria-label={words('search')} placeholder={words('search')} value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {showFilters ? (
        <GlassChips<EntityFilter>
          ariaLabel={words('filterAll')}
          options={[
            { value: 'all', label: words('filterAll') },
            { value: 'control', label: words('filterControl') },
            { value: 'read', label: words('filterRead') },
          ]}
          value={filter}
          onChange={(next) => setFilter(next as EntityFilter)}
        />
      ) : null}
      <div className="editor-entities-list">
        {section(words('sameDevice'), groups.sameDevice)}
        {section(words('sameRoom'), groups.sameRoom)}
        {section(words('otherRooms'), groups.others)}
        {total === 0 ? <p className="editor-empty">{words('nothingFound')}</p> : null}
      </div>
    </div>
  );
}

export default EntityPicker;
