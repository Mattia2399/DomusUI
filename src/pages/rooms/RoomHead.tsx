import React from 'react';
import {
  Bath,
  BedDouble,
  BookOpen,
  Check,
  ChevronDown,
  CookingPot,
  DoorOpen,
  Droplet,
  Lightbulb,
  House,
  Monitor,
  Plus,
  SlidersHorizontal,
  ShieldAlert,
  Sofa,
  Thermometer,
  Trees,
  Tv,
  Warehouse,
  WashingMachine,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import type { RoomIconKind } from './roomSummary';

/*
 * The head of a room: the floor menu, the add menu and "Stanze e sezioni", the room's name
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
  washer: WashingMachine,
  tv: Tv,
  book: BookOpen,
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

/** A menu closes on a press outside it or on Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLDivElement | null>, close: () => void) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [close, open, ref]);
}

function FloorMenu({ floors, selectedId, onSelect }: { floors: FloorOption[]; selectedId: string; onSelect: (id: string) => void }) {
  const dt = useDevicesTranslations();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const selected = floors.find((floor) => floor.id === selectedId) ?? floors[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="dv-glass rooms-room-pill !pl-4 !pr-3.5"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected?.name}</span>
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="menu" aria-label={dt('floor')} className="dv-glass rooms-floor-menu flex flex-col rounded-[22px] p-1.5">
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
        </div>
      ) : null}
    </div>
  );
}

/** The "+" of the board: a new room, or a device brought into this one. */
function AddMenu({ onNewRoom, onAddDevice }: { onNewRoom?: () => void; onAddDevice?: () => void }) {
  const dt = useDevicesTranslations();
  const rt = useRoomsTranslations();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const items = [
    onNewRoom ? { key: 'room', label: rt('newRoom'), Icon: House, run: onNewRoom } : null,
    onAddDevice ? { key: 'device', label: dt('addAccessory'), Icon: Plus, run: onAddDevice } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="dv-glass dv-round !h-11 !w-11"
        aria-label={rt('add')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label={rt('add')} className="dv-glass rooms-add-menu">
          {items.map(({ key, label, Icon, run }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                run();
              }}
            >
              <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
              <span>{label}</span>
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
  onNewRoom,
  onAddDevice,
  onManage,
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
  onNewRoom?: () => void;
  onAddDevice?: () => void;
  /** Opens "Stanze e sezioni". */
  onManage?: () => void;
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
      <div className="rooms-head">
        <div className="rooms-head-tools">
          <FloorMenu floors={floors} selectedId={selectedFloorId} onSelect={onSelectFloor} />
          <div className="flex gap-2.5">
            <AddMenu onNewRoom={onNewRoom} onAddDevice={onAddDevice} />
            {onManage ? (
              <button type="button" className="dv-glass dv-round !h-11 !w-11" aria-label={rt('manageRoomsSections')} onClick={onManage}>
                <SlidersHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="rooms-head-title">
          <h1 className="rooms-title" aria-live="polite">
            {name}
          </h1>
          <p className="dv-t2 m-0 text-base font-medium">{subtitle}</p>
        </div>
      </div>

      <nav aria-label={dt('roomsNav')} className="rooms-strip">
        {rooms.map((room) => {
          const Icon = ROOM_ICONS[room.icon];
          const current = room.id === activeRoomId;
          return (
            <button
              key={room.id}
              type="button"
              className={clsx('dv-glass rooms-room-pill', current && 'is-on')}
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelectRoom(room.id)}
            >
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              <span>{room.name}</span>
              {room.alert ? <span role="img" aria-label={dt('needsAttention')} className="rooms-alert-dot" /> : null}
            </button>
          );
        })}
      </nav>

      {chips.length > 0 ? (
        <div className="rooms-strip" role="list">
          {chips.map((chip) => {
            const Icon = CHIP_ICONS[chip.key];
            const content = (
              <>
                <span className="rooms-chip-mark" style={{ background: `var(--rooms-${chip.tone})`, color: `var(--rooms-${chip.tone}-ink)` }}>
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
                  <button type="button" className="dv-glass rooms-chip" onClick={() => goTo(chip.target)}>
                    {content}
                  </button>
                ) : (
                  <span className="dv-glass rooms-chip">{content}</span>
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
