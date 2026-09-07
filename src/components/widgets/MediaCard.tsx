import React, { useEffect, useMemo, useState } from 'react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import { HaMediaCard } from './HaMediaCard';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { buildMediaCardModel } from './mediaCardModel';
import {
  resolveMediaPixelDisplayVariant,
  resolveWidgetDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type MediaCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onTogglePlayback?: () => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
  onSeek?: (position: number) => void;
  onShuffle?: () => void;
  onRepeat?: () => void;
  onSelectSource?: (source: string) => void;
  hideHeader?: boolean;
  liveEntity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

export function MediaCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  onTogglePlayback,
  onPreviousTrack,
  onNextTrack,
  onSeek,
  onShuffle,
  onRepeat,
  onSelectSource,
  hideHeader = false,
  liveEntity,
  gridBreakpoint,
  displayVariant,
  onDisplayMetricsChange,
}: MediaCardProps) {
  const { t } = useI18n();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fallbackVariant = displayVariant ?? resolveWidgetDisplayVariant({
    kind: 'media',
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const layoutVariant = measuredSize
    ? resolveMediaPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : fallbackVariant;
  const model = useMemo(
    () => buildMediaCardModel({ widget, liveEntity, nowMs }),
    [liveEntity, nowMs, widget],
  );
  const canToggleMedia =
    model.capabilities.canTogglePlayback ||
    model.capabilities.canTurnOn ||
    model.capabilities.canTurnOff;

  useEffect(() => {
    if (model.displayState !== 'playing' || (model.metadata.duration ?? 0) <= 0) {
      return;
    }
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [model.displayState, model.metadata.duration]);

  useEffect(() => {
    setNowMs(Date.now());
  }, [liveEntity?.mediaPositionUpdatedAt, liveEntity?.mediaPosition, liveEntity?.state, liveEntity?.stateLabel]);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: layoutVariant,
    });
  }, [layoutVariant, measuredSize, onDisplayMetricsChange, widget.id]);

  return (
    <div
      ref={cardRef}
      className={`relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl ${isSelected ? 'selection-corners' : ''} ${
        isEditMode ? '' : 'cursor-pointer'
      }`}
      onClick={(event) => {
        if (isEditMode) {
          return;
        }
        event.stopPropagation();
        onClick();
      }}
    >
      <div className={`flex h-full w-full min-h-0 min-w-0 flex-col ${isEditMode ? 'pointer-events-none' : ''}`}>
        <HaMediaCard
          entityId={model.entityId}
          name={model.name}
          state={model.displayState}
          layoutVariant={layoutVariant}
          capabilities={model.capabilities}
          commandPending={model.commandPending}
          attributes={{
            state_label: model.stateLabel,
            app_id: model.metadata.appId,
            app_name: model.metadata.appName,
            device_class: model.metadata.deviceClass,
            entity_picture: model.metadata.imageUrl,
            entity_picture_local: model.metadata.imageLocalUrl,
            group_members: model.metadata.groupMembers,
            is_volume_muted: model.metadata.volumeMuted,
            media_album_artist: model.metadata.albumArtist,
            media_album_name: model.metadata.albumName,
            media_artist: model.metadata.artist,
            media_channel: model.metadata.channel,
            media_content_id: model.metadata.contentId,
            media_content_type: model.metadata.contentType,
            media_duration: model.metadata.duration,
            media_episode: model.metadata.episode,
            media_image_hash: model.metadata.imageHash,
            media_image_remotely_accessible: model.metadata.imageRemotelyAccessible,
            media_image_url: model.metadata.imageUrl,
            media_playlist: model.metadata.playlist,
            media_position: model.metadata.position,
            media_position_updated_at: model.metadata.positionUpdatedAt,
            media_season: model.metadata.season,
            media_series_title: model.metadata.seriesTitle,
            media_title: model.metadata.title,
            media_track: model.metadata.track,
            repeat: model.repeatMode,
            shuffle: model.shuffleEnabled,
            sound_mode: model.metadata.soundMode,
            sound_mode_list: model.metadata.soundModeList,
            source: model.metadata.source,
            source_list: model.metadata.sourceList,
            volume_level: model.metadata.volumeLevel,
            volume_step: model.metadata.volumeStep,
          }}
          onTogglePlay={!isEditMode && canToggleMedia ? onTogglePlayback : undefined}
          onPreviousTrack={!isEditMode && model.capabilities.canPreviousTrack ? onPreviousTrack : undefined}
          onNextTrack={!isEditMode && model.capabilities.canNextTrack ? onNextTrack : undefined}
          onSeek={!isEditMode && model.capabilities.canSeek ? onSeek : undefined}
          onShuffle={!isEditMode && model.capabilities.canShuffle ? onShuffle : undefined}
          onRepeat={!isEditMode && model.capabilities.canRepeat ? onRepeat : undefined}
          onSelectSource={!isEditMode && model.capabilities.canSelectSource ? onSelectSource : undefined}
          hideHeader={hideHeader}
        />
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onClick();
            }
          }}
          className="absolute inset-0 rounded-3xl widget-card-handle cursor-grab"
          aria-label={t('card.open', { name: widget.title })}
        />
      ) : null}
    </div>
  );
}
