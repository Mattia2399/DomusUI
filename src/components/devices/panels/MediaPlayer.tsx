import React from 'react';
import { Check, ChevronDown, ChevronLeft, Layers, Monitor, Music, Power, Repeat, Repeat1, Shuffle, SlidersHorizontal, Speaker, Tv, Volume2, VolumeX, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { usePanelSpecTranslations } from '../../../i18n/panelSpecTranslations';
import { extractPictureColor } from '../../../theme/ambient/roomPictureColor';
import { GlassChips } from '../../ui/GlassChips';
import { GlassShortcut } from '../../ui/GlassShortcut';
import { GlassSlider } from '../../ui/GlassSlider';
import { MediaProgress, MediaTransport, useMediaClock } from '../cards/MediaCard';
import { ScrollingName } from '../cards/ScrollingName';
import { REPEAT_NEXT, type MediaAction, type MediaModel } from '../model/media';
import './mediaPlayer.css';

/*
 * The player: over the whole screen on a phone, a window in Rooms on a large screen, the
 * column in the Home. The only place of the volume. Docs: docs/design/pannelli/MediaPlayer.dc.html
 *
 * What is behind it comes from the cover: blurred, so that it works with any picture.
 * Below the volume, a row that opens what the player offers of speakers, sources and sound.
 */

export type MediaGroupCandidate = { entityId: string; name: string; roomName: string | null };

export type MediaPlayerSurface = 'screen' | 'window' | 'column';

export type MediaPlayerProps = {
  model: MediaModel;
  pictureUrl: string | null;
  /** Other players this one can play together with. */
  groupCandidates: MediaGroupCandidate[];
  surface?: MediaPlayerSurface;
  onAction: (action: MediaAction) => void;
  onClose: () => void;
};

type Zone = 'speakers' | 'source' | 'audio';

const ICON = { size: 20, strokeWidth: 2 } as const;

/** The cover's colour for the column, which keeps a neutral ground. */
function useCoverColour(url: string | null, wanted: boolean) {
  const [colour, setColour] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!wanted || !url) {
      setColour(null);
      return undefined;
    }
    let stale = false;
    void extractPictureColor(url).then((found) => {
      if (!stale) setColour(found);
    });
    return () => {
      stale = true;
    };
  }, [url, wanted]);
  return colour;
}

