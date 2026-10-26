import React from 'react';
import { Check, ChevronDown, Power, Repeat, Repeat1, Shuffle, Speaker, Volume2, VolumeX } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { REPEAT_NEXT, type MediaAction, type MediaModel } from '../model/media';
import { MediaArt, MediaBackdrop, MediaKindIcon, MediaProgress, MediaSlider, MediaTransport, useMediaClock } from '../cards/MediaCard';

/*
 * The full player of the board, over the whole page: the artwork large, the
 * position, controls, shuffle and repeat, the volume; beside them, what the
 * player offers of sources, players to play together with, and sound modes.
 * A tab shows only when the player has something for it.
 */

export type MediaGroupCandidate = { entityId: string; name: string; roomName: string | null };

export type MediaPlayerProps = {
  model: MediaModel;
  pictureUrl: string | null;
  /** Other players this one can play together with. */
  groupCandidates: MediaGroupCandidate[];
  onAction: (action: MediaAction) => void;
  onClose: () => void;
};

type Tab = 'source' | 'audio';

export function MediaPlayer({ model, pictureUrl, groupCandidates, onAction, onClose }: MediaPlayerProps) {
  const dt = useDevicesTranslations();
  const now = useMediaClock(model.playing);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  const hasSources = model.supports.source && model.sources.length > 0;
  const canGroup = model.supports.group && groupCandidates.length > 0;
  const tabs: Array<{ key: Tab; label: string }> = [
    ...(hasSources || canGroup ? [{ key: 'source' as const, label: model.kind === 'tv' ? dt('mediaTabSource') : dt('mediaTabOutputs') }] : []),
    ...(model.supports.soundMode && model.soundModes.length > 0 ? [{ key: 'audio' as const, label: dt('mediaTabAudio') }] : []),
  ];
  const [tab, setTab] = React.useState<Tab>('source');
  const current = tabs.find((entry) => entry.key === tab)?.key ?? tabs[0]?.key ?? null;

  React.useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const above = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
        (dialog) => dialog !== dialogRef.current && !dialog.contains(dialogRef.current),
      );
      if (!above) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, [onClose]);

  const onTabKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.findIndex((entry) => entry.key === current);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next.key);
    dialogRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  const RepeatIcon = model.repeat === 'one' ? Repeat1 : Repeat;
  const repeatLabel = model.repeat === 'off' ? dt('mediaRepeatOff') : model.repeat === 'all' ? dt('mediaRepeatAll') : dt('mediaRepeatOne');
  const volume = model.muted ? 0 : model.volume ?? 0;

  return (
    <div ref={dialogRef} className="dv-mp" role="dialog" aria-modal="true" aria-labelledby="dv-mp-title" data-testid="media-player">
      <MediaBackdrop model={model} pictureUrl={pictureUrl} className="dv-mp-bg" />
      <span className="dv-mp-shade" aria-hidden="true" />
      <div className="dv-mp-inner">
        <div className="flex items-center justify-between gap-3">
          <button ref={closeRef} type="button" className="dv-mp-iconbtn" aria-label={dt('mediaMinimize')} onClick={onClose}>
            <ChevronDown size={22} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <span className="flex min-w-0 flex-col items-center gap-px text-center">
            <span className="text-xs font-bold uppercase tracking-[0.08em] opacity-60">
              {model.kind === 'tv' ? dt('mediaOnAir') : dt('mediaPlayingOn')}
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold">
              <MediaKindIcon model={model} />
              {model.name}
            </span>
          </span>
          {model.supports.turnOff ? (
            <button
              type="button"
              className="dv-mp-iconbtn"
              aria-label={dt('mediaPowerOff', { name: model.name })}
              onClick={() => {
                onAction({ type: 'power', on: false });
                onClose();
              }}
            >
              <Power size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden="true" />
          )}
        </div>

        <div className={clsx('dv-mp-grid', !current && 'is-single')}>
          <div className="dv-mp-left">
            <MediaArt model={model} pictureUrl={pictureUrl} className={clsx('dv-mp-art', !model.playing && 'is-resting')} />
            <div className="flex flex-col gap-1">
              <h2 id="dv-mp-title" className="m-0 text-[26px] font-bold leading-[1.15] tracking-[-0.025em]">
                {model.title ?? model.app ?? dt('mediaNothing')}
              </h2>
              {model.title && model.artist ? <span className="text-[17px] font-medium opacity-75">{model.artist}</span> : null}
            </div>
            <MediaProgress model={model} now={now} onAction={onAction} />
            <div className="flex items-center justify-between gap-2">
              {model.supports.shuffle ? (
                <button
                  type="button"
                  className={clsx('dv-mp-toggle', model.shuffle && 'is-on')}
                  aria-pressed={model.shuffle}
                  aria-label={dt('mediaShuffle')}
                  onClick={() => onAction({ type: 'shuffle', shuffle: !model.shuffle })}
                >
                  <Shuffle size={20} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : (
                <span className="h-11 w-11" aria-hidden="true" />
              )}
              <MediaTransport model={model} onAction={onAction} large />
              {model.supports.repeat ? (
                <button
                  type="button"
                  className={clsx('dv-mp-toggle', model.repeat !== 'off' && 'is-on')}
                  aria-label={repeatLabel}
                  onClick={() => onAction({ type: 'repeat', repeat: REPEAT_NEXT[model.repeat] })}
                >
                  <RepeatIcon size={20} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : (
                <span className="h-11 w-11" aria-hidden="true" />
              )}
            </div>
            {model.volume !== null && model.supports.volume ? (
              <div className="flex items-center gap-3">
                {model.supports.mute ? (
                  <button
                    type="button"
                    className={clsx('dv-mp-toggle', model.muted && 'is-on')}
                    aria-pressed={model.muted}
                    aria-label={dt('mediaMute')}
                    onClick={() => onAction({ type: 'mute', muted: !model.muted })}
                  >
                    {model.muted ? <VolumeX size={20} strokeWidth={2.2} aria-hidden="true" /> : <Volume2 size={20} strokeWidth={2.2} aria-hidden="true" />}
                  </button>
                ) : (
                  <Volume2 size={20} strokeWidth={2.2} aria-hidden="true" className="opacity-70" />
                )}
                <MediaSlider
                  className={clsx('flex-1', model.muted && 'opacity-40')}
                  value={volume}
                  max={100}
                  label={dt('mediaVolume')}
                  valueText={`${volume}%`}
                  onChange={(value) => onAction({ type: 'volume', level: value })}
                />
                <span className="w-9 text-right text-[13px] font-semibold tabular-nums opacity-75">{volume}</span>
              </div>
            ) : null}
          </div>

          {current ? (
            <div className="dv-mp-right">
              {tabs.length > 1 ? (
                <div role="tablist" aria-label={dt('mediaControls')} className="dv-mp-tabs" onKeyDown={onTabKey}>
                  {tabs.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      role="tab"
                      data-tab={entry.key}
                      id={`dv-mp-tab-${entry.key}`}
                      aria-selected={current === entry.key}
                      aria-controls={`dv-mp-panel-${entry.key}`}
                      tabIndex={current === entry.key ? 0 : -1}
                      className={clsx(current === entry.key && 'is-on')}
                      onClick={() => setTab(entry.key)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              ) : (
                <h3 className="dv-mp-label m-0">{tabs[0].label}</h3>
              )}

              {current === 'source' ? (
                <div id="dv-mp-panel-source" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? 'dv-mp-tab-source' : undefined} className="flex flex-col gap-3">
                  {hasSources ? (
                    <>
                      <span className="dv-mp-label">{dt('mediaSourceLabel')}</span>
                      <div className="dv-mp-group" role="radiogroup" aria-label={dt('mediaSourceLabel')}>
                        {model.sources.map((source) => (
                          <button
                            key={source}
                            type="button"
                            role="radio"
                            aria-checked={model.source === source}
                            className="dv-mp-row"
                            onClick={() => onAction({ type: 'source', source })}
                          >
                            <span className="flex-1 text-left text-[15px] font-semibold">{source}</span>
                            {model.source === source ? <Check size={18} strokeWidth={2.6} aria-hidden="true" /> : null}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {canGroup ? (
                    <>
                      <span className="dv-mp-label">{dt('mediaAlsoOn')}</span>
                      <div className="dv-mp-group">
                        {groupCandidates.map((candidate) => {
                          const joined = model.groupMembers.includes(candidate.entityId);
                          return (
                            <button
                              key={candidate.entityId}
                              type="button"
                              role="checkbox"
                              aria-checked={joined}
                              className="dv-mp-row"
                              onClick={() => onAction({ type: 'group', member: candidate.entityId, joined: !joined })}
                            >
                              <Speaker size={18} strokeWidth={2.2} aria-hidden="true" className="opacity-80" />
                              <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
                                <span className="text-[15px] font-semibold">{candidate.name}</span>
                                {candidate.roomName ? <span className="text-xs font-medium opacity-65">{candidate.roomName}</span> : null}
                              </span>
                              <span className={clsx('dv-mp-check', joined && 'is-sel')} aria-hidden="true">
                                <Check size={14} strokeWidth={3} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div id="dv-mp-panel-audio" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? 'dv-mp-tab-audio' : undefined} className="flex flex-col gap-3">
                  <span className="dv-mp-label">{dt('mediaSoundMode')}</span>
                  <div role="radiogroup" aria-label={dt('mediaSoundMode')} className="flex flex-wrap gap-2">
                    {model.soundModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={model.soundMode === mode}
                        className={clsx('dv-mp-pill', model.soundMode === mode && 'is-on')}
                        onClick={() => onAction({ type: 'sound_mode', mode })}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default MediaPlayer;
