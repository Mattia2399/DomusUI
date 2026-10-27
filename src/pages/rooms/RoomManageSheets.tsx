import React from 'react';
import { Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import GlassDropdown, { type GlassDropdownOption } from '../../components/ui/GlassDropdown';
import GlassToggle from '../../components/ui/GlassToggle';
import type { RoomTab } from '../../components/rooms/roomsDirectory';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useRoomsTranslations, type RoomsTranslationKey } from '../../i18n/roomsTranslations';
import { ROOM_ICONS } from './RoomHead';
import { roomIconKind, type RoomIconKind } from './roomSummary';
import { ROOM_ICON_CHOICES, roomDraftOf, type RoomDraft } from './roomManagement';
import { ROOM_GLOWS, type RoomLook } from './roomLayout';

/*
 * The sheet that creates or changes a room, as on the board: a preview in its
 * colour, the name, the icon, the floor, the colour of its glow, hiding it
 * from the bar and deleting it (tap twice). A Home Assistant area also has
 * its picture, aliases and sensors, in the grouped rows of the Profile page.
 */

export const ICON_LABEL: Record<RoomIconKind, RoomsTranslationKey> = {
  sofa: 'iconSofa',
  kitchen: 'iconKitchen',
  bed: 'iconBed',
  bath: 'iconBath',
  desk: 'iconDesk',
  garage: 'iconGarage',
  garden: 'iconGarden',
  washer: 'iconWasher',
  tv: 'iconTv',
  book: 'iconBook',
  room: 'iconRoom',
};

// Above the panel the dropdowns open in (260).
const DROPDOWN_Z = 400;

export type FloorChoice = { id: string; name: string };
export type SensorOptions = { temperature: GlassDropdownOption[]; humidity: GlassDropdownOption[] };
export type RoomSheetResult = { draft: RoomDraft; look: Pick<RoomLook, 'glow' | 'hidden'> };

export const glowCss = ([a, b]: [string, string]) => `linear-gradient(145deg, ${a}, ${b})`;

/** A field as the name of the room: its label above, the field across the sheet, a note below. */
function TextField({ label, value, placeholder, note, onChange }: { label: string; value: string; placeholder?: string; note?: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="dv-t2 text-[13px] font-bold">{label}</span>
      <input className="rooms-text-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      {note ? <span className="dv-t2 text-xs leading-[1.4]">{note}</span> : null}
    </label>
  );
}

function SelectField({ label, options, value, onChange }: { label: string; options: GlassDropdownOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="dv-t2 text-[13px] font-bold" aria-hidden="true">
        {label}
      </span>
      <GlassDropdown
        ariaLabel={label}
        options={options}
        selected={options.find((option) => option.id === value) ?? options[0] ?? null}
        onChange={(option) => onChange(option.id)}
        buttonClassName="rooms-select"
        portalZIndex={DROPDOWN_Z}
      />
    </div>
  );
}

