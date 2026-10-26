import React from 'react';
import {
  Bath,
  BedDouble,
  Check,
  ChevronDown,
  CookingPot,
  DoorOpen,
  Droplet,
  Lightbulb,
  Monitor,
  Pencil,
  Plus,
  Settings2,
  ShieldAlert,
  Sofa,
  Thermometer,
  Trees,
  Tv,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import type { RoomIconKind } from './roomSummary';

/*
 * The head of a room: the floor menu and the add button, the room's name
 * with a line about it, the rooms as pills, and a row of short statuses that
 * lead to their sections.
 */

export const ROOM_ICONS: Record<RoomIconKind, LucideIcon> = {
  sofa: Sofa,
  kitchen: CookingPot,
  bed: BedDouble,
  bath: Bath,
  desk: Monitor,
  garage: Warehouse,
  garden: Trees,
  room: DoorOpen,
};

export type FloorOption = { id: string; name: string; roomCount: number };
export type RoomPill = { id: string; name: string; icon: RoomIconKind; alert: boolean };
export type StatusChip = {
  key: 'security' | 'climate' | 'lights' | 'humidity' | 'media';
  title: string;
  status: string;
  /** Colour of the round mark: a token of the room page. */
  tone: string;
  target: string | null;
};

const CHIP_ICONS: Record<StatusChip['key'], LucideIcon> = {
  security: ShieldAlert,
  climate: Thermometer,
  lights: Lightbulb,
  humidity: Droplet,
  media: Tv,
};

function FloorMenu({
  floors,
  selectedId,
  onSelect,
  onNewRoom,
  onManageFloors,
}: {
  floors: FloorOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNewRoom?: () => void;
  onManageFloors?: () => void;
}) {
  const dt = useDevicesTranslations();
  const rt = useRoomsTranslations();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const selected = floors.find((floor) => floor.id === selectedId) ?? floors[0];

  React.useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="dv-glass rv2-room-pill !pl-4 !pr-3.5"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected?.name}</span>
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="menu" aria-label={dt('floor')} className="dv-glass rv2-floor-menu flex flex-col rounded-[22px] p-1.5">
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              role="menuitemradio"
              aria-checked={floor.id === selected?.id}
              className={clsx('flex h-11 items-center gap-2.5 rounded-2xl border-0 px-3 text-left text-[15px] font-medium text-inherit', floor.id === selected?.id ? 'bg-[color:var(--dv-icon-off)]' : 'bg-transparent')}
              onClick={() => {
                onSelect(floor.id);
                setOpen(false);
              }}
            >
              <span className="flex w-[18px] justify-center" aria-hidden="true">
                {floor.id === selected?.id ? <Check size={16} strokeWidth={2.6} /> : null}
              </span>
              <span className="flex-1">{floor.name}</span>
              <span className="dv-t3 text-[13px]">
                {floor.roomCount === 1 ? dt('roomCountOne') : dt('roomCountMany', { count: floor.roomCount })}
              </span>
            </button>
          ))}
          {onNewRoom || onManageFloors ? <span className="rv2-floor-menu-sep" aria-hidden="true" /> : null}
          {[
            onNewRoom ? { key: 'room', label: rt('newRoom'), Icon: Plus, run: onNewRoom } : null,
            onManageFloors ? { key: 'floors', label: rt('manageFloors'), Icon: Settings2, run: onManageFloors } : null,
          ]
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .map(({ key, label, Icon, run }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                className="flex h-11 items-center gap-2.5 rounded-2xl border-0 bg-transparent px-3 text-left text-[15px] font-medium text-inherit"
                onClick={() => {
                  setOpen(false);
                  run();
                }}
              >
                <span className="flex w-[18px] justify-center" aria-hidden="true">
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <span className="flex-1">{label}</span>
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function RoomHead({
  name,
  subtitle,
  floors,
  selectedFloorId,
  onSelectFloor,
  rooms,
  activeRoomId,
  onSelectRoom,
  chips,
  onAdd,
  onEditRoom,
  onNewRoom,
  onManageFloors,
}: {
  name: string;
  subtitle: string;
  floors: FloorOption[];
  selectedFloorId: string;
  onSelectFloor: (id: string) => void;
  rooms: RoomPill[];
  activeRoomId: string;
  onSelectRoom: (id: string) => void;
  chips: StatusChip[];
  onAdd?: () => void;
  onEditRoom?: () => void;
  onNewRoom?: () => void;
  onManageFloors?: () => void;
}) {
  const dt = useDevicesTranslations();
  const rt = useRoomsTranslations();
  const goTo = (target: string | null) => {
    if (!target) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(target)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="rv2-head">
        <div className="rv2-head-tools">
          <FloorMenu floors={floors} selectedId={selectedFloorId} onSelect={onSelectFloor} onNewRoom={onNewRoom} onManageFloors={onManageFloors} />
          <div className="flex gap-2.5">
            {onAdd ? (
              <button type="button" className="dv-glass dv-round !h-11 !w-11" aria-label={dt('addAccessory')} onClick={onAdd}>
                <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
            {onEditRoom ? (
              <button type="button" className="dv-glass dv-round !h-11 !w-11" aria-label={rt('editRoom')} onClick={onEditRoom}>
                <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="rv2-head-title">
          <h1 className="rv2-title" aria-live="polite">
            {name}
          </h1>
          <p className="dv-t2 m-0 text-base font-medium">{subtitle}</p>
        </div>
      </div>

      <nav aria-label={dt('roomsNav')} className="rv2-strip">
        {rooms.map((room) => {
          const Icon = ROOM_ICONS[room.icon];
          const current = room.id === activeRoomId;
          return (
            <button
              key={room.id}
              type="button"
              className={clsx('dv-glass rv2-room-pill', current && 'is-on')}
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelectRoom(room.id)}
            >
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              <span>{room.name}</span>
              {room.alert ? <span role="img" aria-label={dt('needsAttention')} className="rv2-alert-dot" /> : null}
            </button>
          );
        })}
      </nav>

      {chips.length > 0 ? (
        <div className="rv2-strip" role="list">
          {chips.map((chip) => {
            const Icon = CHIP_ICONS[chip.key];
            const content = (
              <>
                <span className="rv2-chip-mark" style={{ background: `var(--rv2-${chip.tone})`, color: `var(--rv2-${chip.tone}-ink)` }}>
                  <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-px">
                  <span className="whitespace-nowrap text-sm font-semibold">{chip.title}</span>
                  <span className="dv-t2 whitespace-nowrap text-xs font-medium">{chip.status}</span>
                </span>
              </>
            );
            return (
              <div key={chip.key} role="listitem" className="flex-none">
                {chip.target ? (
                  <button type="button" className="dv-glass rv2-chip" onClick={() => goTo(chip.target)}>
                    {content}
                  </button>
                ) : (
                  <span className="dv-glass rv2-chip">{content}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export default RoomHead;
