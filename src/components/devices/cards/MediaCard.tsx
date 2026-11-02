import React from 'react';
import { Check, ChevronRight, Maximize2, Music, Pause, Play, Power, SkipBack, SkipForward, Speaker, Tv, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { formatMediaTime, mediaPositionNow, type MediaAction, type MediaModel } from '../model/media';
import { CardFrame, CardHead } from './CardFrame';
import { DeviceCardShell, deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';
import '../theme/devices.css';

/*
 * The media of a room, as on the board: a card of what plays, its artwork
 * blurred behind it, with position, controls and volume; a plain tile when
 * the player is off. The pieces are shared with the full player.
 *
 * On the Home MediaCard takes the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html): Mini U×2 the artwork and the
 * title, its icon plays or pauses; Standard U×4 the position and the controls;
 * Expanded W×4 the artwork on the left, the position, controls and volume.
 */

/** The time, every second while something plays, for the position. */
export function useMediaClock(running: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

/** One of the board's artworks, the same for the same title, when the player gives none. */
export function artOf(title: string | null) {
  const seed = (title ?? '').split('').reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
  return ['a', 'b', 'c', 'd', 'e'][seed % 5];
}

export function MediaKindIcon({ model, size = 14 }: { model: MediaModel; size?: number }) {
  const Icon = model.kind === 'tv' ? Tv : Speaker;
  return <Icon size={size} strokeWidth={2.2} aria-hidden="true" />;
}

/** The artwork: the picture of the player, or a colour field with a note. */
export function MediaArt({ model, pictureUrl, className, style }: { model: MediaModel; pictureUrl: string | null; className: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [pictureUrl]);
  const picture = pictureUrl && !broken ? pictureUrl : null;
  return (
    <span aria-hidden="true" className={clsx(className, 'dv-art')} data-art={artOf(model.title)} style={style}>
      {picture ? <img src={picture} alt="" onError={() => setBroken(true)} /> : <Music size={34} strokeWidth={1.8} />}
    </span>
  );
}

/** The blurred artwork behind a card or the player. */
export function MediaBackdrop({ model, pictureUrl, className }: { model: MediaModel; pictureUrl: string | null; className: string }) {
  return (
    <span aria-hidden="true" className={clsx(className, 'dv-art')} data-art={artOf(model.title)}>
      {pictureUrl ? <img src={pictureUrl} alt="" /> : null}
    </span>
  );
}

/** A bar with a hidden range on it, as the board's position and volume. */
export function MediaSlider({
  value,
  max,
  label,
  valueText,
  disabled = false,
  onChange,
  className,
}: {
  value: number;
  max: number;
  label: string;
  valueText: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span className={clsx('dv-np-track', disabled && 'is-disabled', className)}>
      <span className="dv-np-fill" style={{ width: `${pct.toFixed(2)}%` }} />
      <input
        className="dv-np-range"
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.round(value)}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </span>
  );
}

/** Previous, play or pause, next. */
export function MediaTransport({ model, onAction, large = false }: { model: MediaModel; onAction: (action: MediaAction) => void; large?: boolean }) {
  const dt = useDevicesTranslations();
  const canPause = model.supports.pause || model.supports.play || !model.on;
  return (
    <>
      <button
        type="button"
        className={clsx('dv-np-btn', large && 'is-large')}
        aria-label={dt('mediaPrevious')}
        disabled={!model.on || !model.supports.previous}
        onClick={() => onAction({ type: 'previous' })}
      >
        <SkipBack size={large ? 28 : 24} strokeWidth={2} fill="currentColor" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={clsx('dv-np-play', large && 'is-large')}
        aria-label={model.playing ? dt('mediaPause') : dt('mediaPlay')}
        disabled={!canPause}
        onClick={() => onAction({ type: 'play_pause' })}
      >
        {model.playing ? (
          <Pause size={large ? 30 : 26} strokeWidth={0} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={large ? 30 : 26} strokeWidth={0} fill="currentColor" aria-hidden="true" className="translate-x-[2px]" />
        )}
      </button>
      <button
        type="button"
        className={clsx('dv-np-btn', large && 'is-large')}
        aria-label={dt('mediaNext')}
        disabled={!model.on || !model.supports.next}
        onClick={() => onAction({ type: 'next' })}
      >
        <SkipForward size={large ? 28 : 24} strokeWidth={2} fill="currentColor" aria-hidden="true" />
      </button>
    </>
  );
}

/** Position and the time left; nothing when the player does not say. */
export function MediaProgress({ model, now, onAction }: { model: MediaModel; now: number; onAction: (action: MediaAction) => void }) {
  const dt = useDevicesTranslations();
  const position = mediaPositionNow(model, now);
  if (position === null || !model.duration) return null;
  const current = formatMediaTime(position);
  return (
    <div className="flex flex-col gap-1.5">
      <MediaSlider
        value={position}
        max={model.duration}
        label={dt('mediaPosition')}
        valueText={dt('mediaPositionText', { cur: current, total: formatMediaTime(model.duration) })}
        disabled={!model.supports.seek}
        onChange={(value) => onAction({ type: 'seek', position: value })}
      />
      <div className="flex justify-between text-xs font-semibold tabular-nums opacity-70">
        <span>{current}</span>
        <span>-{formatMediaTime(model.duration - position)}</span>
      </div>
    </div>
  );
}

export function MediaEq({ playing }: { playing: boolean }) {
  return (
    <span className={clsx('dv-eq', playing && 'is-on')} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export type NowPlayingCardProps = {
  model: MediaModel;
  pictureUrl: string | null;
  onAction: (action: MediaAction) => void;
  onOpenPlayer: () => void;
};

export function NowPlayingCard({ model, pictureUrl, onAction, onOpenPlayer }: NowPlayingCardProps) {
  const dt = useDevicesTranslations();
  const now = useMediaClock(model.playing);
  const title = model.title ?? model.app ?? dt('mediaNothing');
  const artist = model.title ? model.artist : model.playing ? null : dt('mediaPaused');
  return (
    <div className="dv-np" role="group" aria-label={dt('mediaGroupAria', { device: model.name })} data-testid="media-now-playing">
      <MediaBackdrop model={model} pictureUrl={pictureUrl} className="dv-np-bg" />
      <span className="dv-np-shade" aria-hidden="true" />
      <div className="dv-np-body">
        <div className="flex items-center justify-between gap-2.5">
          <span className="flex min-w-0 items-center gap-[7px] text-xs font-semibold opacity-80">
            <MediaKindIcon model={model} />
            <span className="truncate">{model.app ? `${model.name} · ${model.app}` : model.name}</span>
          </span>
          <span className="flex flex-none items-center gap-2.5">
            <MediaEq playing={model.playing} />
            {model.supports.turnOff ? (
              <button type="button" className="dv-np-mini" aria-label={dt('mediaPowerOff', { name: model.name })} onClick={() => onAction({ type: 'power', on: false })}>
                <Power size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className="dv-np-mini" aria-label={dt('mediaOpenPlayer')} onClick={onOpenPlayer}>
              <Maximize2 size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </span>
        </div>
        <button type="button" className="dv-np-open" aria-label={dt('mediaOpenPlayerTitle', { title })} onClick={onOpenPlayer}>
          <MediaArt model={model} pictureUrl={pictureUrl} className={clsx('dv-np-art', !model.playing && 'is-resting')} />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="dv-np-title">{title}</span>
            {artist ? <span className="truncate text-[15px] font-medium opacity-80">{artist}</span> : null}
          </span>
        </button>
        <MediaProgress model={model} now={now} onAction={onAction} />
        <div className="flex items-center justify-center gap-[22px]">
          <MediaTransport model={model} onAction={onAction} />
        </div>
        {model.volume !== null && model.supports.volume ? (
          <div className="flex items-center gap-2.5">
            <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" className="flex-none opacity-70" />
            <MediaSlider
              className="flex-1"
              value={model.muted ? 0 : model.volume}
              max={100}
              label={dt('mediaVolume')}
              valueText={`${model.muted ? 0 : model.volume}%`}
              onChange={(value) => onAction({ type: 'volume', level: value })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type MediaOffCardProps = {
  model: MediaModel;
  onPowerOn: () => void;
  onOpen: () => void;
};

/** The player switched off: its icon switches it on, the rest opens where to start from. */
export function MediaOffCard({ model, onPowerOn, onOpen }: MediaOffCardProps) {
  const dt = useDevicesTranslations();
  const status = !model.available ? dt('unavailable') : model.title ? dt('mediaOffLast', { title: model.title }) : dt('mediaOff');
  return (
    <div className="dv-tile dv-media-off" data-testid="media-off">
      <button type="button" className="dv-tile-body" disabled={!model.available} aria-label={dt('mediaStartTitle', { name: model.name })} onClick={onOpen} />
      <div className="dv-tile-inner items-center gap-3 px-3.5">
        <button
          type="button"
          className="dv-icon-button"
          aria-pressed="false"
          aria-label={dt('mediaPowerOn', { name: model.name })}
          disabled={!model.available || !model.supports.turnOn}
          onClick={onPowerOn}
        >
          <MediaKindIcon model={model} size={21} />
        </button>
        <span className="pointer-events-none flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="dv-name">{model.name}</span>
          <span className="dv-status">{status}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" className="dv-t3 pointer-events-none flex-none" />
      </div>
    </div>
  );
}

export type MediaCardProps = {
  model: MediaModel;
  pictureUrl: string | null;
  format: DeviceCardFormat;
  editing?: boolean;
  selected?: boolean;
  onAction: (action: MediaAction) => void;
  /** The full player, or where to start from when the player is off. */
  onOpen: () => void;
  onSelect?: () => void;
};

export function MediaCard({ model, pictureUrl, format, editing = false, selected = false, onAction, onOpen, onSelect }: MediaCardProps) {
  const dt = useDevicesTranslations();
  const size = deviceCardSize(format);
  const on = model.on && model.available;
  const now = useMediaClock(on && model.playing && size !== 'mini');
  const title = model.title ?? model.app ?? dt('mediaNothing');
  const artist = model.title ? model.artist : model.playing ? null : dt('mediaPaused');
  const offStatus = !model.available
    ? dt('unavailable')
    : model.title ? dt('mediaOffLast', { title: model.title }) : dt('mediaOff');
  const openLabel = on ? dt('mediaOpenPlayerTitle', { title }) : dt('mediaStartTitle', { name: model.name });
  const powerOn = () => onAction({ type: 'power', on: true });

  if (size === 'mini') {
    const canPlay = model.supports.pause || model.supports.play;
    const status = !on ? offStatus : artist ?? (model.playing ? model.name : dt('mediaPaused'));
    return (
      <DeviceCardShell
        format="U×2"
        name={on && model.title ? model.title : model.name}
        status={status}
        icon={on ? <MediaArt model={model} pictureUrl={pictureUrl} className="dv-media-art is-round" /> : <MediaKindIcon model={model} size={21} />}
        isOn={on && model.playing}
        tone={on && model.playing ? 'power' : null}
        available={model.available && (on ? canPlay : model.supports.turnOn)}
        hasPanel
        editing={editing}
        selected={selected}
        toggleLabel={on ? model.playing ? dt('mediaPause') : dt('mediaPlay') : dt('mediaPowerOn', { name: model.name })}
        openLabel={openLabel}
        selectLabel={dt('select', { name: model.name })}
        onToggle={() => (on ? onAction({ type: 'play_pause' }) : powerOn())}
        onOpenPanel={onOpen}
        onSelect={onSelect}
      />
    );
  }

  const position = on ? mediaPositionNow(model, now) : null;
  const share = position !== null && model.duration ? Math.min(100, (position / model.duration) * 100) : 0;
  const canPause = model.supports.pause || model.supports.play;
  // Standard keeps the three keys of the board (52 × 44); Expanded the round ones beside the volume.
  const key = size === 'standard' && 'is-key';
  const transport = (
    <>
      <button type="button" className={clsx('dv-size-round', key)} aria-label={dt('mediaPrevious')} disabled={editing || !on || !model.supports.previous} onClick={() => onAction({ type: 'previous' })}>
        <SkipBack size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
      </button>
      <button type="button" className={clsx('dv-size-round is-primary', key)} aria-label={model.playing ? dt('mediaPause') : dt('mediaPlay')} disabled={editing || !on || !canPause} onClick={() => onAction({ type: 'play_pause' })}>
        {model.playing
          ? <Pause size={17} strokeWidth={0} fill="currentColor" aria-hidden="true" />
          : <Play size={17} strokeWidth={0} fill="currentColor" aria-hidden="true" className="translate-x-px" />}
      </button>
      <button type="button" className={clsx('dv-size-round', key)} aria-label={dt('mediaNext')} disabled={editing || !on || !model.supports.next} onClick={() => onAction({ type: 'next' })}>
        <SkipForward size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
      </button>
    </>
  );
  const progress = <span className="dv-progress" aria-hidden="true"><i style={{ width: `${share.toFixed(1)}%` }} /></span>;
  const frame = (children: React.ReactNode, row = false) => (
    <CardFrame
      format={format}
      available={model.available}
      on={on && model.playing}
      editing={editing}
      selected={selected}
      openLabel={openLabel}
      selectLabel={dt('select', { name: model.name })}
      onOpen={onOpen}
      onSelect={onSelect}
      testId="media-card"
    >
      <div className={clsx('dv-size-body', row && 'is-row')}>{children}</div>
    </CardFrame>
  );

  if (!on) {
    return frame(
      <>
        <CardHead
          icon={<span className="dv-icon-button pointer-events-none" aria-hidden="true"><MediaKindIcon model={model} size={21} /></span>}
          name={model.name}
          status={offStatus}
        />
        <button type="button" className="dv-pill is-wide is-primary" disabled={editing || !model.available || !model.supports.turnOn} onClick={powerOn}>
          {dt('mediaPowerOn', { name: model.name })}
        </button>
      </>,
    );
  }

  if (size === 'standard') {
    return frame(
      <>
        <CardHead
          icon={<MediaArt model={model} pictureUrl={pictureUrl} className="dv-media-art" />}
          name={title}
          status={artist ?? model.name}
        />
        {progress}
        <span className="flex items-center justify-between">{transport}</span>
      </>,
    );
  }

  return frame(
    <>
      <MediaArt model={model} pictureUrl={pictureUrl} className="dv-media-art is-large" />
      <span className="dv-size-col">
        <CardHead
          name={title}
          status={[artist, model.app].filter(Boolean).join(' · ') || model.name}
          oneLine
          aside={(
            <span className="dv-media-source">
              <MediaKindIcon model={model} size={12} />
              {model.source ?? model.name}
            </span>
          )}
        />
        <span className="flex flex-col gap-1">
          {progress}
          {position !== null && model.duration ? (
            <span className="dv-axis">
              <span>{formatMediaTime(position)}</span>
              <span>{formatMediaTime(model.duration)}</span>
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          {transport}
          {model.volume !== null && model.supports.volume ? (
            <span className="dv-volume">
              <Volume2 size={14} strokeWidth={2.2} aria-hidden="true" />
              <MediaSlider
                value={model.muted ? 0 : model.volume}
                max={100}
                label={dt('mediaVolume')}
                valueText={`${model.muted ? 0 : model.volume}%`}
                disabled={editing}
                onChange={(value) => onAction({ type: 'volume', level: value })}
              />
            </span>
          ) : null}
        </span>
      </span>
    </>,
    true,
  );
}
