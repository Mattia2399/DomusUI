import type { Widget, GridItem } from '../../../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import type { useDashboardState } from '../../../hooks/useDashboardState';
import type { MediaPlayRequest } from '../../settings/MediaControls';
import { useI18n } from '../../../i18n/I18nProvider';
import {
  MEDIA_COMMAND_TTL_MS,
  resolveMediaState,
  resolveMediaRepeatMode,
  type MediaRepeatMode,
} from './mainBoardMediaModel';
import { normalizeLower, toBoolean, toFiniteNumber, toTrimmedString } from './mainBoardValueUtils';

type DashboardStateReturn = ReturnType<typeof useDashboardState>;

type SpeakerActions = Pick<
  DashboardStateReturn['actions'],
  | 'toggleSpeakerPlayback'
  | 'toggleSpeakerPower'
  | 'previousSpeakerTrack'
  | 'nextSpeakerTrack'
  | 'setSpeakerProgress'
  | 'setSpeakerVolume'
  | 'toggleSpeakerMute'
  | 'toggleSpeakerShuffle'
  | 'cycleSpeakerRepeatMode'
  | 'setSpeakerOutputDevice'
  | 'toggleSpeakerGroupMember'
>;

type ContextSpeakerLike = {
  durationSeconds?: number;
  muted?: boolean;
  shuffleEnabled?: boolean;
  repeatMode?: unknown;
};

export type HaCoordinatedCommandArgs = {
  key: string;
  entityId: string;
  domain: string;
  service: string;
  payload?: Record<string, unknown>;
  timeoutMs: number;
  confirmation?: 'entity_state' | 'service_response';
  confirm?: (entity: MockEntityState | undefined) => boolean;
  errorMessage: string;
};

