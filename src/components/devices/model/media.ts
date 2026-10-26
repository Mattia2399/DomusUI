import type { MockEntityState } from '../../../types/ha';

/*
 * A media player of a room: what it is playing, where it is in it, its
 * volume, sources, sound modes and the players it plays together with, and
 * what it supports. The commands are Home Assistant's own media_player
 * services.
 */

export type MediaKind = 'tv' | 'speaker';
export type MediaState = 'off' | 'standby' | 'on' | 'idle' | 'playing' | 'paused' | 'buffering' | 'unavailable';
export type MediaRepeat = 'off' | 'all' | 'one';

// MediaPlayerEntityFeature of Home Assistant.
const FEATURE = {
  pause: 1,
  seek: 2,
  volume: 4,
  mute: 8,
  previous: 16,
  next: 32,
  turnOn: 128,
  turnOff: 256,
  source: 2048,
  play: 16384,
  shuffle: 32768,
  soundMode: 65536,
  repeat: 262144,
  group: 524288,
} as const;

export type MediaSupports = Record<keyof typeof FEATURE, boolean>;

export type MediaModel = {
  entityId: string;
  name: string;
  kind: MediaKind;
  state: MediaState;
  available: boolean;
  /** Switched on, whatever it is doing. */
  on: boolean;
  playing: boolean;
  title: string | null;
  artist: string | null;
  app: string | null;
  /** The artwork, as Home Assistant gives it (often a path of its own). */
  picture: string | null;
  /** Seconds. */
  duration: number | null;
  position: number | null;
  /** When the position was read, ms. */
  positionAt: number | null;
  /** 0–100. */
  volume: number | null;
  muted: boolean;
  shuffle: boolean;
  repeat: MediaRepeat;
  source: string | null;
  sources: string[];
  soundMode: string | null;
  soundModes: string[];
  /** The players it plays together with, itself first when it leads them. */
  groupMembers: string[];
  supports: MediaSupports;
};

