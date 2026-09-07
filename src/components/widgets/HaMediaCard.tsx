import React, { useEffect, useRef } from 'react';
import { Cast, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Speaker, Tv2, Volume2, VolumeX } from 'lucide-react';
import GlassSlider from '../ui/GlassSlider';
import './HaMediaCard.css';
import type { MediaCardCapabilities, MediaPlayerRuntimeState } from './mediaCardModel';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import { normalizeMediaPlayerStateKey } from '../../utils/mediaPlayerState';
import { useI18n } from '../../i18n/I18nProvider';

export interface HaMediaCardProps {
  entityId?: string;
  name: string;
  state: Exclude<MediaPlayerRuntimeState, 'unknown'>;
  layoutVariant?: WidgetDisplayVariant;
  capabilities?: MediaCardCapabilities;
  attributes: {
    state_label?: string;
    app_id?: string;
    app_name?: string;
    device_class?: string;
    media_title?: string;
    media_artist?: string;
    media_album_name?: string;
    media_album_artist?: string;
    media_channel?: string;
    media_content_id?: string;
    media_content_type?: string;
    entity_picture?: string;
    entity_picture_local?: string;
    media_duration?: number;
    media_position?: number;
    media_position_updated_at?: number;
    media_episode?: string;
    media_image_hash?: string;
    media_image_remotely_accessible?: boolean;
    media_image_url?: string;
    media_playlist?: string;
    media_season?: string;
    media_series_title?: string;
    media_track?: number;
    shuffle?: boolean;
    repeat?: string;
    sound_mode?: string;
    sound_mode_list?: string[];
    source?: string;
    source_list?: string[];
    group_members?: string[];
    volume_level?: number;
    is_volume_muted?: boolean;
    volume_step?: number;
  };
  onTogglePlay?: () => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
  onSeek?: (position: number) => void;
  onShuffle?: () => void;
  onRepeat?: () => void;
  onSelectSource?: (source: string) => void;
  onLongPress?: (entityId: string) => void;
  hideHeader?: boolean;
  commandPending?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(totalSeconds?: number) {
  if (!Number.isFinite(totalSeconds) || (totalSeconds ?? 0) <= 0) {
    return '00:00';
  }
  const safe = Math.max(0, Math.floor(totalSeconds ?? 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeSourceName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function uniqueSourceNames(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const sources: string[] = [];
  values.forEach((value) => {
    const source = normalizeSourceName(value ?? '');
    if (!source) {
      return;
    }
    const key = source.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sources.push(source);
  });
  return sources;
}

function formatCommonMediaLabel(value: string | undefined) {
  const raw = normalizeSourceName(value ?? '');
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized === 'music') return 'Musica';
  if (normalized === 'movie') return 'Film';
  if (normalized === 'night') return 'Notte';
  if (normalized === 'speech') return 'Voce';
  if (normalized === 'game') return 'Gioco';
  if (normalized === 'speaker') return 'Diffusore';
  if (normalized === 'receiver') return 'Ricevitore';
  if (normalized === 'projector') return 'Proiettore';
  if (normalized === 'tv' || normalized === 'television') return 'TV';
  if (normalized === 'playlist') return 'Playlist';
  if (normalized === 'channel') return 'Canale';
  if (normalized === 'episode') return 'Episodio';
  if (normalized === 'announcement') return 'Annuncio';
  return raw;
}

function formatRepeatLabel(mode: string) {
  const normalized = mode.trim().toLowerCase();
  if (!normalized || normalized === 'off' || normalized === 'none') return 'Ripeti: disattivato';
  if (normalized === 'one' || normalized === 'single' || normalized === 'track') return 'Ripeti: uno';
  if (normalized === 'all' || normalized === 'playlist') return 'Ripeti: tutti';
  return `Ripeti: ${mode}`;
}

function buildMetadataChips(attributes: HaMediaCardProps['attributes']) {
  const chips: string[] = [];
  const add = (value: string | undefined) => {
    const normalized = normalizeSourceName(value ?? '');
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (chips.some((chip) => chip.toLowerCase() === key)) return;
    chips.push(normalized);
  };

  add(attributes.app_name);
  add(attributes.media_album_name);
  add(attributes.media_playlist);
  add(attributes.media_channel);
  add(formatCommonMediaLabel(attributes.sound_mode));
  if (attributes.device_class) add(formatCommonMediaLabel(attributes.device_class));
  if ((attributes.group_members?.length ?? 0) > 0) {
    add(`${attributes.group_members!.length} in gruppo`);
  }
  return chips.slice(0, 6);
}

function isSameSource(left: string | undefined, right: string | undefined) {
  return normalizeSourceName(left ?? '').toLowerCase() === normalizeSourceName(right ?? '').toLowerCase();
}

function SourceIcon({ source }: { source: string }) {
  const normalized = source.toLowerCase();
  if (normalized.includes('tv') || normalized.includes('television')) {
    return <Tv2 className="ha-media-card__cast-icon" aria-hidden="true" />;
  }
  if (
    normalized.includes('cast') ||
    normalized.includes('chromecast') ||
    normalized.includes('airplay') ||
    normalized.includes('google home')
  ) {
    return <Cast className="ha-media-card__cast-icon" aria-hidden="true" />;
  }
  return <Speaker className="ha-media-card__cast-icon" aria-hidden="true" />;
}

function resolveDeviceIcon(deviceClass: string | undefined) {
  const normalized = normalizeSourceName(deviceClass ?? '').toLowerCase();
  if (normalized === 'tv' || normalized.includes('television')) {
    return Tv2;
  }
  if (normalized === 'receiver' || normalized === 'projector' || normalized.includes('cast')) {
    return Cast;
  }
  return Speaker;
}

export function HaMediaCard({
  entityId,
  name,
  state,
  layoutVariant = 'full',
  capabilities,
  attributes,
  onTogglePlay,
  onPreviousTrack,
  onNextTrack,
  onSeek,
  onShuffle,
  onRepeat,
  onSelectSource,
  onLongPress,
  hideHeader = false,
  commandPending = false,
}: HaMediaCardProps) {
  const { t } = useI18n();
  const longPressTimerRef = useRef<number | null>(null);
  const coverCandidate = attributes.entity_picture ?? attributes.media_image_url ?? attributes.entity_picture_local;
  const hasCover = typeof coverCandidate === 'string' && coverCandidate.trim().length > 0;
  const coverUrl = hasCover ? coverCandidate!.trim() : '';
  const rawDuration = Math.floor(Number(attributes.media_duration) || 0);
  const duration = Math.max(0, rawDuration);
  const rawPosition = Math.floor(Number(attributes.media_position) || 0);
  const position = duration > 0 ? clamp(rawPosition, 0, duration) : 0;
  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const volumeLevel =
    typeof attributes.volume_level === 'number' && Number.isFinite(attributes.volume_level)
      ? clamp(Math.round(attributes.volume_level), 0, 100)
      : undefined;
  const mediaTitle = attributes.media_title?.trim();
  const mediaArtist = attributes.media_artist?.trim();
  const seriesLine = [attributes.media_series_title, attributes.media_season, attributes.media_episode]
    .map((entry) => entry?.trim())
    .filter(Boolean)
    .join(' · ');
  const fallbackSecondary =
    mediaArtist ||
    seriesLine ||
    attributes.media_album_name?.trim() ||
    attributes.media_channel?.trim() ||
    attributes.app_name?.trim() ||
    attributes.source?.trim();
  const primaryTrackText = mediaTitle || mediaArtist;
  const secondaryTrackText = mediaTitle ? fallbackSecondary : undefined;
  const playerContext = attributes.app_name?.trim() || attributes.source?.trim() || name;
  const stateLabel = attributes.state_label?.trim() || t(`controls.media.state.${normalizeMediaPlayerStateKey(state)}`);
  const headerMediaSubtitle = [mediaArtist, name].filter(Boolean).join(' \u2022 ') || name;
  const headerTitle = mediaTitle || (state === 'idle' ? primaryTrackText : undefined) || name;
  const headerSubtitle =
    mediaTitle
      ? headerMediaSubtitle
      : state === 'buffering'
      ? stateLabel
      : state === 'off'
        ? stateLabel
        : state === 'on'
          ? playerContext || stateLabel
          : state === 'idle'
            ? playerContext || stateLabel
            : stateLabel;
  const isExpanded = true;
  const isMini = layoutVariant === 'mini';
  const isCompact = layoutVariant === 'compact';
  const shouldScrollHeaderTitle = headerTitle.length > (isMini ? 12 : 24);
  const shouldScrollHeaderSubtitle = Boolean(headerSubtitle && headerSubtitle.length > (isMini ? 14 : 28));
  const showTrack = hideHeader && Boolean(primaryTrackText || hasCover);
  const showProgress = state === 'playing' || state === 'paused' || state === 'buffering';
  const hasTransportCapability = Boolean(
    capabilities?.canShuffle ||
      capabilities?.canPreviousTrack ||
      capabilities?.canTogglePlayback ||
      capabilities?.canTurnOn ||
      capabilities?.canTurnOff ||
      capabilities?.canNextTrack ||
      capabilities?.canRepeat,
  );
  const showTransport = Boolean(onShuffle || onPreviousTrack || onTogglePlay || onNextTrack || onRepeat || hasTransportCapability);
  const canSeek = Boolean(onSeek) && state !== 'unavailable' && capabilities?.canSeek !== false;
  const toggleSupported = capabilities
    ? capabilities.canTogglePlayback || capabilities.canTurnOn || capabilities.canTurnOff
    : true;
  const canToggle = Boolean(onTogglePlay) && state !== 'unavailable' && toggleSupported;
  const canPrevious = Boolean(onPreviousTrack) && state !== 'unavailable' && capabilities?.canPreviousTrack !== false;
  const canNext = Boolean(onNextTrack) && state !== 'unavailable' && capabilities?.canNextTrack !== false;
  const canShuffle = Boolean(onShuffle) && state !== 'unavailable' && capabilities?.canShuffle !== false;
  const canRepeat = Boolean(onRepeat) && state !== 'unavailable' && capabilities?.canRepeat !== false;
  const shuffleActive = attributes.shuffle === true;
  const repeatMode = (attributes.repeat ?? 'off').trim().toLowerCase();
  const repeatActive = repeatMode !== '' && repeatMode !== 'off' && repeatMode !== 'none';
  const repeatLabel = !repeatMode || repeatMode === 'off' || repeatMode === 'none'
    ? t('controls.media.repeatOff')
    : repeatMode === 'one' || repeatMode === 'single' || repeatMode === 'track'
      ? t('controls.media.repeatOne')
      : repeatMode === 'all' || repeatMode === 'playlist'
        ? t('controls.media.repeatAll')
        : `${t('controls.media.repeatAll')}: ${repeatMode}`;
  const activeSource = normalizeSourceName(attributes.source ?? '');
  const audioCastSources = uniqueSourceNames([activeSource, ...(attributes.source_list ?? [])]).slice(0, 6);
  const showAudioCast = audioCastSources.length > 0;
  const canSelectSource = Boolean(onSelectSource) && state !== 'unavailable' && capabilities?.canSelectSource !== false;
  const ActionIcon = state === 'playing' || state === 'buffering' ? Pause : Play;
  const actionLabel = state === 'playing' || state === 'buffering' ? t('controls.media.pause') : t('controls.media.play');
  const supportsLongPress = Boolean(onLongPress && entityId);
  const useCoverBackground = hasCover && state !== 'unavailable';
  const metadataChips = buildMetadataChips(attributes);
  const showMetadata = !isMini && metadataChips.length > 0;
  const DeviceIcon = resolveDeviceIcon(attributes.device_class);
  const stateBadges = [
    attributes.is_volume_muted === true ? t('controls.media.muted') : volumeLevel !== undefined ? `${volumeLevel}%` : undefined,
    (attributes.group_members?.length ?? 0) > 1 ? t('controls.media.devicesConnected', { count: attributes.group_members!.length }) : undefined,
  ].filter((badge): badge is string => Boolean(badge));
  const showStateBadges = !isMini && stateBadges.length > 0;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (!supportsLongPress) {
      return;
    }
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      onLongPress?.(entityId!);
    }, 500);
  };

