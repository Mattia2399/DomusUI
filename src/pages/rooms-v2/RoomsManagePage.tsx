import React from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Droplet,
  Layers,
  Leaf,
  Lightbulb,
  Plug,
  Plus,
  ShieldCheck,
  Thermometer,
  Trash2,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import GlassSegmentSelect from '../../components/ui/GlassSegmentSelect';
import GlassToggle from '../../components/ui/GlassToggle';
import type { RoomTab } from '../../components/rooms/roomsDirectory';
import { useDevicesTranslations, type DevicesTranslationKey } from '../../i18n/devicesTranslations';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import { ROOM_ICONS } from './RoomHead';
import type { RoomIconKind } from './roomSummary';
import { glowCss, type FloorChoice } from './RoomManageSheets';
import { moveSection, toggleSection, type LayoutSection, type SectionLayout } from './roomLayout';

/*
 * "Stanze e sezioni" of the board: the rooms by floor in the order of the
 * bar, the floors with their order, and the order and visibility of the
 * sections, for every room or for the one open. On a phone the sections
 * follow this order; on a large screen they keep their two columns.
 */

export type ManageTab = 'rooms' | 'floors' | 'sections';

export const SECTION_LABEL: Record<LayoutSection, DevicesTranslationKey> = {
  scenes: 'sectionScenes',
  climate: 'sectionClimate',
  sensors: 'sectionEnvironment',
  lights: 'lights',
  switches: 'sectionDevices',
  security: 'sectionSecurity',
  media: 'sectionMedia',
};

const SECTION_ICON: Record<LayoutSection, LucideIcon> = {
  scenes: Leaf,
  climate: Thermometer,
  sensors: Droplet,
  lights: Lightbulb,
  switches: Plug,
  security: ShieldCheck,
  media: Tv,
};

// How tall each section looks in the phone preview, as on the board.
const PREVIEW_HEIGHT: Record<LayoutSection, number> = { scenes: 34, climate: 58, sensors: 50, lights: 58, switches: 50, security: 50, media: 64 };

export type ManagedRoom = {
  tab: RoomTab;
  floorId: string | null;
  icon: RoomIconKind;
  glow: [string, string];
  hidden: boolean;
  devices: number;
  editable: boolean;
};

function Step({ label, disabled, onClick, children, danger = false }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" className={clsx('rv2-step', danger && 'is-danger')} aria-label={label} aria-disabled={disabled || undefined} onClick={() => !disabled && onClick()}>
      {children}
    </button>
  );
}

/** A floor's name, changed where it is; sent when the field is left or Enter is pressed. */
function FloorName({ name, label, disabled, onRename }: { name: string; label: string; disabled: boolean; onRename: (name: string) => void }) {
  const [value, setValue] = React.useState(name);
  React.useEffect(() => setValue(name), [name]);
  const commit = () => {
    const next = value.replace(/\s+/g, ' ').trim();
    if (next && next !== name) onRename(next);
    else setValue(name);
  };
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        className="rv2-inline-input"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setValue(name);
            event.stopPropagation();
          }
        }}
      />
    </label>
  );
}

