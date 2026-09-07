import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Cast,
  Check,
  ChevronRight,
  Info,
  ListX,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Speaker,
  Square,
  Tv2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { ContextSecondaryPage } from './ContextSecondaryPage';
import GlassSlider from '../ui/GlassSlider';
import { normalizeMediaPlayerStateKey } from '../../utils/mediaPlayerState';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

interface MediaOutputDevice {
  id: string;
  name: string;
  subtitle?: string;
  kind?: 'speaker' | 'tv' | 'cast';
}

interface MediaGroupDevice {
  id: string;
  name: string;
  subtitle?: string;
  kind?: 'speaker' | 'tv' | 'cast';
  grouped?: boolean;
}

type MediaRepeatMode = 'off' | 'all' | 'one';
type MediaPlayMode = 'play' | 'enqueue' | 'announce';

export type MediaPlayRequest = {
  mediaContentId: string;
  mediaContentType: string;
  enqueue?: 'add' | 'next' | 'play' | 'replace';
  announce?: boolean;
};

type MediaLibraryItem = {
  id: string;
  title: string;
  subtitle?: string;
  mediaContentId: string;
  mediaContentType: string;
  thumbnailUrl?: string;
};

interface MediaControlsProps {
  name?: string;
  status?: string;
  isPlaying: boolean;
  progress: number;
  positionSeconds?: number;
  trackTitle?: string;
  trackArtist?: string;
  durationSeconds?: number;
  coverUrl?: string;
  volumeLevel?: number;
  muted?: boolean;
  supportsSeek?: boolean;
  supportsVolume?: boolean;
  supportsMute?: boolean;
  supportsVolumeStep?: boolean;
  supportsNextTrack?: boolean;
  supportsPreviousTrack?: boolean;
  supportsPower?: boolean;
  supportsShuffle?: boolean;
  supportsRepeat?: boolean;
  supportsSelectSource?: boolean;
  supportsGrouping?: boolean;
  supportsStop?: boolean;
  supportsClearPlaylist?: boolean;
  supportsSelectSoundMode?: boolean;
  supportsPlayMedia?: boolean;
  supportsBrowseMedia?: boolean;
  supportsSearchMedia?: boolean;
  supportsAnnounce?: boolean;
  supportsEnqueue?: boolean;
  shuffleEnabled?: boolean;
  repeatMode?: MediaRepeatMode;
  soundMode?: string;
  soundModeList?: string[];
  volumeStep?: number;
  rawAttributes?: Record<string, unknown>;
  outputDevices?: MediaOutputDevice[];
  selectedOutputDeviceId?: string;
  multiroomDevices?: MediaGroupDevice[];
  onTogglePlayback: () => void;
  onTogglePower?: () => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
  onSeek?: (position: number) => void;
  onVolumeChange?: (value: number) => void;
  onToggleMute?: () => void;
  onToggleShuffle?: () => void;
  onCycleRepeatMode?: () => void;
  onStop?: () => void;
  onClearPlaylist?: () => void;
  onSelectSoundMode?: (soundMode: string) => void;
  onPlayMedia?: (request: MediaPlayRequest) => void;
  onSelectOutputDevice?: (deviceId: string) => void;
  onToggleMultiroomDevice?: (deviceId: string, shouldJoin: boolean) => void;
  onSecondaryPageChange?: (open: boolean) => void;
}

