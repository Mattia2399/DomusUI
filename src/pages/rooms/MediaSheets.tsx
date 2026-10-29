import { Check, Play, Power, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { MediaArt, MediaKindIcon } from '../../components/devices/cards/MediaCard';
import type { MediaModel } from '../../components/devices/model/media';

/*
 * The two small sheets of the media of a room, as on the board: which player
 * the room shows, when it has more than one, and how to start one that is
 * off (switch it on, play on from where it was, or from a source).
 */

function playerStatus(model: MediaModel, dt: ReturnType<typeof useDevicesTranslations>) {
  if (!model.available) return dt('unavailable');
  if (!model.on) return dt('mediaOff');
  if (model.title) return model.playing ? model.title : `${dt('mediaPaused')} · ${model.title}`;
  return model.app ?? dt('mediaNothing');
}

export function MediaPickPanel({
  players,
  shownId,
  onPick,
  onClose,
}: {
  players: MediaModel[];
  shownId: string | null;
  onPick: (entityId: string) => void;
  onClose: () => void;
}) {
  const dt = useDevicesTranslations();
  return (
    <div className="dv-panel">
      <div className="flex items-center gap-3">
        <h2 className="m-0 flex-1 text-xl font-bold tracking-[-0.02em]">{dt('mediaPickTitle')}</h2>
        <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      <div className="dv-card !py-0" role="radiogroup" aria-label={dt('mediaPickTitle')}>
        {players.map((model) => (
          <button
            key={model.entityId}
            type="button"
            role="radio"
            aria-checked={model.entityId === shownId}
            className="rooms-media-row"
            onClick={() => onPick(model.entityId)}
          >
            <span className="dv-icon-button pointer-events-none !h-10 !w-10" aria-hidden="true">
              <MediaKindIcon model={model} size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <span className="text-[15px] font-semibold">{model.name}</span>
              <span className={clsx('truncate text-[13px] font-medium', model.playing ? 'text-[color:var(--dv-blue)]' : 'dv-t2')}>
                {playerStatus(model, dt)}
              </span>
            </span>
            {model.entityId === shownId ? <Check size={18} strokeWidth={2.6} aria-hidden="true" className="text-[color:var(--dv-blue)]" /> : null}
          </button>
        ))}
      </div>
      <p className="dv-t2 m-0 text-[13px] font-medium leading-[1.45]">{dt('mediaPickNote')}</p>
    </div>
  );
}

export function MediaStartPanel({
  model,
  roomName,
  pictureUrl,
  onPowerOn,
  onResume,
  onSource,
  onClose,
}: {
  model: MediaModel;
  roomName: string;
  pictureUrl: string | null;
  onPowerOn: () => void;
  onResume: () => void;
  onSource: (source: string) => void;
  onClose: () => void;
}) {
  const dt = useDevicesTranslations();
  const sources = model.supports.source ? model.sources : [];
  return (
    <div className="dv-panel">
      <div className="flex items-center gap-3">
        <span className="dv-icon-button pointer-events-none !h-12 !w-12" aria-hidden="true">
          <MediaKindIcon model={model} size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{model.name}</h2>
          <span className="dv-t2 text-[13px] font-semibold">{dt('mediaStartOff', { room: roomName })}</span>
        </div>
        {model.supports.turnOn ? (
          <button type="button" className="dv-round" aria-label={dt('mediaPowerOn', { name: model.name })} onClick={onPowerOn}>
            <Power size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {model.title && model.supports.turnOn ? (
        <button type="button" className="rooms-resume" onClick={onResume}>
          <MediaArt model={model} pictureUrl={pictureUrl} className="rooms-resume-bg" />
          <MediaArt model={model} pictureUrl={pictureUrl} className="rooms-resume-art" />
          <span className="relative flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <span className="text-xs font-bold uppercase tracking-[0.06em] opacity-75">
              {model.kind === 'tv' ? dt('mediaResumeWatch') : dt('mediaResumeListen')}
            </span>
            <span className="truncate text-[17px] font-bold">{model.title}</span>
            {model.artist ? <span className="truncate text-[13px] font-medium opacity-80">{model.artist}</span> : null}
          </span>
          <span className="dv-np-play relative !h-12 !w-12" aria-hidden="true">
            <Play size={20} strokeWidth={0} fill="currentColor" className="translate-x-[1px]" />
          </span>
        </button>
      ) : null}

      {sources.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="dv-t2 text-[13px] font-bold">{dt('mediaSourceLabel')}</span>
          <div className="dv-card !py-0">
            {sources.map((source) => (
              <button key={source} type="button" className="rooms-media-row" onClick={() => onSource(source)}>
                <span className="flex-1 text-left text-[15px] font-semibold">{source}</span>
                <Play size={16} strokeWidth={0} fill="currentColor" aria-hidden="true" className="dv-t3" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="dv-t2 m-0 text-[13px] font-medium">{dt('mediaStartNote')}</p>
      )}
    </div>
  );
}