export function RoomsManagePage({
  tab,
  onTab,
  currentRoom,
  rooms,
  floors,
  canManageFloors,
  sectionsAll,
  sectionsRoom,
  busy,
  error,
  onClose,
  onNewRoom,
  onEditRoom,
  onMoveRoom,
  onNewFloor,
  onRenameFloor,
  onMoveFloor,
  onDeleteFloor,
  onSections,
  onResetRoomSections,
}: {
  tab: ManageTab;
  onTab: (tab: ManageTab) => void;
  currentRoom: RoomTab | null;
  rooms: ManagedRoom[];
  floors: FloorChoice[];
  canManageFloors: boolean;
  sectionsAll: SectionLayout;
  /** The open room's own sections; null when it uses those of every room. */
  sectionsRoom: SectionLayout | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onNewRoom: () => void;
  onEditRoom: (room: RoomTab) => void;
  onMoveRoom: (roomId: string, direction: -1 | 1) => void;
  onNewFloor: () => void;
  onRenameFloor: (floorId: string, name: string) => void;
  onMoveFloor: (floorId: string, direction: -1 | 1) => void;
  onDeleteFloor: (floorId: string) => void;
  onSections: (scope: 'all' | 'room', next: SectionLayout) => void;
  onResetRoomSections: () => void;
}) {
  const rt = useRoomsTranslations();
  const dt = useDevicesTranslations();
  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const [scope, setScope] = React.useState<'all' | 'room'>('all');
  const roomScope = scope === 'room' && currentRoom !== null;
  const sections = roomScope ? sectionsRoom ?? sectionsAll : sectionsAll;
  const changeSections = (next: SectionLayout) => onSections(roomScope ? 'room' : 'all', next);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // A sheet open above the page closes on its own; the page stays.
      const above = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some((dialog) => dialog !== pageRef.current);
      if (!above) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const countRooms = (count: number) => (count === 1 ? rt('countRoomsOne') : rt('countRoomsMany', { count }));
  const floorIds = new Set(floors.map((floor) => floor.id));
  const groups = [
    ...floors.map((floor) => ({ key: floor.id, name: floor.name, rooms: rooms.filter((room) => room.floorId === floor.id) })),
    { key: '', name: rt('noFloor'), rooms: rooms.filter((room) => !room.floorId || !floorIds.has(room.floorId)) },
  ].filter((group) => group.key !== '' || group.rooms.length > 0);
  const tabs: Array<[ManageTab, string]> = [
    ['rooms', rt('manageTabRooms')],
    ['floors', rt('manageTabFloors')],
    ['sections', rt('manageTabSections')],
  ];
  const subtitle = rt('manageSubtitle', {
    rooms: countRooms(rooms.length),
    floors: floors.length === 1 ? rt('countFloorsOne') : rt('countFloorsMany', { count: floors.length }),
  });

  return (
    <div ref={pageRef} className="rv2-page" role="dialog" aria-modal="true" aria-labelledby="rv2-manage-title" data-testid="rooms-v2-manage">
      <div className="rv2-page-inner">
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="dv-glass rv2-pill inline-flex !h-11 items-center gap-1.5 !rounded-[22px] !pl-2.5 !pr-4 !text-[15px]" onClick={onClose}>
            <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
            <span className="max-w-[40vw] truncate">{currentRoom?.name ?? rt('close')}</span>
          </button>
          {tab === 'rooms' ? (
            <button type="button" className="dv-glass rv2-pill inline-flex !h-11 items-center gap-1.5 !rounded-[22px] !pl-3 !pr-4 !text-[15px]" onClick={onNewRoom}>
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              {rt('newRoom')}
            </button>
          ) : tab === 'floors' && canManageFloors ? (
            <button type="button" className="dv-glass rv2-pill inline-flex !h-11 items-center gap-1.5 !rounded-[22px] !pl-3 !pr-4 !text-[15px]" disabled={busy} onClick={onNewFloor}>
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              {rt('newFloor')}
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 px-1">
          <h1 id="rv2-manage-title" className="m-0 text-[clamp(34px,4.2cqi,48px)] font-bold leading-[1.05] tracking-[-0.035em]">
            {rt('roomsAndSections')}
          </h1>
          <p className="dv-t2 m-0 text-[15px] font-medium">{subtitle}</p>
        </div>

        <GlassSegmentSelect<ManageTab>
          className="rv2-seg-shared"
          ariaLabel={rt('manageWhat')}
          options={tabs.map(([key, label]) => ({ value: key, label }))}
          value={tab}
          onChange={onTab}
        />

        {error ? (
          <p role="alert" className="m-0 px-1 text-[13px] font-semibold text-[color:var(--dv-red)]">
            {error}
          </p>
        ) : null}

        {tab === 'rooms' ? (
          <>
            <div className="rv2-manage-cols">
              {groups.map((group) => (
                <section key={group.key || 'none'} className="flex flex-col gap-2" aria-label={group.name}>
                  <div className="flex items-baseline justify-between px-1">
                    <span className="text-[17px] font-bold">{group.name}</span>
                    <span className="dv-t3 text-[13px] font-semibold">{countRooms(group.rooms.length)}</span>
                  </div>
                  <div className="dv-glass rv2-manage-list">
                    {group.rooms.length === 0 ? <div className="rv2-manage-row dv-t2 text-sm font-medium">{rt('noRoomsOnFloor')}</div> : null}
                    {group.rooms.map((room, index) => {
                      const Icon = ROOM_ICONS[room.icon];
                      const sub = [room.devices === 1 ? rt('devicesOne') : rt('devicesMany', { count: room.devices }), room.hidden ? rt('hiddenTag') : null]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <div key={room.tab.id} className={clsx('rv2-manage-row', room.hidden && 'is-dim')}>
                          <span className="rv2-room-badge" aria-hidden="true" style={{ background: glowCss(room.glow) }}>
                            <Icon size={19} strokeWidth={2} />
                          </span>
                          <button
                            type="button"
                            className="rv2-manage-main"
                            disabled={!room.editable}
                            aria-label={rt('editNamed', { name: room.tab.name })}
                            onClick={() => onEditRoom(room.tab)}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[15px] font-semibold">{room.tab.name}</span>
                              {room.tab.id === currentRoom?.id ? <span className="rv2-now">{rt('roomOpenTag')}</span> : null}
                            </span>
                            <span className="dv-t2 text-[13px] font-medium">{sub}</span>
                          </button>
                          <Step label={rt('moveRoomBefore', { name: room.tab.name })} disabled={index === 0} onClick={() => onMoveRoom(room.tab.id, -1)}>
                            <ChevronUp size={16} strokeWidth={2.4} aria-hidden="true" />
                          </Step>
                          <Step label={rt('moveRoomAfter', { name: room.tab.name })} disabled={index === group.rooms.length - 1} onClick={() => onMoveRoom(room.tab.id, 1)}>
                            <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
                          </Step>
                          {room.editable ? <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" className="dv-t3 flex-none" /> : <span className="w-4 flex-none" />}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p className="dv-t2 m-0 px-1 text-[13px] font-medium leading-[1.45]">{rt('roomsOrderNote')}</p>
          </>
        ) : null}

        {tab === 'floors' ? (
          <>
            <div className="dv-glass rv2-manage-list max-w-[640px]">
              {floors.length === 0 ? <div className="rv2-manage-row dv-t2 text-sm font-medium">{rt('noFloors')}</div> : null}
              {floors.map((floor, index) => {
                const count = rooms.filter((room) => room.floorId === floor.id).length;
                const canDelete = canManageFloors && count === 0;
                return (
                  <div key={floor.id} className="rv2-manage-row">
                    <span className="dv-icon-button pointer-events-none !h-10 !w-10 !rounded-[13px]" aria-hidden="true">
                      <Layers size={18} strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <FloorName name={floor.name} label={rt('floorNameAria', { n: index + 1 })} disabled={!canManageFloors || busy} onRename={(name) => onRenameFloor(floor.id, name)} />
                      <span className="dv-t2 pl-0.5 text-[13px] font-medium">{countRooms(count)}</span>
                    </span>
                    <Step label={rt('moveFloorBefore')} disabled={!canManageFloors || busy || index === 0} onClick={() => onMoveFloor(floor.id, -1)}>
                      <ChevronUp size={16} strokeWidth={2.4} aria-hidden="true" />
                    </Step>
                    <Step label={rt('moveFloorAfter')} disabled={!canManageFloors || busy || index === floors.length - 1} onClick={() => onMoveFloor(floor.id, 1)}>
                      <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
                    </Step>
                    <Step
                      danger
                      label={count > 0 ? rt('floorNotEmpty', { name: floor.name }) : rt('deleteNamed', { name: floor.name })}
                      disabled={!canDelete || busy}
                      onClick={() => onDeleteFloor(floor.id)}
                    >
                      <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                    </Step>
                  </div>
                );
              })}
            </div>
            <p className="dv-t2 m-0 max-w-[640px] px-1 text-[13px] font-medium leading-[1.45]">{rt('floorsNote')}</p>
          </>
        ) : null}

        {tab === 'sections' ? (
          <div className="rv2-manage-sections">
            <div className="flex min-w-0 max-w-[560px] flex-[1_1_360px] flex-col gap-3">
              {currentRoom ? (
                <GlassSegmentSelect<'all' | 'room'>
                  className="rv2-seg-shared"
                  ariaLabel={rt('scopeAria')}
                  options={[
                    { value: 'all', label: rt('scopeAll') },
                    { value: 'room', label: rt('scopeRoom', { room: currentRoom.name }) },
                  ]}
                  value={scope}
                  onChange={setScope}
                />
              ) : null}
              {currentRoom ? (
                <div className="flex min-h-8 items-center justify-between gap-2.5 px-1">
                  <span className="dv-t2 text-[13px] font-semibold">
                    {sectionsRoom ? rt('sectionsCustom', { room: currentRoom.name }) : rt('sectionsShared', { room: currentRoom.name })}
                  </span>
                  {sectionsRoom ? (
                    <button type="button" className="dv-option !h-8 !text-[13px]" onClick={onResetRoomSections}>
                      {rt('sectionsReset')}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="dv-glass rv2-manage-list">
                {sections.order.map((key, index) => {
                  const Icon = SECTION_ICON[key];
                  const name = dt(SECTION_LABEL[key]);
                  const on = !sections.hidden[key];
                  return (
                    <div key={key} className="rv2-manage-row">
                      <span className={clsx('dv-icon-button pointer-events-none !h-9 !w-9 !rounded-[11px]', !on && 'opacity-45')} aria-hidden="true">
                        <Icon size={17} strokeWidth={2} />
                      </span>
                      <span className={clsx('min-w-0 flex-1 text-[15px] font-semibold', !on && 'opacity-45')}>
                        {name}
                      </span>
                      <Step label={rt('moveSectionUp', { name })} disabled={index === 0} onClick={() => changeSections(moveSection(sections, key, -1))}>
                        <ChevronUp size={16} strokeWidth={2.4} aria-hidden="true" />
                      </Step>
                      <Step label={rt('moveSectionDown', { name })} disabled={index === sections.order.length - 1} onClick={() => changeSections(moveSection(sections, key, 1))}>
                        <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
                      </Step>
                      <GlassToggle checked={on} label={name} onChange={() => changeSections(toggleSection(sections, key))} />
                    </div>
                  );
                })}
              </div>
              <p className="dv-t2 m-0 px-1 text-[13px] font-medium leading-[1.45]">{rt('sectionsNote')}</p>
            </div>
            <div className="rv2-phone" aria-hidden="true">
              <span className="rv2-phone-notch" />
              <span className="rv2-phone-title">{currentRoom?.name}</span>
              {sections.order
                .filter((key) => !sections.hidden[key])
                .map((key, index) => (
                  <span key={key} className="rv2-phone-block" style={{ height: PREVIEW_HEIGHT[key] }}>
                    <b>{index + 1}</b>
                    {dt(SECTION_LABEL[key])}
                  </span>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default RoomsManagePage;
