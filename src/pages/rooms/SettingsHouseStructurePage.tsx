import { ChevronDown, ChevronRight, ChevronUp, Layers, Plus } from 'lucide-react';
import type { RoomTab } from '../../components/rooms/roomsDirectory';
import { SettingsListGroup } from '../../components/settings/SettingsList';
import { SETTINGS_PAGE_PROPS } from '../../components/settings/useSettingsPageTransition';
import NestedPageHeader from '../../components/ui/NestedPageHeader';
import { useI18n } from '../../i18n/I18nProvider';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import type { FloorChoice } from './RoomManageSheets';
import { ROOM_ICONS } from './RoomHead';
import type { ManagedRoom } from './RoomsManagePage';

type SettingsHouseStructurePageProps = {
  rooms: ManagedRoom[];
  floors: FloorChoice[];
  canManageRooms: boolean;
  canManageFloors: boolean;
  loading: boolean;
  unavailable: string | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onNewRoom: () => void;
  onEditRoom: (room: RoomTab) => void;
  onMoveRoom: (roomId: string, direction: -1 | 1) => void;
  onNewFloor: () => void;
  onEditFloor: (floor: FloorChoice) => void;
  onMoveFloor: (floorId: string, direction: -1 | 1) => void;
};

function GroupAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="liquid-glass-control inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[color:var(--ui-text-primary)] transition-transform active:scale-[0.96]" onClick={onClick}>
      <Plus size={15} aria-hidden="true" />
      {label}
    </button>
  );
}