  const stopLongPress = () => {
    clearLongPressTimer();
  };

  useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [],
  );

  return (
    <div
      className={`ha-media-card ha-media-card--${state} ha-media-card--variant-${layoutVariant} ${commandPending ? 'ha-media-card--command-pending' : ''}`}
      data-media-variant={layoutVariant}
      aria-busy={commandPending || undefined}
    >
      <div
        className={`ha-media-card__surface ${isExpanded ? 'ha-media-card__surface--expanded' : 'ha-media-card__surface--compact'}`}
        onPointerDown={startLongPress}
        onPointerUp={stopLongPress}
        onPointerLeave={stopLongPress}
        onPointerCancel={stopLongPress}
      >
        <div
          className="ha-media-card__bg"
          style={useCoverBackground ? { backgroundImage: `url("${coverUrl}")` } : undefined}
          aria-hidden="true"
        />
        <div className="ha-media-card__overlay" aria-hidden="true" />

        <div className="ha-media-card__content">
          {!hideHeader ? (
            <div className="ha-media-card__header">
              <div className="ha-media-card__header-left">
                <span className="ha-media-card__icon-shell" aria-hidden="true">
                  {state === 'playing' && hasCover ? (
                    <img className="ha-media-card__icon-cover" src={coverUrl} alt="" />
                  ) : (
                    <DeviceIcon className="ha-media-card__icon" />
                  )}
                </span>
                <div className="ha-media-card__header-meta">
                  <div className="ha-media-card__name" title={headerTitle}>
                    {shouldScrollHeaderTitle ? (
                      <span className="ha-media-card__name-marquee">
                        <span className="ha-media-card__name-marquee-segment">{headerTitle}</span>
                        <span className="ha-media-card__name-marquee-segment" aria-hidden="true">
                          {headerTitle}
                        </span>
                      </span>
                    ) : (
                      headerTitle
                    )}
                  </div>
                  {headerSubtitle ? (
                    <div className="ha-media-card__status" title={headerSubtitle}>
                      {shouldScrollHeaderSubtitle ? (
                        <span className="ha-media-card__status-marquee">
                          <span className="ha-media-card__status-marquee-segment">{headerSubtitle}</span>
                          <span className="ha-media-card__status-marquee-segment" aria-hidden="true">
                            {headerSubtitle}
                          </span>
                        </span>
                      ) : (
                        headerSubtitle
                      )}
                    </div>
                  ) : null}
                </div>
                {showStateBadges ? (
                  <div className="ha-media-card__state-rail" aria-label={t('controls.media.title')}>
                    {stateBadges.map((badge, index) => (
                      <span
                        key={badge}
                        className="ha-media-card__state-badge"
                        title={badge}
                      >
                        {index === 1 && attributes.is_volume_muted === true ? (
                          <VolumeX className="ha-media-card__state-badge-icon" aria-hidden="true" />
                        ) : index === 1 && volumeLevel !== undefined ? (
                          <Volume2 className="ha-media-card__state-badge-icon" aria-hidden="true" />
                        ) : null}
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {showTrack || showTransport || showProgress || showAudioCast || showMetadata ? (
            <div className="ha-media-card__expand" aria-hidden={!isExpanded}>
              {showTrack || showAudioCast || showMetadata ? (
                <div className="ha-media-card__top-stack">
                  {showTrack ? (
                    <div className="ha-media-card__track">
                      <div className="ha-media-card__art">
                        {hasCover ? (
                          <img className="ha-media-card__art-image" src={coverUrl} alt={t('controls.media.albumCover')} />
                        ) : (
                          <Speaker className="ha-media-card__art-fallback" aria-hidden="true" />
                        )}
                      </div>

                      <div className="ha-media-card__track-meta">
                        {primaryTrackText ? <div className="ha-media-card__track-title">{primaryTrackText}</div> : null}
                        {secondaryTrackText ? (
                          <div className="ha-media-card__track-artist">{secondaryTrackText}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {showMetadata ? (
                    <div className="ha-media-card__meta-rail" aria-label={t('controls.media.settings')}>
                      {metadataChips.map((chip) => (
                        <span key={chip} className="ha-media-card__meta-chip" title={chip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {showAudioCast && !isCompact ? (
                    <div className="ha-media-card__cast-rail">
                      <p className="ha-media-card__cast-label">{t('controls.media.outputDevice')}</p>
                      <div className="ha-media-card__cast-list">
                        {audioCastSources.map((source) => {
                          const isActive = activeSource ? isSameSource(source, activeSource) : audioCastSources.length === 1;
                          return (
                            <button
                              key={source}
                              className={`ha-media-card__cast-chip ${isActive ? 'ha-media-card__cast-chip--active' : ''}`}
                              type="button"
                              aria-pressed={isActive}
                              aria-disabled={!canSelectSource}
                              title={source}
                              onPointerDown={(event) => event.stopPropagation()}
                              onPointerUp={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!canSelectSource) {
                                  return;
                                }
                                onSelectSource?.(source);
                              }}
                            >
                              <SourceIcon source={source} />
                              <span className="ha-media-card__cast-chip-text">{source}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showTransport || showProgress ? (
                <div className="ha-media-card__controls-stack">
                  {showTransport ? (
                    <div className="ha-media-card__transport">
                      <button
                        className={`ha-media-card__transport-button ha-media-card__transport-button--secondary ${
                          shuffleActive ? 'ha-media-card__transport-button--active' : ''
                        }`}
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onShuffle?.();
                        }}
                        disabled={!canShuffle}
                        aria-pressed={shuffleActive}
                        aria-label={t('controls.media.shuffle')}
                      >
                        <Shuffle className="ha-media-card__transport-icon" />
                      </button>

                      <button
                        className="ha-media-card__transport-button"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreviousTrack?.();
                        }}
                        disabled={!canPrevious}
                        aria-label={t('controls.media.previous')}
                      >
                        <SkipBack className="ha-media-card__transport-icon" />
                      </button>

                      <button
                        className="ha-media-card__transport-button ha-media-card__transport-button--primary"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onTogglePlay?.();
                        }}
                        disabled={!canToggle}
                        aria-label={actionLabel}
                      >
                        <ActionIcon className="ha-media-card__transport-icon ha-media-card__transport-icon--primary" />
                      </button>

                      <button
                        className="ha-media-card__transport-button"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onNextTrack?.();
                        }}
                        disabled={!canNext}
                        aria-label={t('controls.media.next')}
                      >
                        <SkipForward className="ha-media-card__transport-icon" />
                      </button>

                      <button
                        className={`ha-media-card__transport-button ha-media-card__transport-button--secondary ${
                          repeatActive ? 'ha-media-card__transport-button--active' : ''
                        }`}
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRepeat?.();
                        }}
                        disabled={!canRepeat}
                        aria-pressed={repeatActive}
                        aria-label={repeatLabel}
                        title={repeatLabel}
                      >
                        <Repeat className="ha-media-card__transport-icon" />
                        {repeatMode === 'one' ? (
                          <span className="ha-media-card__repeat-one" aria-hidden="true">
                            1
                          </span>
                        ) : null}
                      </button>
                    </div>
                  ) : null}

                  {showProgress ? (
                    <div className="ha-media-card__progress-block">
                      <GlassSlider
                        variant="overlay"
                        className={`ha-media-card__progress ${state === 'buffering' ? 'ha-media-card__progress--buffering' : ''}`}
                        min={0}
                        max={duration > 0 ? duration : 100}
                        step={1}
                        value={duration > 0 ? position : 0}
                        disabled={!canSeek}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          if (!onSeek) {
                            return;
                          }
                          const nextPosition = Number(event.target.value);
                          if (!Number.isFinite(nextPosition)) {
                            return;
                          }
                          onSeek(Math.max(0, Math.round(nextPosition)));
                        }}
                        style={
                          {
                            ['--ha-media-progress' as string]: `${progress}%`,
                          } as React.CSSProperties
                        }
                        aria-label={`${t('controls.media.play')} ${name}`}
                        aria-valuemin={0}
                        aria-valuemax={duration > 0 ? duration : 100}
                        aria-valuenow={duration > 0 ? position : 0}
                      />

                      <div className="ha-media-card__times">
                        <span>{formatTime(position)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default HaMediaCard;
