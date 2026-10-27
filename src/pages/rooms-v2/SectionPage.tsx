import React from 'react';
import { ChevronLeft, Eye, EyeOff, MapPinHouse, Plus, Star, StarOff, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import GlassBottomSheet from '../../components/ui/GlassBottomSheet';
import GlassSearchFilterBar from '../../components/ui/GlassSearchFilterBar';
import { groupSectionPage, type SectionItem } from '../../components/devices/model/sectionRules';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useI18n } from '../../i18n/I18nProvider';
import type { SectionCardContext } from './RoomSection';
import { AddAccessoriesSheet, SelectionMark, type AccessoryCandidate } from './AddAccessoriesSheet';

export type SectionCandidate = AccessoryCandidate;
export type RoomChoice = { id: string; name: string };

export type SectionPageProps<T extends SectionItem> = {
  title: string;
  roomName: string;
  items: T[];
  candidatesEmptyLabel: string;
  renderCard: (item: T, context: SectionCardContext) => React.ReactNode;
  /** The grid of the cards: rows of 82 px, or another for taller cards. */
  gridClassName?: string;
  canOrganize: boolean;
  canMove: boolean;
  busy: boolean;
  error: string | null;
  candidates: SectionCandidate[];
  rooms: RoomChoice[];
  onClose: () => void;
  onPin: (ids: string[]) => void;
  onToggleHidden: (ids: string[], hide: boolean) => void;
  onMove: (ids: string[], roomId: string) => Promise<boolean>;
  onRemove: (ids: string[]) => Promise<boolean>;
  onAdd: (ids: string[]) => Promise<boolean>;
};

type Sheet = 'add' | 'move' | 'remove' | null;