export function MediaPlayer({ model, pictureUrl, groupCandidates, surface = 'screen', onAction, onClose }: MediaPlayerProps) {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const now = useMediaClock(model.playing);
  const root = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const [zone, setZone] = React.useState<Zone | null>(null);
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);
  const picture = pictureUrl && pictureUrl !== brokenUrl ? pictureUrl : null;
  const modal = surface !== 'column';
  const colour = useCoverColour(picture, surface === 'column');

  const off = !model.on;
  const nothing = !off && !model.title && !model.app && !model.source;
  const isTv = model.kind === 'tv';
  const hasCover = Boolean(picture) && !off && !nothing;
  const hasSources = model.supports.source && model.sources.length > 0;
  const hasAudio = model.supports.soundMode && model.soundModes.length > 0;
  const canGroup = model.supports.group && groupCandidates.length > 0;
  const others = model.groupMembers.filter((member) => member !== model.entityId).length;
  const shown = zone === 'speakers' ? canGroup : zone === 'source' ? hasSources : zone === 'audio' ? hasAudio : false;
  const openZone = shown && !off ? zone : null;

  React.useEffect(() => {
    if (!modal) return undefined;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const above = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some((dialog) => dialog !== root.current && !dialog.contains(root.current));
      if (!above) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, [modal, onClose]);

  const onWhat = off ? dt('mediaOff') : isTv ? dt('mediaOnAir') : model.playing ? dt('mediaPlayingOn') : sp.t('mediaPausedOn');
  const title = off ? dt('mediaOff') : model.title ?? model.app ?? model.source ?? dt('mediaNothing');
  const subtitle = off ? model.name : nothing ? sp.t('mediaChoose') : model.title ? model.artist : model.title === null && model.source && model.app ? model.source : null;
  const volume = model.muted ? 0 : model.volume ?? 0;
  const KindIcon = others > 0 ? Layers : isTv ? Tv : Speaker;
  const RepeatIcon = model.repeat === 'one' ? Repeat1 : Repeat;
  const repeatLabel = model.repeat === 'off' ? dt('mediaRepeatOff') : model.repeat === 'all' ? dt('mediaRepeatAll') : dt('mediaRepeatOne');
  const NoCover = isTv && !off && !nothing ? Tv : Music;
  const name = others > 0 ? `${model.name} + ${others}` : model.name;
  const canPower = off ? model.supports.turnOn : model.supports.turnOff;

  const zoneBody = () => {
    if (openZone === 'speakers') {
      return (
        <>
          <p className="panel-media-zone-title">
            <b>{sp.t('mediaSpeakers')}</b>
            <span>{sp.t('mediaSpeakersNote')}</span>
          </p>
          <div className="panel-media-speakers">
            <div className="panel-media-speaker is-on">
              <span className="panel-media-tick" aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              <span>
                <b>{model.name}</b>
                {model.volume !== null ? <span>{volume}%</span> : null}
              </span>
            </div>
            {groupCandidates.map((candidate) => {
              const joined = model.groupMembers.includes(candidate.entityId);
              return (
                <button
                  key={candidate.entityId}
                  type="button"
                  role="checkbox"
                  aria-checked={joined}
                  className={clsx('panel-media-speaker', joined && 'is-on')}
                  onClick={() => onAction({ type: 'group', member: candidate.entityId, joined: !joined })}
                >
                  <span className="panel-media-tick" aria-hidden="true">
                    {joined ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                  <span>
                    <b>{candidate.name}</b>
                    {candidate.roomName ? <span>{candidate.roomName}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      );
    }
    if (openZone === 'source') {
      return (
        <>
          <p className="panel-media-zone-title">
            <b>{dt('mediaSourceLabel')}</b>
            <span>{sp.t('mediaSourceNote', { name: model.name })}</span>
          </p>
          <GlassChips<string> size="dialog" ariaLabel={dt('mediaSourceLabel')} options={model.sources.map((source) => ({ value: source, label: source }))} value={model.source} onChange={(source) => onAction({ type: 'source', source })} />
        </>
      );
    }
    return (
      <>
        <p className="panel-media-zone-title">
          <b>{dt('mediaTabAudio')}</b>
          <span>{sp.t('mediaAudioNote', { name: model.name })}</span>
        </p>
        <GlassChips<string> size="dialog" ariaLabel={dt('mediaSoundMode')} options={model.soundModes.map((mode) => ({ value: mode, label: mode }))} value={model.soundMode} onChange={(mode) => onAction({ type: 'sound_mode', mode })} />
      </>
    );
  };

  const style = colour ? ({ '--device-accent': colour, '--device-accent-ink': '#ffffff' } as React.CSSProperties) : undefined;

  const player = (
    <div
      ref={root}
      className={clsx('panel-media', `is-${surface}`, openZone && 'has-zone', off ? 'is-state-off' : nothing ? 'is-state-nothing' : isTv && !hasCover ? 'is-state-tv' : null, colour && 'has-colour')}
      style={style}
      role={modal ? 'dialog' : 'group'}
      aria-modal={modal ? true : undefined}
      aria-labelledby="panel-media-title"
      data-testid="media-player"
    >
      {hasCover && surface !== 'column' ? <img className="panel-media-backdrop" src={picture ?? undefined} alt="" aria-hidden="true" /> : null}
      <div className="panel-media-body">
        <div className="panel-media-head">
          <button ref={closeRef} type="button" className="panel-media-round" aria-label={dt('mediaMinimize')} onClick={onClose}>
            {surface === 'screen' ? <ChevronDown size={22} strokeWidth={2.4} aria-hidden="true" /> : <X size={18} strokeWidth={2.4} aria-hidden="true" />}
          </button>
          <div className="panel-media-where">
            <span>{onWhat}</span>
            {canGroup && !off ? (
              <button type="button" aria-expanded={openZone === 'speakers'} onClick={() => setZone('speakers')}>
                <KindIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                <b>{name}</b>
                <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />
              </button>
            ) : (
              <b>
                <KindIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                {name}
              </b>
            )}
          </div>
          {canPower ? (
            <button
              type="button"
              className={clsx('panel-media-round', off && 'is-lit')}
              aria-label={off ? dt('mediaPowerOn', { name: model.name }) : dt('mediaPowerOff', { name: model.name })}
              onClick={() => onAction({ type: 'power', on: off })}
            >
              <Power size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : (
            <span className="panel-media-round is-empty" aria-hidden="true" />
          )}
        </div>

        <div className="panel-media-main">
          <div className="panel-media-cover">
            {hasCover ? (
              <img src={picture ?? undefined} alt="" onError={() => setBrokenUrl(pictureUrl)} />
            ) : (
              <span className="panel-media-nocover" aria-hidden="true">
                <NoCover size={56} strokeWidth={1.5} />
                {isTv && !off && !nothing && model.source ? <em>{model.source}</em> : null}
              </span>
            )}
          </div>

          <div className="panel-media-side">
            <div className="panel-media-title">
              <h2 id="panel-media-title">
                <ScrollingName name={title} />
              </h2>
              {subtitle ? <span>{subtitle}</span> : null}
            </div>

            {!off ? <MediaProgress model={model} now={now} onAction={onAction} /> : null}

            <div className="panel-media-keys">
              {model.supports.shuffle && !off && !nothing ? (
                <button type="button" className={clsx('panel-media-key', model.shuffle && 'is-on')} aria-pressed={model.shuffle} aria-label={dt('mediaShuffle')} onClick={() => onAction({ type: 'shuffle', shuffle: !model.shuffle })}>
                  <Shuffle {...ICON} aria-hidden="true" />
                </button>
              ) : (
                <span className="panel-media-key is-empty" aria-hidden="true" />
              )}
              <MediaTransport model={model} onAction={onAction} large />
              {model.supports.repeat && !off && !nothing ? (
                <button type="button" className={clsx('panel-media-key', model.repeat !== 'off' && 'is-on')} aria-label={repeatLabel} onClick={() => onAction({ type: 'repeat', repeat: REPEAT_NEXT[model.repeat] })}>
                  <RepeatIcon {...ICON} aria-hidden="true" />
                </button>
              ) : (
                <span className="panel-media-key is-empty" aria-hidden="true" />
              )}
            </div>

            {model.volume !== null && model.supports.volume ? (
              <div className="panel-media-volume">
                {model.supports.mute ? (
                  <button type="button" className={clsx('panel-media-key', model.muted && 'is-on')} aria-pressed={model.muted} aria-label={model.muted ? sp.t('mediaUnmute') : sp.t('mediaMuteIt')} onClick={() => onAction({ type: 'mute', muted: !model.muted })}>
                    {model.muted ? <VolumeX {...ICON} aria-hidden="true" /> : <Volume2 {...ICON} aria-hidden="true" />}
                  </button>
                ) : (
                  <span className="panel-media-key is-plain" aria-hidden="true">
                    <Volume2 {...ICON} />
                  </span>
                )}
                <GlassSlider variant="bar" tone={colour ? 'device' : 'neutral'} label={dt('mediaVolume')} value={volume} valueText={`${volume}%`} disabled={off} onValueChange={(level) => onAction({ type: 'volume', level })} />
                <b>{model.muted ? sp.t('mediaMuted') : `${volume}%`}</b>
              </div>
            ) : null}

            {openZone ? (
              <>
                <div className="panel-media-zone">{zoneBody()}</div>
                <button type="button" className="panel-media-back" onClick={() => setZone(null)}>
                  <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
                  {dt('back')}
                </button>
              </>
            ) : off ? (
              <p className="panel-media-empty">
                <b>{sp.t('mediaOffTitle')}</b>
                <span>{canPower ? sp.t('mediaOffNote') : null}</span>
              </p>
            ) : canGroup || hasSources || hasAudio ? (
              <div className="panel-media-row" role="group" aria-label={dt('mediaControls')}>
                {canGroup ? <GlassShortcut kind="opens" tone="neutral" on={others > 0} icon={<Layers {...ICON} />} label={sp.t('mediaSpeakers')} onPress={() => setZone('speakers')} /> : null}
                {hasSources ? <GlassShortcut kind="opens" tone="neutral" icon={<Monitor {...ICON} />} label={dt('mediaSourceLabel')} onPress={() => setZone('source')} /> : null}
                {hasAudio ? <GlassShortcut kind="opens" tone="neutral" icon={<SlidersHorizontal {...ICON} />} label={dt('mediaTabAudio')} onPress={() => setZone('audio')} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return player;
}

export default MediaPlayer;