type RunHaCoordinatedCommand = (args: HaCoordinatedCommandArgs) => Promise<boolean>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function almostEqual(value: number | undefined, expected: number | undefined, tolerance = 0.15) {
  return (
    Number.isFinite(value) &&
    Number.isFinite(expected) &&
    Math.abs((value as number) - (expected as number)) <= tolerance
  );
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function useMediaCommands({
  activeWidget,
  isHaConnected,
  haStatesForUi,
  updateWidget,
  resolveMediaLayout,
  runHaCoordinatedCommand,
  contextSpeaker,
  isSpeakerPlaying,
  speakerActions,
}: {
  activeWidget: Widget | undefined;
  isHaConnected: boolean;
  haStatesForUi: MockEntityStateMap;
  updateWidget: (id: string, updater: (widget: Widget) => Widget) => void;
  resolveMediaLayout: (widget: Widget) => GridItem;
  runHaCoordinatedCommand: RunHaCoordinatedCommand;
  contextSpeaker: ContextSpeakerLike;
  isSpeakerPlaying: boolean;
  speakerActions: SpeakerActions;
}) {
  const { t } = useI18n();
  const toggleMediaPlayback = (widget?: Widget) => {
    const targetWidget = widget ?? activeWidget;
    const entityId = targetWidget?.kind === 'media' ? targetWidget.entityId : undefined;
    if (isHaConnected && entityId) {
      const liveEntity = haStatesForUi[entityId];
      const mediaState = resolveMediaState(liveEntity?.state ?? liveEntity?.stateLabel ?? targetWidget?.status);
      if (mediaState === 'off' || mediaState === 'standby') {
        runHaCoordinatedCommand({
          key: 'media-playback',
          entityId,
          domain: 'media_player',
          service: 'turn_on',
          timeoutMs: MEDIA_COMMAND_TTL_MS,
          confirm: (entity) => !['off', 'standby', 'unavailable', 'unknown'].includes(resolveMediaState(
            toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
          )),
          errorMessage: t('command.media.power'),
        });
        return;
      }
      const expectedState = mediaState === 'playing' ? 'paused' : 'playing';
      runHaCoordinatedCommand({
        key: 'media-playback',
        entityId,
        domain: 'media_player',
        service: 'media_play_pause',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => resolveMediaState(
          toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
        ) === expectedState,
        errorMessage: t('command.media.playback'),
      });
      return;
    }
    if (targetWidget?.kind === 'media') {
      updateWidget(targetWidget.id, (current) => {
        const nextState = resolveMediaState(current.status);
        const nextPlaying = nextState !== 'playing';
        const nextStatus = nextPlaying ? 'playing' : 'paused';
        const nextLayout = resolveMediaLayout(current);
        return {
          ...current,
          isOn: nextPlaying,
          status: nextStatus,
          layout: nextLayout,
        };
      });
      return;
    }
    speakerActions.toggleSpeakerPlayback();
  };

  const toggleMediaPower = () => {
    const targetWidget = activeWidget?.kind === 'media' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    if (isHaConnected && entityId) {
      const mediaState = resolveMediaState(liveEntity?.state ?? liveEntity?.stateLabel ?? targetWidget?.status);
      const shouldTurnOn = ['idle', 'unavailable', 'unknown', 'off', 'standby'].includes(mediaState);
      const service = shouldTurnOn ? 'turn_on' : 'turn_off';
      runHaCoordinatedCommand({
        key: 'media-power',
        entityId,
        domain: 'media_player',
        service,
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => {
          const nextState = resolveMediaState(toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel));
          return shouldTurnOn
            ? !['off', 'standby', 'unavailable', 'unknown'].includes(nextState)
            : ['off', 'standby'].includes(nextState);
        },
        errorMessage: t('command.media.state'),
      });
      return;
    }
    speakerActions.toggleSpeakerPower();
  };

  const previousMediaTrack = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-previous',
        entityId,
        domain: 'media_player',
        service: 'media_previous_track',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: t('command.media.previous'),
      });
      return;
    }
    speakerActions.previousSpeakerTrack();
  };

  const nextMediaTrack = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-next',
        entityId,
        domain: 'media_player',
        service: 'media_next_track',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: t('command.media.next'),
      });
      return;
    }
    speakerActions.nextSpeakerTrack();
  };

  const stopMediaPlayback = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-playback',
        entityId,
        domain: 'media_player',
        service: 'media_stop',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => ['idle', 'off', 'standby'].includes(resolveMediaState(
          toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
        )),
        errorMessage: t('command.media.stop'),
      });
      return;
    }
    if (targetWidget?.kind === 'media') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        isOn: false,
        status: 'idle',
        value: 0,
      }));
    }
    if (isSpeakerPlaying) {
      speakerActions.toggleSpeakerPlayback();
    }
  };

  const clearMediaPlaylist = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-clear-playlist',
        entityId,
        domain: 'media_player',
        service: 'clear_playlist',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: t('command.media.clear'),
      });
    }
  };

  const seekMediaPosition = (nextPosition: number, widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const durationSeconds =
      typeof liveEntity?.mediaDuration === 'number'
        ? Math.max(0, Math.round(liveEntity.mediaDuration))
        : contextSpeaker.durationSeconds ?? 0;
    if (durationSeconds <= 0) {
      if (!isHaConnected) {
        speakerActions.setSpeakerProgress(0);
      }
      return;
    }
    const safePosition = clamp(Math.round(nextPosition), 0, durationSeconds);

    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-seek',
        entityId,
        domain: 'media_player',
        service: 'media_seek',
        payload: { seek_position: safePosition },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => almostEqual(
          toFiniteNumber(entity?.mediaPosition) ?? toFiniteNumber(entity?.rawAttributes?.media_position),
          safePosition,
          4,
        ),
        errorMessage: t('command.media.seek'),
      });
      return;
    }

    const progress = Math.round((safePosition / durationSeconds) * 100);
    if (targetWidget?.kind === 'media') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        value: progress,
      }));
    }
    speakerActions.setSpeakerProgress(progress);
  };

  const setMediaVolume = (nextVolume: number) => {
    const targetWidget = activeWidget?.kind === 'media' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const safeVolume = clamp(Math.round(nextVolume), 0, 100);
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-volume',
        entityId,
        domain: 'media_player',
        service: 'volume_set',
        payload: { volume_level: safeVolume / 100 },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => almostEqual(
          toFiniteNumber(entity?.volumeLevel),
          safeVolume,
          1,
        ),
        errorMessage: t('command.media.volume'),
      });
      return;
    }
    speakerActions.setSpeakerVolume(safeVolume);
  };

  const toggleMediaMute = () => {
    const targetWidget = activeWidget?.kind === 'media' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const currentMuted =
      typeof liveEntity?.mediaMuted === 'boolean' ? liveEntity.mediaMuted : Boolean(contextSpeaker.muted);
    const nextMuted = !currentMuted;
    if (isHaConnected && entityId) {
      if (typeof liveEntity?.mediaMuted !== 'boolean') {
        speakerActions.toggleSpeakerMute();
      }
      runHaCoordinatedCommand({
        key: 'media-mute',
        entityId,
        domain: 'media_player',
        service: 'volume_mute',
        payload: { is_volume_muted: nextMuted },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => {
          const muted = typeof entity?.mediaMuted === 'boolean'
            ? entity.mediaMuted
            : toBoolean(entity?.rawAttributes?.is_volume_muted);
          return muted === nextMuted;
        },
        errorMessage: t('command.media.mute'),
      });
      return;
    }
    speakerActions.toggleSpeakerMute();
  };

  const toggleMediaShuffle = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const currentShuffleRaw = toBoolean(liveEntity?.rawAttributes?.shuffle);
    const currentShuffle =
      typeof currentShuffleRaw === 'boolean'
        ? currentShuffleRaw
        : Boolean(contextSpeaker.shuffleEnabled);
    const nextShuffle = !currentShuffle;

    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-shuffle',
        entityId,
        domain: 'media_player',
        service: 'shuffle_set',
        payload: { shuffle: nextShuffle },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => {
          const shuffle = typeof entity?.shuffleEnabled === 'boolean'
            ? entity.shuffleEnabled
            : toBoolean(entity?.rawAttributes?.shuffle);
          return shuffle === nextShuffle;
        },
        errorMessage: t('command.media.shuffle'),
      });
      return;
    }

    speakerActions.toggleSpeakerShuffle();
  };

  const cycleMediaRepeatMode = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const currentRepeatMode = resolveMediaRepeatMode(
      liveEntity?.rawAttributes?.repeat ?? contextSpeaker.repeatMode ?? 'off',
    );
    const nextRepeatMode: MediaRepeatMode =
      currentRepeatMode === 'off'
        ? 'all'
        : currentRepeatMode === 'all'
          ? 'one'
          : 'off';

    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-repeat',
        entityId,
        domain: 'media_player',
        service: 'repeat_set',
        payload: { repeat: nextRepeatMode },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => resolveMediaRepeatMode(
          entity?.repeatMode ?? entity?.rawAttributes?.repeat,
        ) === nextRepeatMode,
        errorMessage: t('command.media.repeat'),
      });
      return;
    }

    speakerActions.cycleSpeakerRepeatMode();
  };

  const selectMediaOutputDevice = (deviceId: string, widget?: Widget) => {
    const selectedSource = deviceId.trim();
    if (!selectedSource) {
      return;
    }
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-source',
        entityId,
        domain: 'media_player',
        service: 'select_source',
        payload: { source: selectedSource },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => normalizeLower(
          toTrimmedString(entity?.source) ?? toTrimmedString(entity?.rawAttributes?.source),
        ) === normalizeLower(selectedSource),
        errorMessage: t('command.media.source'),
      });
      return;
    }
    speakerActions.setSpeakerOutputDevice(selectedSource);
  };

  const selectMediaSoundMode = (soundMode: string, widget?: Widget) => {
    const selectedSoundMode = soundMode.trim();
    if (!selectedSoundMode) {
      return;
    }
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      runHaCoordinatedCommand({
        key: 'media-sound-mode',
        entityId,
        domain: 'media_player',
        service: 'select_sound_mode',
        payload: { sound_mode: selectedSoundMode },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => normalizeLower(
          toTrimmedString(entity?.soundMode) ?? toTrimmedString(entity?.rawAttributes?.sound_mode),
        ) === normalizeLower(selectedSoundMode),
        errorMessage: t('command.media.soundMode'),
      });
    }
  };

  const playMedia = (request: MediaPlayRequest, widget?: Widget) => {
    const mediaContentId = request.mediaContentId.trim();
    const mediaContentType = request.mediaContentType.trim();
    if (!mediaContentId || !mediaContentType) {
      return;
    }
    const targetWidget =
      widget?.kind === 'media'
        ? widget
        : activeWidget?.kind === 'media'
          ? activeWidget
          : undefined;
    const entityId = targetWidget?.entityId;
    if (isHaConnected && entityId) {
      const serviceData: Record<string, unknown> = {
        entity_id: entityId,
        media_content_id: mediaContentId,
        media_content_type: mediaContentType,
      };
      if (request.enqueue) {
        serviceData.enqueue = request.enqueue;
      }
      if (request.announce === true) {
        serviceData.announce = true;
      }
      const { entity_id: _entityId, ...playPayload } = serviceData;
      runHaCoordinatedCommand({
        key: 'media-play-content',
        entityId,
        domain: 'media_player',
        service: 'play_media',
        payload: playPayload,
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirmation: request.announce === true || Boolean(request.enqueue)
          ? 'service_response'
          : 'entity_state',
        confirm: (entity) => {
          const confirmedContentId = toTrimmedString(entity?.mediaContentId) ??
            toTrimmedString(entity?.rawAttributes?.media_content_id);
          const mediaState = resolveMediaState(toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel));
          return confirmedContentId === mediaContentId || mediaState === 'playing';
        },
        errorMessage: t('command.media.content'),
      });
      return;
    }
    if (targetWidget?.kind === 'media') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        isOn: true,
        status: 'playing',
        value: typeof current.value === 'number' ? current.value : 0,
      }));
    }
    if (!isSpeakerPlaying) {
      speakerActions.toggleSpeakerPlayback();
    }
  };

  const toggleMediaGroupMember = (memberEntityId: string, shouldJoin: boolean) => {
    const normalizedMemberId = memberEntityId.trim();
    if (!normalizedMemberId) {
      return;
    }
    const targetWidget = activeWidget?.kind === 'media' ? activeWidget : undefined;
    const leaderEntityId = targetWidget?.entityId;
    if (isHaConnected && leaderEntityId) {
      if (shouldJoin) {
        runHaCoordinatedCommand({
          key: `media-group-join-${normalizedMemberId}`,
          entityId: leaderEntityId,
          domain: 'media_player',
          service: 'join',
          payload: { group_members: [normalizedMemberId] },
          timeoutMs: MEDIA_COMMAND_TTL_MS,
          confirm: (entity) => {
            const members = entity?.groupMembers ?? toStringArray(entity?.rawAttributes?.group_members);
            return members.includes(normalizedMemberId);
          },
          errorMessage: t('command.media.join'),
        });
        return;
      }
      runHaCoordinatedCommand({
        key: 'media-group-unjoin',
        entityId: normalizedMemberId,
        domain: 'media_player',
        service: 'unjoin',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => {
          const members = entity?.groupMembers ?? toStringArray(entity?.rawAttributes?.group_members);
          return !members.includes(leaderEntityId) && members.length <= 1;
        },
        errorMessage: t('command.media.leave'),
      });
      return;
    }
    speakerActions.toggleSpeakerGroupMember(normalizedMemberId, shouldJoin);
  };

  return {
    toggleMediaPlayback,
    toggleMediaPower,
    previousMediaTrack,
    nextMediaTrack,
    stopMediaPlayback,
    clearMediaPlaylist,
    seekMediaPosition,
    setMediaVolume,
    toggleMediaMute,
    toggleMediaShuffle,
    cycleMediaRepeatMode,
    selectMediaOutputDevice,
    selectMediaSoundMode,
    playMedia,
    toggleMediaGroupMember,
  };
}