/** Every device of a section of the room: search, the three groups, and Edit to organise them. */
export function SectionPage<T extends SectionItem>({
  title,
  roomName,
  items,
  candidatesEmptyLabel,
  renderCard,
  gridClassName = 'rv2-grid',
  canOrganize,
  canMove,
  busy,
  error,
  candidates,
  rooms,
  onClose,
  onPin,
  onToggleHidden,
  onMove,
  onRemove,
  onAdd,
}: SectionPageProps<T>) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [moveTo, setMoveTo] = React.useState<string | null>(null);
  const groups = groupSectionPage(items, query, locale);
  const ordered = [...groups.pinned, ...groups.others, ...groups.hidden];
  const selection = ordered.filter((item) => selected[item.id]);
  const selectedIds = selection.map((item) => item.id);
  const allPinned = selection.length > 0 && selection.every((item) => item.pinRank !== null);
  const allHidden = selection.length > 0 && selection.every((item) => item.hidden);
  const pinnedCount = items.filter((item) => item.pinRank !== null).length;
  const hiddenCount = items.filter((item) => item.hidden).length;
  const subtitle = [
    items.length === 1 ? dt('pageSubtitleOne', { room: roomName }) : dt('pageSubtitle', { count: items.length, room: roomName }),
    pinnedCount ? dt('pagePinned', { count: pinnedCount }) : null,
    hiddenCount ? (hiddenCount === 1 ? dt('pageHiddenOne') : dt('pageHiddenMany', { count: hiddenCount })) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const pageRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sheet) return;
      // A panel or sheet open above the page closes on its own; the page stays.
      const above = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
        (dialog) => dialog !== pageRef.current,
      );
      if (!above) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sheet]);

  const clearSelection = () => setSelected({});
  const finish = (done: boolean) => {
    if (!done) return;
    setSheet(null);
    clearSelection();
  };
  const groupList: Array<{ key: string; label: string; items: T[] }> = [
    { key: 'pinned', label: dt('pinned'), items: groups.pinned },
    { key: 'others', label: groups.pinned.length ? dt('others') : dt('all'), items: groups.others },
    { key: 'hidden', label: dt('hiddenInRoom'), items: groups.hidden },
  ].filter((group) => group.items.length > 0);

  return (
    <div ref={pageRef} className="rv2-page" role="dialog" aria-modal="true" aria-labelledby="rv2-page-title" data-testid="rooms-v2-section-page">
      <div className="rv2-page-inner">
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="dv-glass dv-round" aria-label={dt('back')} onClick={onClose}>
            <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
          {canOrganize ? (
            <button
              type="button"
              className={clsx('dv-glass rv2-pill !h-11 !rounded-[22px] !px-4 !text-[15px]', editing && '!bg-[color:var(--dv-pill-on)] !text-[color:var(--dv-pill-on-ink)]')}
              aria-pressed={editing}
              onClick={() => {
                setEditing((value) => !value);
                clearSelection();
              }}
            >
              {editing ? dt('done') : dt('edit')}
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <h1 id="rv2-page-title" className="m-0 text-[30px] font-bold tracking-[-0.03em]">
            {title}
          </h1>
          <span className="dv-t2 text-sm font-medium">{subtitle}</span>
        </div>

        <GlassSearchFilterBar
          query={query}
          onQueryChange={setQuery}
          filters={[]}
          placeholder={dt('searchIn', { section: title.toLocaleLowerCase(locale) })}
        />

        <p className="dv-t2 m-0 text-[13px] leading-[1.45]">{dt('sectionRule')}</p>

        {groupList.length === 0 ? (
          <p className="dv-t2 m-0 py-6 text-center text-sm">{query.trim() ? dt('noResults') : dt('emptySection')}</p>
        ) : (
          groupList.map((group) => (
            <section key={group.key} className="flex flex-col gap-2.5" aria-label={group.label}>
              <h2 className="dv-t2 m-0 px-1 text-[13px] font-bold uppercase tracking-[0.06em]">
                {group.label} <span className="dv-t3">{group.items.length}</span>
              </h2>
              <div className={gridClassName}>
                {group.items.map((item) => (
                  <React.Fragment key={item.id}>
                    {renderCard(item, {
                      editing,
                      selected: Boolean(selected[item.id]),
                      onSelect: () => setSelected((current) => ({ ...current, [item.id]: !current[item.id] })),
                    })}
                  </React.Fragment>
                ))}
              </div>
            </section>
          ))
        )}

        {error ? (
          <p className="m-0 text-sm font-semibold text-[color:var(--dv-red)]" role="alert">
            {error}
          </p>
        ) : null}
        {editing && !canMove ? <p className="dv-t2 m-0 text-[13px]">{dt('manageNeedsHa')}</p> : null}

        {editing ? (
          <div className="dv-glass rv2-bar" role="toolbar" aria-label={dt('edit')}>
            <span className="rv2-bar-count text-sm font-semibold" aria-live="polite">
              {selection.length === 0
                ? dt('tapToSelect')
                : selection.length === 1
                  ? dt('selectedOne')
                  : dt('selectedMany', { count: selection.length })}
            </span>
            <div className="rv2-bar-actions flex items-center gap-0.5">
              <button
                type="button"
                className="rv2-action"
                disabled={selection.length === 0}
                onClick={() => {
                  onPin(selectedIds);
                  clearSelection();
                }}
              >
                {allPinned ? <StarOff size={20} aria-hidden="true" /> : <Star size={20} aria-hidden="true" />}
                {allPinned ? dt('unpin') : dt('pin')}
              </button>
              <button
                type="button"
                className="rv2-action"
                disabled={selection.length === 0}
                onClick={() => {
                  onToggleHidden(selectedIds, !allHidden);
                  clearSelection();
                }}
              >
                {allHidden ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />}
                {allHidden ? dt('show') : dt('hide')}
              </button>
              <button
                type="button"
                className="rv2-action"
                disabled={selection.length === 0 || !canMove || rooms.length === 0}
                onClick={() => {
                  setMoveTo(null);
                  setSheet('move');
                }}
              >
                <MapPinHouse size={20} aria-hidden="true" />
                {dt('move')}
              </button>
              <button
                type="button"
                className="rv2-action rv2-danger"
                disabled={selection.length === 0 || !canMove}
                onClick={() => setSheet('remove')}
              >
                <Trash2 size={20} aria-hidden="true" />
                {dt('remove')}
              </button>
              <button
                type="button"
                className="rv2-action"
                disabled={!canMove}
                onClick={() => setSheet('add')}
              >
                <Plus size={20} aria-hidden="true" />
                {dt('add')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <AddAccessoriesSheet
        isOpen={sheet === 'add'}
        title={dt('addTo', { section: title })}
        candidates={candidates}
        emptyLabel={candidatesEmptyLabel}
        busy={busy}
        onClose={() => setSheet(null)}
        onAdd={onAdd}
      />

      <GlassBottomSheet
        isOpen={sheet === 'move'}
        onClose={() => setSheet(null)}
        title={selection.length === 1 ? dt('moveOne') : dt('moveMany', { count: selection.length })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={() => setSheet(null)}>
              {dt('cancel')}
            </button>
            <button
              type="button"
              className="glass-button glass-button-primary min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
              disabled={!moveTo || busy}
              onClick={() => moveTo && void onMove(selectedIds, moveTo).then(finish)}
            >
              {dt('move')}
            </button>
          </div>
        }
      >
        <div role="radiogroup" aria-label={dt('move')}>
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              role="radio"
              aria-checked={moveTo === room.id}
              className="rv2-row"
              onClick={() => setMoveTo(room.id)}
            >
              <SelectionMark on={moveTo === room.id} />
              <span className="text-[15px] font-semibold">{room.name}</span>
            </button>
          ))}
        </div>
      </GlassBottomSheet>

      <GlassBottomSheet
        isOpen={sheet === 'remove'}
        onClose={() => setSheet(null)}
        title={selection.length === 1 ? dt('removeOne', { room: roomName }) : dt('removeMany', { count: selection.length, room: roomName })}
        description={dt('removeNote')}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={() => setSheet(null)}>
              {dt('cancel')}
            </button>
            <button
              type="button"
              className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold text-[color:var(--dv-red)] disabled:opacity-40"
              disabled={busy}
              onClick={() => void onRemove(selectedIds).then(finish)}
            >
              {dt('remove')}
            </button>
          </div>
        }
      >
        {null}
      </GlassBottomSheet>
    </div>
  );
}

export default SectionPage;
