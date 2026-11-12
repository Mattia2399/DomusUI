import React from 'react';
import { Layers, Trash2, X } from 'lucide-react';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import { useI18n } from '../../i18n/I18nProvider';
import { TextField, type FloorChoice, type FloorDraft } from './RoomManageSheets';

export function FloorEditPanel({ floor, haFields, roomCount, busy, error, onSave, onDelete, onClose }: {
  floor: FloorChoice | null;
  haFields: boolean;
  roomCount: number;
  busy: boolean;
  error: string | null;
  onSave: (draft: FloorDraft) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const rt = useRoomsTranslations();
  const { t } = useI18n();
  const [name, setName] = React.useState(floor?.name ?? '');
  const [level, setLevel] = React.useState(floor?.level == null ? '' : String(floor.level));
  const [aliases, setAliases] = React.useState(floor?.aliases?.join(', ') ?? '');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const trimmedName = name.replace(/\s+/g, ' ').trim();
  const validLevel = !haFields || level.trim() === '' || /^-?\d+$/.test(level.trim());
  const numericLevel = level.trim() === '' ? null : Number(level.trim());
  const valid = Boolean(trimmedName) && validLevel && (numericLevel === null || Number.isSafeInteger(numericLevel));
  const draft: FloorDraft = {
    name: trimmedName,
    level: haFields ? numericLevel : null,
    aliases: haFields ? Array.from(new Set(aliases.split(',').map((alias) => alias.trim()).filter(Boolean))) : [],
  };

  return (
    <div className="dv-panel" data-testid="rooms-floor-edit">
      <div className="flex items-center gap-3">
        <h2 className="m-0 min-w-0 flex-1 truncate text-[19px] font-bold">{floor ? floor.name : rt('newFloor')}</h2>
        <button type="button" className="dv-round dv-round-sm" aria-label={rt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      <div className="dv-card flex items-center gap-3">
        <span className="dv-icon-button pointer-events-none !h-10 !w-10 !rounded-[13px]" aria-hidden="true"><Layers size={18} /></span>
        <span className="min-w-0 truncate text-[15px] font-semibold">{trimmedName || rt('newFloor')}</span>
      </div>
      <TextField label={rt('nameLabel')} value={name} onChange={setName} />
      {haFields ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="dv-t2 text-[13px] font-bold">{t('settings.rooms.level')}</span>
            <input className="rooms-text-input" aria-label={t('settings.rooms.level')} inputMode="numeric" value={level} onChange={(event) => setLevel(event.target.value)} />
            <span className="dv-t2 text-xs leading-[1.4]">{t('settings.rooms.levelHint')}</span>
          </label>
          <TextField label={t('settings.rooms.aliases')} value={aliases} note={t('settings.rooms.aliasesHint')} onChange={setAliases} />
        </>
      ) : null}
      {floor && roomCount > 0 ? <p className="dv-t2 m-0 px-1 text-[13px]">{t('settings.rooms.deleteFloorBody')}</p> : null}
      {error ? <p role="alert" className="m-0 px-1 text-[13px] font-semibold text-[color:var(--dv-red)]">{error}</p> : null}
      <div className="flex flex-wrap gap-2.5">
        {floor ? (
          <button type="button" className="rooms-sheet-button is-danger basis-full" disabled={busy}
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              void onDelete().then((done) => done && onClose());
            }}>
            <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
            {confirmDelete ? t('settings.rooms.deleteTitle', { name: floor.name }) : t('settings.rooms.deleteFloor')}
          </button>
        ) : null}
        <button type="button" className="rooms-sheet-button flex-1" onClick={onClose}>{rt('cancel')}</button>
        <button type="button" className="rooms-sheet-button is-primary flex-[2]" disabled={busy || !valid}
          onClick={() => void onSave(draft).then((done) => done && onClose())}>
          {busy ? rt('saving') : floor ? rt('save') : rt('create')}
        </button>
      </div>
    </div>
  );
}