const DEFAULT_ALBUM_ART =
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1200&auto=format&fit=crop';
function formatTimeFromProgress(progressPercent: number, durationSeconds: number) {
  const current = Math.round((Math.max(0, Math.min(100, progressPercent)) / 100) * durationSeconds);
  const minutes = Math.floor(current / 60);
  const seconds = String(current % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatTimeFromSeconds(secondsValue: number) {
  const safe = Math.max(0, Math.round(secondsValue));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMediaContentType(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return 'media';
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized === 'tv show' || normalized === 'series') return 'tvshow';
  if (normalized === 'song') return 'track';
  if (['music', 'playlist', 'channel', 'episode', 'announcement', 'movie', 'tvshow', 'app', 'video', 'podcast', 'album', 'track'].includes(normalized)) return normalized;
  return raw;
}

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readFirstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toTrimmedString(source[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeMediaLibraryItem(value: unknown, index: number): MediaLibraryItem | null {
  if (typeof value === 'string') {
    const mediaContentId = value.trim();
    if (!mediaContentId) {
      return null;
    }
    return {
      id: `media-library-string-${index}`,
      title: mediaContentId,
      mediaContentId,
      mediaContentType: 'music',
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const mediaContentId = readFirstString(raw, ['media_content_id', 'mediaContentId', 'content_id', 'id', 'uri', 'url']);
  if (!mediaContentId) {
    return null;
  }
  const mediaContentType =
    readFirstString(raw, ['media_content_type', 'mediaContentType', 'content_type', 'type']) ?? 'music';
  const title =
    readFirstString(raw, ['title', 'name', 'label', 'media_title', 'mediaTitle']) ?? mediaContentId;
  const subtitle = readFirstString(raw, ['subtitle', 'description', 'artist', 'media_artist', 'album']);
  const thumbnailUrl = readFirstString(raw, ['thumbnail', 'thumbnail_url', 'image', 'image_url', 'artwork']);
  return {
    id: readFirstString(raw, ['key', 'item_id']) ?? `${mediaContentType}-${mediaContentId}-${index}`,
    title,
    subtitle,
    mediaContentId,
    mediaContentType,
    thumbnailUrl,
  };
}

function resolveMediaLibraryItems(rawAttributes: Record<string, unknown> | undefined) {
  const source =
    rawAttributes?.media_library ??
    rawAttributes?.media_items ??
    rawAttributes?.media_browser_items ??
    rawAttributes?.browse_items;
  const entries = Array.isArray(source) ? source : [];
  const items = entries
    .map((entry, index) => normalizeMediaLibraryItem(entry, index))
    .filter((entry): entry is MediaLibraryItem => Boolean(entry));
  const currentContentId = toTrimmedString(rawAttributes?.media_content_id);
  if (currentContentId) {
    const currentContentType = toTrimmedString(rawAttributes?.media_content_type) ?? 'music';
    const currentTitle = toTrimmedString(rawAttributes?.media_title) ?? currentContentId;
    items.unshift({
      id: `current-${currentContentType}-${currentContentId}`,
      title: currentTitle,
      subtitle: toTrimmedString(rawAttributes?.media_artist) ?? toTrimmedString(rawAttributes?.app_name),
      mediaContentId: currentContentId,
      mediaContentType: currentContentType,
      thumbnailUrl: toTrimmedString(rawAttributes?.media_image_url) ?? toTrimmedString(rawAttributes?.entity_picture),
    });
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaContentType}:${item.mediaContentId}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function SecondaryAction({
  icon,
  label,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`glass-button flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] transition-colors min-[420px]:h-14 min-[420px]:w-14 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

export function MediaControlsPanel({
  name,
  status,
  isPlaying,
  progress,
  positionSeconds,
  trackTitle = '',
  trackArtist = '',
  durationSeconds = 0,
  coverUrl,
  volumeLevel = 72,
  muted = false,
  supportsSeek = true,
  supportsVolume = true,
  supportsMute = true,
  supportsVolumeStep = false,
  supportsNextTrack = true,
  supportsPreviousTrack = true,
  supportsShuffle = true,
  supportsRepeat = true,
  supportsSelectSource = true,
  supportsGrouping = true,
  supportsStop = false,
  supportsClearPlaylist = false,
  supportsSelectSoundMode = false,
  supportsPlayMedia = false,
  supportsBrowseMedia = false,
  supportsSearchMedia = false,
  supportsAnnounce = false,
  supportsEnqueue = false,
  shuffleEnabled = false,
  repeatMode = 'off',
  soundMode,
  soundModeList,
  volumeStep,
  rawAttributes,
  outputDevices,
  selectedOutputDeviceId: selectedOutputDeviceIdProp,
  multiroomDevices,
  onTogglePlayback,
  onPreviousTrack,
  onNextTrack,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeatMode,
  onStop,
  onClearPlaylist,
  onSelectSoundMode,
  onPlayMedia,
  onSelectOutputDevice,
  onToggleMultiroomDevice,
  onSecondaryPageChange,
}: MediaControlsProps) {
  const { t } = useI18n();
  const VOLUME_DEBOUNCE_MS = 120;
  const volumeDebounceRef = useRef<number | null>(null);
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const safeDuration = Math.max(0, Math.round(durationSeconds));
  const hasLiveDuration = safeDuration > 0;
  const fallbackPosition = hasLiveDuration ? Math.round((safeProgress / 100) * safeDuration) : 0;
  const resolvedPosition = clamp(Math.round(positionSeconds ?? fallbackPosition), 0, safeDuration);
  const [livePosition, setLivePosition] = useState(resolvedPosition);
  const displayProgress = hasLiveDuration ? Math.round((livePosition / safeDuration) * 100) : 0;
  const [volumeDraft, setVolumeDraft] = useState(Math.max(0, Math.min(100, Math.round(volumeLevel))));
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const availableOutputDevices = outputDevices ?? [];
  const availableMultiroomDevices = multiroomDevices ?? [];
  const [localOutputDeviceId, setLocalOutputDeviceId] = useState(
    selectedOutputDeviceIdProp ?? availableOutputDevices[0]?.id ?? '',
  );
  const [localGroupedDeviceIds, setLocalGroupedDeviceIds] = useState<string[]>([]);
  const [multiroomPageOpen, setMultiroomPageOpen] = useState(false);
  useEffect(() => {
    onSecondaryPageChange?.(multiroomPageOpen);
    return () => onSecondaryPageChange?.(false);
  }, [multiroomPageOpen, onSecondaryPageChange]);
  const selectedOutputDeviceId = selectedOutputDeviceIdProp ?? localOutputDeviceId;
  const resolvedShuffleEnabled = Boolean(shuffleEnabled);
  const resolvedRepeatMode: MediaRepeatMode = repeatMode === 'one' || repeatMode === 'all' ? repeatMode : 'off';
  const repeatButtonLabel = t(`controls.media.repeat${resolvedRepeatMode === 'one' ? 'One' : resolvedRepeatMode === 'all' ? 'All' : 'Off'}`);
  const safeVolumePercent = Math.max(0, Math.min(100, volumeDraft));
  const elapsed = useMemo(() => formatTimeFromSeconds(livePosition), [livePosition]);
  const total = useMemo(() => formatTimeFromProgress(100, safeDuration), [safeDuration]);
  const resolvedTrackTitle = trackTitle.trim() || t('controls.media.noTrack');
  const resolvedTrackArtist = trackArtist.trim() || t('controls.media.noArtist');
  const translatedStatus = t(`controls.media.state.${normalizeMediaPlayerStateKey(status)}`);
  const resolvedName = name?.trim() || t('controls.media.title');
  const albumArt = coverUrl && coverUrl.trim().length > 0 ? coverUrl : DEFAULT_ALBUM_ART;
  const metadataDetails = [
    toTrimmedString(rawAttributes?.media_album_name),
    toTrimmedString(rawAttributes?.media_playlist),
    toTrimmedString(rawAttributes?.media_channel),
    toTrimmedString(rawAttributes?.media_series_title)
      ? [
          toTrimmedString(rawAttributes?.media_series_title),
          toTrimmedString(rawAttributes?.media_season),
          toTrimmedString(rawAttributes?.media_episode),
        ].filter(Boolean).join(' S')
      : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  const soundModes = useMemo(
    () => (
      Array.isArray(soundModeList) && soundModeList.length > 0
        ? soundModeList
        : toStringArray(rawAttributes?.sound_mode_list)
    )
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    [rawAttributes, soundModeList],
  );
  const activeSoundMode = toTrimmedString(soundMode) ?? toTrimmedString(rawAttributes?.sound_mode);
  const rawVolumeStep = volumeStep ?? toFiniteNumber(rawAttributes?.volume_step);
  const volumeStepPercent = rawVolumeStep === undefined
    ? 5
    : rawVolumeStep > 0 && rawVolumeStep <= 1
      ? Math.max(1, Math.round(rawVolumeStep * 100))
      : Math.max(1, Math.round(rawVolumeStep));
  const mediaLibraryItems = useMemo(() => resolveMediaLibraryItems(rawAttributes), [rawAttributes]);
  const filteredMediaLibraryItems = useMemo(() => {
    const query = mediaSearchQuery.trim().toLowerCase();
    if (!query) {
      return mediaLibraryItems.slice(0, 6);
    }
    return mediaLibraryItems
      .filter((item) =>
        `${item.title} ${item.subtitle ?? ''} ${item.mediaContentType} ${item.mediaContentId}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 6);
  }, [mediaLibraryItems, mediaSearchQuery]);
  const canPlayMedia = supportsPlayMedia && Boolean(onPlayMedia);
  const showMediaLibrary = filteredMediaLibraryItems.length > 0 || mediaSearchQuery.trim().length > 0;
  const groupedDeviceIds = useMemo(() => new Set(localGroupedDeviceIds), [localGroupedDeviceIds]);
  const groupedMultiroomDevices = useMemo(
    () => availableMultiroomDevices.filter((device) => groupedDeviceIds.has(device.id)),
    [availableMultiroomDevices, groupedDeviceIds],
  );
  const multiroomSummary = !supportsGrouping
    ? t('controls.media.unavailable')
    : availableMultiroomDevices.length === 0
      ? t('controls.media.noPlayers')
      : groupedMultiroomDevices.length === 0
        ? t('controls.media.thisPlayerOnly')
        : groupedMultiroomDevices.length === 1
          ? t('controls.media.deviceConnected')
          : t('controls.media.devicesConnected', { count: groupedMultiroomDevices.length });
  const multiroomDetail = groupedMultiroomDevices.length > 0
    ? groupedMultiroomDevices.map((device) => device.name).slice(0, 2).join(', ') +
      (groupedMultiroomDevices.length > 2 ? ` +${groupedMultiroomDevices.length - 2}` : '')
    : t('controls.media.addDevices');

  useEffect(() => {
    setVolumeDraft(Math.max(0, Math.min(100, Math.round(volumeLevel))));
  }, [volumeLevel]);

  useEffect(() => {
    if (selectedOutputDeviceIdProp) {
      setLocalOutputDeviceId(selectedOutputDeviceIdProp);
      return;
    }
    if (!availableOutputDevices.some((device) => device.id === localOutputDeviceId)) {
      setLocalOutputDeviceId(availableOutputDevices[0]?.id ?? '');
    }
  }, [availableOutputDevices, localOutputDeviceId, selectedOutputDeviceIdProp]);

  useEffect(() => {
    setLocalGroupedDeviceIds(
      availableMultiroomDevices
        .filter((device) => device.grouped === true)
        .map((device) => device.id),
    );
  }, [availableMultiroomDevices]);

  useEffect(() => {
    if (!supportsGrouping || availableMultiroomDevices.length === 0) {
      setMultiroomPageOpen(false);
    }
  }, [availableMultiroomDevices.length, supportsGrouping]);

  useEffect(() => {
    setLivePosition(resolvedPosition);
  }, [resolvedPosition, trackTitle, trackArtist, safeDuration, status]);

  useEffect(() => {
    if (!isPlaying || !hasLiveDuration) {
      return;
    }
    const timerId = window.setInterval(() => {
      setLivePosition((current) => {
        if (current >= safeDuration) {
          return safeDuration;
        }
        return current + 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [hasLiveDuration, isPlaying, safeDuration]);

  useEffect(
    () => () => {
      if (volumeDebounceRef.current !== null) {
        window.clearTimeout(volumeDebounceRef.current);
        volumeDebounceRef.current = null;
      }
    },
    [],
  );

  const stepVolume = (direction: -1 | 1) => {
    if (!supportsVolume || !supportsVolumeStep || !onVolumeChange) {
      return;
    }
    const nextVolume = clamp(safeVolumePercent + direction * volumeStepPercent, 0, 100);
    setVolumeDraft(nextVolume);
    onVolumeChange(nextVolume);
  };

  const submitPlayMedia = (item: MediaLibraryItem, mode: MediaPlayMode = 'play') => {
    if (!canPlayMedia) {
      return;
    }
    const mediaContentId = item.mediaContentId.trim();
    const mediaContentType = item.mediaContentType.trim() || 'music';
    if (!mediaContentId) {
      return;
    }
    onPlayMedia?.({
      mediaContentId,
      mediaContentType,
      enqueue: mode === 'enqueue' ? 'add' : undefined,
      announce: mode === 'announce' ? true : undefined,
    });
  };

  const toggleMultiroomDevice = (deviceId: string, shouldJoin: boolean) => {
    if (!supportsGrouping) {
      return;
    }
    setLocalGroupedDeviceIds((current) => {
      if (shouldJoin) {
        return current.includes(deviceId) ? current : [...current, deviceId];
      }
      return current.filter((entry) => entry !== deviceId);
    });
    onToggleMultiroomDevice?.(deviceId, shouldJoin);
  };

  if (multiroomPageOpen) {
    return (
      <ContextSecondaryPage
        title={t('controls.media.playOn')}
        subtitle={multiroomSummary}
        backLabel={t('controls.media.player')}
        icon={<Speaker size={18} />}
        iconClassName="text-cyan-200"
        onBack={() => setMultiroomPageOpen(false)}
      >
        <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} min-w-0 max-w-full overflow-hidden`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span>
              <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('controls.media.availableDevices')}</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('controls.media.chooseDevices')}</p>
            </span>
            <span className="text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{availableMultiroomDevices.length}</span>
          </div>
          <div className="grid max-h-[min(56dvh,32rem)] min-w-0 max-w-full gap-2.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:none] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {availableMultiroomDevices.map((device) => {
              const isGrouped = groupedDeviceIds.has(device.id);
              const DeviceIcon = device.kind === 'tv' ? Tv2 : device.kind === 'cast' ? Cast : Speaker;
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => toggleMultiroomDevice(device.id, !isGrouped)}
                  className={`flex w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                    isGrouped
                      ? 'border-[color:rgb(var(--ui-accent-rgb)/0.34)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-text-primary)]'
                      : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                  }`}
                  aria-pressed={isGrouped}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${isGrouped ? 'border-[color:rgb(var(--ui-accent-rgb)/0.34)] bg-[color:rgb(var(--ui-accent-rgb)/0.15)] text-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'}`}>
                      <DeviceIcon size={16} />
                    </span>
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate text-sm font-semibold">{device.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[color:var(--ui-text-tertiary)]">{isGrouped ? t('controls.media.connected') : device.subtitle ?? t('controls.media.available')}</span>
                    </span>
                  </span>
                  {isGrouped ? <Check size={16} className="shrink-0 text-[color:var(--ui-accent)]" /> : <ChevronRight size={15} className="shrink-0 text-[color:var(--ui-text-tertiary)]" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
          <p className="text-xs leading-relaxed text-[color:var(--ui-text-tertiary)]">{t('controls.media.leaderNote')}</p>
        </div>
      </ContextSecondaryPage>
    );
  }

  return (
    <div className={`${CONTEXT_PANEL_LAYOUT.shell} relative`}>
      <ContextPanelHeader title={resolvedName} subtitle={translatedStatus} icon={<Speaker size={22} />} fallbackTitle={t('controls.media.title')} />

      <div className={`relative overflow-hidden ${CONTEXT_PANEL_LAYOUT.sectionSoft} mb-1`}>
        <div
          className="absolute inset-0 z-0 bg-center bg-cover blur-3xl opacity-30 scale-110 transform"
          style={{ backgroundImage: `url(${albumArt})` }}
          aria-hidden="true"
        />

        <div className="relative z-10">
          <img
            src={albumArt}
            alt={t('controls.media.albumCover')}
            className="w-full aspect-square object-cover rounded-2xl shadow-2xl shadow-black/50"
          />

          <div className="mt-4 text-center">
            <p className="text-lg font-medium text-[color:var(--ui-text-primary)]">{resolvedTrackTitle}</p>
            <p className="mt-1 text-sm font-light text-[color:var(--ui-text-secondary)]">{resolvedTrackArtist}</p>
            {metadataDetails.length > 0 ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {metadataDetails.slice(0, 7).map((detail) => (
                  <span
                    key={detail}
                    className="max-w-[10rem] truncate rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--ui-text-tertiary)]"
                    title={detail}
                  >
                    {detail}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            <div className="h-1 overflow-hidden rounded-full bg-[color:var(--ui-fill-secondary)]">
              <div className="h-full rounded-full bg-[color:var(--ui-accent)] transition-[width]" style={{ width: `${displayProgress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--ui-text-tertiary)]">
              <span>{elapsed}</span>
              <span>{total}</span>
            </div>
          </div>

          <div className="dashboard-content-surface-soft mt-4 flex items-center justify-center gap-2.5 rounded-full p-2">
            <button
              type="button"
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-[color:var(--ui-text-primary)] transition-colors ${
                resolvedShuffleEnabled
                  ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]'
              } ${supportsShuffle ? 'hover:bg-[color:var(--ui-fill-secondary)]' : 'cursor-not-allowed opacity-45'}`}
              disabled={!supportsShuffle}
              aria-label={t('controls.media.shuffle')}
              title={resolvedShuffleEnabled ? t('controls.media.shuffleOn') : t('controls.media.shuffleOff')}
              aria-pressed={resolvedShuffleEnabled}
              onClick={() => {
                if (!supportsShuffle) {
                  return;
                }
                onToggleShuffle?.();
              }}
            >
              <Shuffle size={15} />
            </button>

            <button
              type="button"
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] transition-colors ${
                supportsPreviousTrack ? 'hover:bg-[color:var(--ui-fill-secondary)]' : 'cursor-not-allowed opacity-45'
              }`}
              aria-label={t('controls.media.previous')}
              disabled={!supportsPreviousTrack}
              onClick={() => onPreviousTrack?.()}
            >
              <SkipBack size={16} />
            </button>

            <button
              type="button"
              className="liquid-glass-selection flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] text-[color:var(--ui-accent)] shadow-[0_0_18px_rgb(var(--ui-accent-rgb)/0.12)] transition-colors"
              onClick={onTogglePlayback}
              aria-label={isPlaying ? t('controls.media.pause') : t('controls.media.play')}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>

            <button
              type="button"
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] transition-colors ${
                supportsNextTrack ? 'hover:bg-[color:var(--ui-fill-secondary)]' : 'cursor-not-allowed opacity-45'
              }`}
              aria-label={t('controls.media.next')}
              disabled={!supportsNextTrack}
              onClick={() => onNextTrack?.()}
            >
              <SkipForward size={16} />
            </button>

            <button
              type="button"
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border text-[color:var(--ui-text-primary)] transition-colors ${
                resolvedRepeatMode !== 'off'
                  ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]'
              } ${supportsRepeat ? 'hover:bg-[color:var(--ui-fill-secondary)]' : 'cursor-not-allowed opacity-45'}`}
              disabled={!supportsRepeat}
              aria-label={repeatButtonLabel}
              title={repeatButtonLabel}
              aria-pressed={resolvedRepeatMode !== 'off'}
              onClick={() => {
                if (!supportsRepeat) {
                  return;
                }
                onCycleRepeatMode?.();
              }}
            >
              <Repeat size={15} />
              {resolvedRepeatMode === 'one' ? (
                <span className="absolute -bottom-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-bg-elevated)] px-1 text-[9px] font-semibold leading-none text-[color:var(--ui-text-primary)]">
                  1
                </span>
              ) : null}
            </button>

            {supportsStop ? (
              <button
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] transition-colors ${
                  onStop ? 'hover:bg-[color:var(--ui-fill-secondary)]' : 'cursor-not-allowed opacity-45'
                }`}
                aria-label={t('controls.media.stop')}
                disabled={!onStop}
                onClick={() => onStop?.()}
              >
                <Square size={14} />
              </button>
            ) : null}
          </div>

          {supportsClearPlaylist ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={!onClearPlaylist}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  onClearPlaylist
                    ? 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                    : 'cursor-not-allowed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-disabled)]'
                }`}
                onClick={() => onClearPlaylist?.()}
              >
                <ListX size={13} />
                {t('controls.media.clearPlaylist')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showMediaLibrary ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1 w-full`}>
          <div className="px-3 pb-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-tertiary)]">
              {t('controls.media.library')}
            </p>
          </div>

          <div className="space-y-2 px-1 pb-1">
            {supportsSearchMedia ? (
              <label className="relative block">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ui-text-tertiary)]" />
                <input
                  value={mediaSearchQuery}
                  onChange={(event) => setMediaSearchQuery(event.target.value)}
                  className="ui-input h-10 w-full rounded-2xl pl-9 pr-3 text-sm"
                  placeholder={t('controls.media.search')}
                  aria-label={t('controls.media.search')}
                />
              </label>
            ) : null}

            {supportsBrowseMedia || filteredMediaLibraryItems.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {filteredMediaLibraryItems.length > 0 ? (
                  filteredMediaLibraryItems.map((item) => (
                    <div
                      key={item.id}
                      className="dashboard-content-surface flex items-center justify-between gap-3 rounded-2xl px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
                            <Music size={15} />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{item.title}</span>
                          <span className="block truncate text-[11px] text-[color:var(--ui-text-tertiary)]">
                            {item.subtitle ?? (() => {
                              const type = normalizeMediaContentType(item.mediaContentType);
                              return ['media', 'music', 'playlist', 'channel', 'episode', 'announcement', 'movie', 'tvshow', 'app', 'video', 'podcast', 'album', 'track'].includes(type)
                                ? t(`controls.media.type.${type}` as TranslationKey)
                                : type;
                            })()}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={!canPlayMedia}
                          onClick={() => submitPlayMedia(item, 'play')}
                          className="glass-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors disabled:cursor-not-allowed disabled:text-[color:var(--ui-text-disabled)]"
                          aria-label={t('controls.media.playItem', { item: item.title })}
                          title={t('controls.media.play')}
                        >
                          <Play size={13} />
                        </button>
                        {supportsEnqueue ? (
                          <button
                            type="button"
                            disabled={!canPlayMedia}
                            onClick={() => submitPlayMedia(item, 'enqueue')}
                            className="glass-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors disabled:cursor-not-allowed disabled:text-[color:var(--ui-text-disabled)]"
                            aria-label={t('controls.media.enqueueItem', { item: item.title })}
                            title={t('controls.media.enqueue')}
                          >
                            <Plus size={13} />
                          </button>
                        ) : null}
                        {supportsAnnounce ? (
                          <button
                            type="button"
                            disabled={!canPlayMedia}
                            onClick={() => submitPlayMedia(item, 'announce')}
                            className="glass-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors disabled:cursor-not-allowed disabled:text-[color:var(--ui-text-disabled)]"
                            aria-label={t('controls.media.announceItem', { item: item.title })}
                            title={t('controls.media.announce')}
                          >
                            <Bell size={13} />
                          </button>
                        ) : null}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="dashboard-content-surface rounded-2xl px-3 py-3 text-sm text-[color:var(--ui-text-tertiary)]">
                    {t('controls.media.noMedia')}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1 w-full`}>
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-tertiary)]">
          {t('controls.media.outputDevice')}
        </p>

        {availableOutputDevices.length > 0 ? (
          <div className="space-y-1.5">
            {availableOutputDevices.map((device) => {
              const isSelected = device.id === selectedOutputDeviceId;
              const DeviceIcon =
                device.kind === 'tv' ? Tv2 : device.kind === 'cast' ? Cast : Speaker;
              return (
                <button
                  key={device.id}
                  type="button"
                  disabled={!supportsSelectSource}
                  onClick={() => {
                    if (!supportsSelectSource) {
                      return;
                    }
                    if (onSelectOutputDevice) {
                      onSelectOutputDevice(device.id);
                      return;
                    }
                    setLocalOutputDeviceId(device.id);
                  }}
                  className={`flex items-center justify-between w-full rounded-2xl py-3 px-4 transition-all duration-200 active:scale-[0.98] ${
                    !supportsSelectSource
                      ? 'cursor-not-allowed text-[color:var(--ui-text-disabled)] opacity-45'
                      : isSelected
                        ? 'liquid-glass-selection cursor-pointer text-[color:var(--ui-text-primary)]'
                        : 'cursor-pointer text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <DeviceIcon
                      size={18}
                      className={isSelected ? 'text-[color:var(--ui-accent)]' : 'text-[color:var(--ui-text-secondary)]'}
                    />
                    <span className="text-sm font-medium truncate">{device.name}</span>
                  </span>

                  {isSelected ? (
                    <Check size={16} className="ml-auto text-[color:var(--ui-accent)]" />
                  ) : (
                    <span className="ml-3 shrink-0 text-xs text-[color:var(--ui-text-tertiary)]">{device.subtitle ?? ''}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-[color:var(--ui-text-tertiary)]">
            {t('controls.media.noOutput')}
          </p>
        )}
      </div>

      {supportsSelectSoundMode || soundModes.length > 0 ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1 w-full`}>
          <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-tertiary)]">
            {t('controls.media.soundMode')}
          </p>

          {soundModes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-1 pb-1">
              {soundModes.map((mode) => {
                const active = activeSoundMode?.toLowerCase() === mode.toLowerCase();
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!supportsSelectSoundMode}
                    onClick={() => {
                      if (!supportsSelectSoundMode) return;
                      onSelectSoundMode?.(mode);
                    }}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                      !supportsSelectSoundMode
                          ? 'cursor-not-allowed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-disabled)]'
                        : active
                          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-primary)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
                    }`}
                    aria-pressed={active}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-3 text-sm text-[color:var(--ui-text-tertiary)]">
              {t('controls.media.noSoundMode')}
            </p>
          )}
        </div>
      ) : null}

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1 w-full`}>
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-tertiary)]">
          {t('controls.media.playOn')}
        </p>

        <button
          type="button"
          disabled={!supportsGrouping || availableMultiroomDevices.length === 0}
          onClick={() => setMultiroomPageOpen(true)}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.98] ${
            supportsGrouping && availableMultiroomDevices.length > 0
              ? 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-secondary)]'
              : 'cursor-not-allowed bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-disabled)]'
          }`}
          aria-label={t('controls.media.manageMultiroom')}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
              <Speaker size={17} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{multiroomSummary}</span>
              <span className="mt-0.5 block truncate text-[11px] text-[color:var(--ui-text-tertiary)]">{multiroomDetail}</span>
            </span>
          </span>
          {supportsGrouping && availableMultiroomDevices.length > 0 ? (
            <ChevronRight size={17} className="shrink-0 text-[color:var(--ui-text-tertiary)]" />
          ) : null}
        </button>

        {!supportsGrouping ? (
          <div className="mt-2 rounded-xl border border-amber-200/25 bg-amber-400/10 px-3 py-2.5">
            <p className="text-xs font-medium text-amber-100">
              {t('controls.media.multiroomUnavailable')}
            </p>
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-100/80">
              <span title={t('controls.media.multiroomHintTitle')}>
                <Info
                  size={13}
                  className="mt-[1px] shrink-0"
                  aria-hidden="true"
                />
              </span>
              <span title={t('controls.media.multiroomHint')}>
                {t('controls.media.multiroomHint')}
              </span>
            </p>
          </div>
        ) : null}
      </div>

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionSoft} mb-1`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">{t('controls.media.volume')}</p>
          <div className="flex items-center gap-1.5">
            {supportsVolumeStep ? (
              <>
                <button
                  type="button"
                  disabled={!supportsVolume || !onVolumeChange}
                  onClick={() => stepVolume(-1)}
                  className="glass-button inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-[color:var(--ui-text-secondary)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('controls.media.volumeDown')}
                  title={`-${volumeStepPercent}%`}
                >
                  -
                </button>
                <button
                  type="button"
                  disabled={!supportsVolume || !onVolumeChange}
                  onClick={() => stepVolume(1)}
                  className="glass-button inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-[color:var(--ui-text-secondary)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('controls.media.volumeUp')}
                  title={`+${volumeStepPercent}%`}
                >
                  +
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                muted
                  ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] text-[color:var(--ui-accent)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
              } ${supportsMute ? '' : 'opacity-45 cursor-not-allowed'}`}
              aria-label={muted ? t('controls.media.unmute') : t('controls.media.mute')}
              title={muted ? t('controls.media.unmute') : t('controls.media.mute')}
              disabled={!supportsMute}
              onClick={() => onToggleMute?.()}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          </div>
        </div>

        <div
          className={`relative h-14 w-full cursor-pointer overflow-hidden rounded-3xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] shadow-[inset_0_1px_0_rgb(var(--ui-accent-rgb)/0.08),inset_0_-10px_18px_var(--ui-shadow-soft)] transition-transform active:scale-[0.98] ${
            supportsVolume ? '' : 'opacity-55'
          }`}
        >
          <div
            className="absolute inset-y-0 left-0 h-full bg-[color:var(--ui-accent)] opacity-75 shadow-[0_0_18px_rgb(var(--ui-accent-rgb)/0.16)] transition-[width] duration-200"
            style={{ width: `${safeVolumePercent}%` }}
          />

          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            {muted ? (
              <VolumeX size={18} className="text-[color:var(--ui-text-primary)]" />
            ) : (
              <Volume2 size={18} className="text-[color:var(--ui-text-primary)]" />
            )}
          </div>

          <div className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 text-sm font-semibold text-[color:var(--ui-text-primary)]">
            {`${safeVolumePercent}%`}
          </div>

          <GlassSlider
            variant="overlay"
            min={0}
            max={100}
            step={1}
            value={safeVolumePercent}
            disabled={!supportsVolume}
            onChange={(event) => {
              if (!supportsVolume) {
                return;
              }
              const nextValue = Math.max(0, Math.min(100, Number(event.target.value)));
              setVolumeDraft(nextValue);
              if (volumeDebounceRef.current !== null) {
                window.clearTimeout(volumeDebounceRef.current);
                volumeDebounceRef.current = null;
              }
              if (!onVolumeChange) {
                return;
              }
              volumeDebounceRef.current = window.setTimeout(() => {
                onVolumeChange(nextValue);
                volumeDebounceRef.current = null;
              }, VOLUME_DEBOUNCE_MS);
            }}
            className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:appearance-none [&::-webkit-slider-runnable-track]:appearance-none [&::-moz-range-track]:appearance-none"
            aria-label={t('controls.media.outputVolume')}
          />
        </div>
      </div>

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionSoft} mb-1 opacity-55 pointer-events-none`} aria-disabled="true">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <SecondaryAction icon={<Cast size={22} />} label={t('controls.media.castTo')} disabled />
          <SecondaryAction icon={<Mic size={22} />} label={muted ? t('controls.media.muted') : t('controls.media.talk')} disabled />
          <SecondaryAction icon={<Settings2 size={22} />} label={t('controls.media.settings')} disabled />
        </div>
      </div>

    </div>
  );
}

export const MediaControls = MediaControlsPanel;