export type MediaAction =
  | { type: 'play_pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; position: number }
  | { type: 'volume'; level: number }
  | { type: 'mute'; muted: boolean }
  | { type: 'shuffle'; shuffle: boolean }
  | { type: 'repeat'; repeat: MediaRepeat }
  | { type: 'source'; source: string }
  | { type: 'sound_mode'; mode: string }
  | { type: 'power'; on: boolean }
  | { type: 'group'; member: string; joined: boolean }
  /** Only the demo: what plays next, since it has no player to ask. */
  | { type: 'show_track'; title: string; artist: string | null; duration: number; app?: string | null };

const STATES: MediaState[] = ['off', 'standby', 'on', 'idle', 'playing', 'paused', 'buffering'];

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const list = (value: unknown) => (Array.isArray(value) ? value.map(text).filter((entry): entry is string => entry !== null) : []);

export function mediaKindOf(entityId: string, entity: MockEntityState | undefined): MediaKind {
  const deviceClass = `${entity?.rawAttributes?.device_class ?? ''}`.toLowerCase();
  if (deviceClass === 'tv') return 'tv';
  if (deviceClass === 'speaker' || deviceClass === 'receiver') return 'speaker';
  const words = `${entityId} ${entity?.rawAttributes?.friendly_name ?? ''}`.toLowerCase();
  return /\b(tv|televisore|tele)\b|_tv\b|tv_/.test(words) ? 'tv' : 'speaker';
}

export function toMediaModel(entityId: string, entity: MockEntityState | undefined): MediaModel {
  const attributes = entity?.rawAttributes ?? {};
  const raw = `${entity?.state ?? ''}`.trim().toLowerCase();
  const state: MediaState = (STATES as string[]).includes(raw) ? (raw as MediaState) : 'unavailable';
  const features = Number(attributes.supported_features ?? entity?.supportedFeatures ?? 0) || 0;
  const supports = Object.fromEntries(
    Object.entries(FEATURE).map(([key, bit]) => [key, (features & bit) !== 0]),
  ) as MediaSupports;
  const volume = number(attributes.volume_level);
  const updated = text(attributes.media_position_updated_at);
  const repeat = text(attributes.repeat);
  return {
    entityId,
    name: text(attributes.friendly_name) ?? entityId.split('.')[1] ?? entityId,
    kind: mediaKindOf(entityId, entity),
    state,
    available: state !== 'unavailable',
    on: state !== 'unavailable' && state !== 'off' && state !== 'standby',
    playing: state === 'playing' || state === 'buffering',
    title: text(attributes.media_title) ?? text(attributes.media_series_title),
    artist: text(attributes.media_artist) ?? text(attributes.media_album_artist) ?? text(attributes.media_series_title),
    app: text(attributes.app_name) ?? text(attributes.source),
    picture: text(attributes.entity_picture) ?? text(attributes.media_image_url),
    duration: number(attributes.media_duration),
    position: number(attributes.media_position),
    positionAt: updated ? Date.parse(updated) || null : null,
    volume: volume === null ? null : Math.round(volume * 100),
    muted: attributes.is_volume_muted === true,
    shuffle: attributes.shuffle === true,
    repeat: repeat === 'all' || repeat === 'one' ? repeat : 'off',
    source: text(attributes.source),
    sources: list(attributes.source_list),
    soundMode: text(attributes.sound_mode),
    soundModes: list(attributes.sound_mode_list),
    groupMembers: list(attributes.group_members),
    supports,
  };
}

/** Where it is now in what it plays: the position read, moved on while it plays. */
export function mediaPositionNow(model: MediaModel, now = Date.now()) {
  if (model.position === null) return null;
  const moved = model.state === 'playing' && model.positionAt !== null ? (now - model.positionAt) / 1000 : 0;
  const position = model.position + Math.max(0, moved);
  return model.duration ? Math.min(model.duration, position) : position;
}

/** "3:25", "1:02:07". */
export function formatMediaTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** The player a room shows: the one chosen, else one that plays, else one switched on, else the first. */
export function pickRoomPlayer(models: MediaModel[], chosenId: string | null) {
  return (
    models.find((model) => model.entityId === chosenId) ??
    models.find((model) => model.playing) ??
    models.find((model) => model.on) ??
    models[0] ??
    null
  );
}

export const REPEAT_NEXT: Record<MediaRepeat, MediaRepeat> = { off: 'all', all: 'one', one: 'off' };

export function applyMediaAction(model: MediaModel, action: MediaAction, now = Date.now()): MediaModel {
  const here = mediaPositionNow(model, now);
  switch (action.type) {
    case 'play_pause': {
      if (!model.on) return { ...model, state: 'playing', on: true, playing: true, positionAt: now };
      const playing = !model.playing;
      return { ...model, state: playing ? 'playing' : 'paused', playing, position: here, positionAt: now };
    }
    case 'next':
    case 'previous':
      return { ...model, position: model.position === null ? null : 0, positionAt: now };
    case 'seek':
      return { ...model, position: action.position, positionAt: now };
    case 'volume':
      return { ...model, volume: Math.round(action.level), muted: action.level > 0 ? false : model.muted };
    case 'mute':
      return { ...model, muted: action.muted };
    case 'shuffle':
      return { ...model, shuffle: action.shuffle };
    case 'repeat':
      return { ...model, repeat: action.repeat };
    case 'source':
      // Choosing where to play from switches the player on.
      return { ...model, source: action.source, app: action.source, ...(model.on ? {} : { state: 'on' as const, on: true }) };
    case 'sound_mode':
      return { ...model, soundMode: action.mode };
    case 'power':
      return action.on
        ? { ...model, state: 'on', on: true }
        : { ...model, state: 'off', on: false, playing: false, position: here, positionAt: now };
    case 'group': {
      const others = model.groupMembers.filter((id) => id !== action.member && id !== model.entityId);
      const members = action.joined ? [...others, action.member] : others;
      return { ...model, groupMembers: members.length > 0 ? [model.entityId, ...members] : [] };
    }
    case 'show_track':
      return {
        ...model,
        title: action.title,
        artist: action.artist,
        duration: action.duration,
        app: action.app ?? model.app,
        position: 0,
        positionAt: now,
      };
    default:
      return model;
  }
}

export function mediaServiceCall(model: MediaModel, action: MediaAction) {
  const target = { entity_id: model.entityId };
  const call = (service: string, data: Record<string, unknown> = {}) => ({ domain: 'media_player', service, data: { ...target, ...data } });
  switch (action.type) {
    case 'play_pause':
      return model.on ? call('media_play_pause') : call('turn_on');
    case 'next':
    case 'show_track':
      return call('media_next_track');
    case 'previous':
      return call('media_previous_track');
    case 'seek':
      return call('media_seek', { seek_position: Math.round(action.position) });
    case 'volume':
      return call('volume_set', { volume_level: Math.round(action.level) / 100 });
    case 'mute':
      return call('volume_mute', { is_volume_muted: action.muted });
    case 'shuffle':
      return call('shuffle_set', { shuffle: action.shuffle });
    case 'repeat':
      return call('repeat_set', { repeat: action.repeat });
    case 'source':
      return call('select_source', { source: action.source });
    case 'sound_mode':
      return call('select_sound_mode', { sound_mode: action.mode });
    case 'power':
      return call(action.on ? 'turn_on' : 'turn_off');
    case 'group':
      // A player joins the group of this one; leaving is asked of the player that leaves.
      return action.joined
        ? call('join', { group_members: [action.member] })
        : { domain: 'media_player', service: 'unjoin', data: { entity_id: action.member } };
    default:
      return call('media_play_pause');
  }
}

/** Home Assistant agrees with what was asked, the position within a few seconds. */
export function mediaConfirmed(live: MediaModel, wanted: MediaModel, now = Date.now()) {
  const livePosition = mediaPositionNow(live, now);
  const wantedPosition = mediaPositionNow(wanted, now);
  return (
    (wantedPosition === null || (livePosition !== null && Math.abs(livePosition - wantedPosition) < 3)) &&
    live.on === wanted.on &&
    live.playing === wanted.playing &&
    (wanted.volume === null || live.volume === wanted.volume) &&
    live.muted === wanted.muted &&
    live.shuffle === wanted.shuffle &&
    live.repeat === wanted.repeat &&
    live.source === wanted.source &&
    live.soundMode === wanted.soundMode &&
    live.groupMembers.length === wanted.groupMembers.length
  );
}