function MoveButton({ label, disabled, direction, onClick }: { label: string; disabled: boolean; direction: -1 | 1; onClick: () => void }) {
  const Icon = direction === -1 ? ChevronUp : ChevronDown;
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent">
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

export function SettingsHouseStructurePage({
  rooms, floors, canManageRooms, canManageFloors, loading, unavailable, busy, error, onRetry,
  onBack, onNewRoom, onEditRoom, onMoveRoom, onNewFloor, onEditFloor, onMoveFloor,
}: SettingsHouseStructurePageProps) {
  const { t } = useI18n();
  const rt = useRoomsTranslations();
  const countRooms = (count: number) => count === 1 ? rt('countRoomsOne') : rt('countRoomsMany', { count });
  const floorIds = new Set(floors.map((floor) => floor.id));
  const roomGroups = [
    ...floors.map((floor) => ({ id: floor.id, name: floor.name, rooms: rooms.filter((room) => room.floorId === floor.id) })),
    { id: '', name: rt('noFloor'), rooms: rooms.filter((room) => !room.floorId || !floorIds.has(room.floorId)) },
  ].filter((group) => group.id !== '' || group.rooms.length > 0);

  return (
    <div {...SETTINGS_PAGE_PROPS} className="dashboard-page-scroll !p-0 text-[color:var(--ui-text-primary)]" data-testid="settings-house-structure">
      <NestedPageHeader
        title={t('settings.home.floors')}
        subtitle={t('settings.home.floorsSubtitle')}
        backLabel={t('settings.back')}
        onBack={onBack}
        contentClassName="lg:!px-10"
      />
      <main className="dashboard-page-content-wide px-4 pb-[calc(env(safe-area-inset-bottom)+6.25rem)] pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:px-10">
        <div className="mx-auto w-full max-w-[48rem] space-y-7">
          {error ? <p role="alert" className="text-sm font-semibold text-[color:var(--ui-danger)]">{error}</p> : null}
          {!canManageRooms && !canManageFloors && !loading ? <p className="px-1 text-xs text-[color:var(--ui-text-secondary)]">{t('settings.rooms.readOnly')}</p> : null}
          {loading ? (
            <p role="status" className="px-1 text-sm text-[color:var(--ui-text-secondary)]">{rt('loadingRooms')}</p>
          ) : unavailable ? (
            <section className="rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-5 shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl">
              <p role="alert" className="text-sm text-[color:var(--ui-text-secondary)]">{unavailable}</p>
              <button type="button" className="liquid-glass-control mt-4 h-9 rounded-full px-4 text-xs font-semibold" onClick={onRetry}>{t('settings.rooms.retry')}</button>
            </section>
          ) : (
            <>
              <SettingsListGroup title={rt('manageTabFloors')} action={canManageFloors ? <GroupAction label={rt('newFloor')} onClick={onNewFloor} /> : undefined}>
                {floors.length === 0 ? <div className="px-4 py-5 text-sm text-[color:var(--ui-text-secondary)]">{rt('noFloors')}</div> : null}
                {floors.map((floor, index) => {
                  const count = rooms.filter((room) => room.floorId === floor.id).length;
                  const detail = [countRooms(count), floor.level == null ? null : `${t('settings.rooms.level')} ${floor.level}`].filter(Boolean).join(' · ');
                  return (
                    <div key={floor.id} className="flex min-h-[4.4rem] items-center gap-2 px-4 py-3 sm:gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]" aria-hidden="true"><Layers size={17} /></span>
                      <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={!canManageFloors || busy} aria-label={rt('editNamed', { name: floor.name })} onClick={() => onEditFloor(floor)}>
                        <span className="block truncate text-sm font-semibold tracking-[-0.01em]">{floor.name}</span>
                        <span className="mt-0.5 block truncate text-xs leading-5 text-[color:var(--ui-text-secondary)]">{detail}</span>
                      </button>
                      {canManageFloors ? (
                        <>
                          <MoveButton label={`${rt('moveFloorBefore')} ${floor.name}`} direction={-1} disabled={busy || index === 0} onClick={() => onMoveFloor(floor.id, -1)} />
                          <MoveButton label={`${rt('moveFloorAfter')} ${floor.name}`} direction={1} disabled={busy || index === floors.length - 1} onClick={() => onMoveFloor(floor.id, 1)} />
                          <ChevronRight size={16} className="shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </SettingsListGroup>

              <section aria-label={rt('manageTabRooms')}>
                <div className="mb-2 flex items-end justify-between gap-3 px-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">{rt('manageTabRooms')}</h2>
                  {canManageRooms ? <GroupAction label={rt('newRoom')} onClick={onNewRoom} /> : null}
                </div>
                <div className="space-y-4">
                  {roomGroups.length === 0 ? (
                    <div className="rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] px-4 py-5 text-sm text-[color:var(--ui-text-secondary)] shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl">{rt('noRooms')}</div>
                  ) : roomGroups.map((group) => (
                    <SettingsListGroup key={group.id || 'unassigned'} title={group.name} description={countRooms(group.rooms.length)}>
                      {group.rooms.length === 0 ? <div className="px-4 py-5 text-sm text-[color:var(--ui-text-secondary)]">{rt('noRoomsOnFloor')}</div> : null}
                      {group.rooms.map((room, index) => {
                        const Icon = ROOM_ICONS[room.icon];
                        const detail = room.devices === 1 ? rt('devicesOne') : rt('devicesMany', { count: room.devices });
                        return (
                          <div key={room.tab.id} className="flex min-h-[4.4rem] items-center gap-2 px-4 py-3 sm:gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]" aria-hidden="true"><Icon size={17} /></span>
                            <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={!room.editable} aria-label={rt('editNamed', { name: room.tab.name })} onClick={() => onEditRoom(room.tab)}>
                              <span className="block truncate text-sm font-semibold tracking-[-0.01em]">{room.tab.name}</span>
                              <span className="mt-0.5 block truncate text-xs leading-5 text-[color:var(--ui-text-secondary)]">{detail}{room.hidden ? ` · ${rt('hiddenTag')}` : ''}</span>
                            </button>
                            {canManageRooms ? (
                              <>
                                <MoveButton label={rt('moveRoomBefore', { name: room.tab.name })} direction={-1} disabled={index === 0} onClick={() => onMoveRoom(room.tab.id, -1)} />
                                <MoveButton label={rt('moveRoomAfter', { name: room.tab.name })} direction={1} disabled={index === group.rooms.length - 1} onClick={() => onMoveRoom(room.tab.id, 1)} />
                                {room.editable ? <ChevronRight size={16} className="shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" /> : null}
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </SettingsListGroup>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default SettingsHouseStructurePage;