export function RoomEditPanel({
  room,
  area,
  look,
  fallbackGlow,
  haFields,
  nameLocked,
  floors,
  sensors,
  canHide,
  canDelete,
  busy,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  /** The room changed; null for a new one. */
  room: RoomTab | null;
  area: HaArea | null;
  look: RoomLook;
  /** The glow the room has when none was chosen. */
  fallbackGlow: [string, string];
  /** The picture, aliases and sensors of a Home Assistant area. */
  haFields: boolean;
  /** The demo's own rooms keep their name. */
  nameLocked: boolean;
  floors: FloorChoice[];
  sensors: SensorOptions;
  canHide: boolean;
  canDelete: boolean;
  busy: boolean;
  error: string | null;
  onSave: (result: RoomSheetResult) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const rt = useRoomsTranslations();
  const [draft, setDraft] = React.useState<RoomDraft>(() => {
    const base = roomDraftOf(area, room?.name ?? '');
    return area ? base : { ...base, icon: look.icon ?? '', floorId: look.floor ?? (room ? '' : floors[0]?.id ?? '') };
  });
  const [glow, setGlow] = React.useState<number | undefined>(look.glow);
  const [hidden, setHidden] = React.useState(Boolean(look.hidden));
  const [askingDelete, setAskingDelete] = React.useState(false);
  const set = (patch: Partial<RoomDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const valid = draft.name.trim().length > 0;
  const iconKind = roomIconKind(draft.icon, draft.name);
  const PreviewIcon = ROOM_ICONS[iconKind];
  const none = { id: '', name: rt('sensorNone') };
  const preview = glow === undefined ? fallbackGlow : ROOM_GLOWS[glow];
  const floorChoices: FloorChoice[] = [...floors, ...(haFields || floors.length === 0 ? [{ id: '', name: rt('noFloor') }] : [])];

  return (
    <div className="dv-panel" data-testid="rooms-room-edit">
      <div className="flex items-center gap-3">
        <h2 className="m-0 min-w-0 flex-1 truncate text-[19px] font-bold">{room ? rt('editRoom') : rt('newRoom')}</h2>
        <button type="button" className="dv-round dv-round-sm" aria-label={rt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div className="rooms-room-preview" aria-hidden="true" style={{ background: glowCss(preview) }}>
        <PreviewIcon size={26} strokeWidth={2} />
        <span className="truncate">{draft.name.trim() || rt('newRoom')}</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="dv-t2 text-[13px] font-bold">{rt('nameLabel')}</span>
        <input
          className="rooms-text-input"
          value={draft.name}
          placeholder={rt('roomNamePlaceholder')}
          disabled={nameLocked}
          autoFocus={!room}
          onChange={(event) => set({ name: event.target.value })}
        />
        {nameLocked ? <span className="dv-t2 text-xs">{rt('demoRoomName')}</span> : null}
      </label>

      <div className="flex flex-col gap-2">
        <span className="dv-t2 text-[13px] font-bold">{rt('icon')}</span>
        <div className="rooms-icon-grid" role="radiogroup" aria-label={rt('icon')}>
          {ROOM_ICON_CHOICES.map(([kind, icon]) => {
            const Icon = ROOM_ICONS[kind];
            const chosen = iconKind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={rt(ICON_LABEL[kind])}
                className={clsx('rooms-icon-choice', chosen && 'is-on')}
                onClick={() => set({ icon })}
              >
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      {floorChoices.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className="dv-t2 text-[13px] font-bold">{rt('floor')}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rt('floor')}>
            {floorChoices.map((floor) => (
              <button
                key={floor.id || 'none'}
                type="button"
                role="radio"
                aria-checked={draft.floorId === floor.id}
                className={clsx('dv-option', draft.floorId === floor.id && 'is-on')}
                onClick={() => set({ floorId: floor.id })}
              >
                {floor.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="dv-t2 text-[13px] font-bold">{rt('glowLabel')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rt('glowLabel')}>
          {ROOM_GLOWS.map((colours, index) => (
            <button
              key={colours.join()}
              type="button"
              role="radio"
              aria-checked={glow === index}
              aria-label={rt('glowAria', { n: index + 1 })}
              className="rooms-swatch"
              onClick={() => setGlow(glow === index ? undefined : index)}
            >
              <span style={{ background: glowCss(colours), boxShadow: glow === index ? `0 0 0 2px var(--dv-sheet-ring), 0 0 0 4px ${colours[0]}` : 'none' }} />
            </button>
          ))}
        </div>
      </div>

      {canHide ? (
        <div className="dv-card !py-1">
          <div className="flex min-h-14 items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{rt('hideFromBar')}</span>
              <span className="dv-t2 text-[13px] font-medium">{rt('hideFromBarNote')}</span>
            </span>
            <GlassToggle checked={hidden} label={rt('hideFromBar')} onChange={setHidden} />
          </div>
        </div>
      ) : null}

      {haFields ? (
        <>
          <TextField label={rt('image')} value={draft.picture} placeholder="/local/rooms/studio.jpg" onChange={(picture) => set({ picture })} />
          <TextField
            label={rt('aliases')}
            value={draft.aliases}
            placeholder="studio, ufficio"
            note={rt('aliasesDescription')}
            onChange={(aliases) => set({ aliases })}
          />
          <SelectField
            label={rt('temperatureEntity')}
            options={[none, ...sensors.temperature]}
            value={draft.temperatureEntityId}
            onChange={(temperatureEntityId) => set({ temperatureEntityId })}
          />
          <SelectField
            label={rt('humidityEntity')}
            options={[none, ...sensors.humidity]}
            value={draft.humidityEntityId}
            onChange={(humidityEntityId) => set({ humidityEntityId })}
          />
        </>
      ) : null}

      {!room && !haFields ? <p className="dv-t2 m-0 px-1 text-[13px] leading-[1.45]">{rt('roomSavedOffline')}</p> : null}
      {error ? (
        <p role="alert" className="m-0 px-1 text-[13px] font-semibold text-[color:var(--dv-red)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        {canDelete ? (
          <button
            type="button"
            className="rooms-sheet-button is-danger basis-full"
            disabled={busy}
            onClick={() => {
              if (!askingDelete) {
                setAskingDelete(true);
                return;
              }
              void onDelete().then((done) => done && onClose());
            }}
          >
            <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
            {askingDelete ? rt('deleteRoomAgain') : rt('deleteRoom')}
          </button>
        ) : null}
        <button type="button" className="rooms-sheet-button flex-1" onClick={onClose}>
          {rt('cancel')}
        </button>
        <button
          type="button"
          className="rooms-sheet-button is-primary flex-[2]"
          disabled={busy || !valid}
          onClick={() => void onSave({ draft, look: { glow, hidden } }).then((done) => done && onClose())}
        >
          {busy ? rt('saving') : room ? rt('save') : rt('createRoom')}
        </button>
      </div>
    </div>
  );
}
