import type { MockEntityState } from '../../../types/ha';

/*
 * A Home Assistant scene as the Rooms page shows it: its icon and colour, the
 * devices it sets, when it last ran, and the calls to run it and to undo it.
 * Home Assistant does not say whether a scene is still in place, only when it
 * ran; undoing goes through a snapshot taken just before.
 */

export type SceneIcon = 'leaf' | 'film' | 'book' | 'moon' | 'sun' | 'star' | 'heart' | 'briefcase';

export type SceneModel = {
  entityId: string;
  name: string;
  icon: SceneIcon;
  /** Colour of the round mark, from a fixed palette by name. */
  color: string;
  /** The devices the scene sets, when Home Assistant lists them. */
  entityIds: string[];
  /** When it last ran, in ms. */
  ranAt: number | null;
  available: boolean;
};

export const SCENE_PALETTE = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#5E5CE6', '#64D2FF', '#34C7A5'];

/** A scene that ran in the last hours reads as the one in place. */
export const SCENE_ACTIVE_HOURS = 6;

const ICON_RULES: Array<[RegExp, SceneIcon]> = [
  [/movie|film|tv|cinema|theater|theatre/i, 'film'],
  [/book|read|lettura/i, 'book'],
  [/night|moon|sleep|bed|notte|dorm/i, 'moon'],
  [/sun|morning|wake|mattin|buongiorno|weather-sunny/i, 'sun'],
  [/heart|love|romantic|cena/i, 'heart'],
  [/briefcase|work|focus|desk|lavoro|concentra|studio/i, 'briefcase'],
  [/leaf|relax|calm|pausa|tree|spa/i, 'leaf'],
];

function hashName(name: string) {
  let hash = 2166136261;
  for (const character of name.trim().toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % SCENE_PALETTE.length;
}

export function sceneIconOf(icon: string | null | undefined, name: string): SceneIcon {
  const fromIcon = icon ? ICON_RULES.find(([pattern]) => pattern.test(icon.replace(/^mdi:/, '')))?.[1] : undefined;
  return fromIcon ?? ICON_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? 'star';
}

export function toSceneModel(entityId: string, entity: MockEntityState | undefined): SceneModel {
  const attributes = entity?.rawAttributes ?? {};
  const friendly = typeof attributes.friendly_name === 'string' && attributes.friendly_name.trim() ? attributes.friendly_name.trim() : null;
  const name = friendly ?? (entityId.split('.')[1] ?? entityId).replace(/_/g, ' ');
  const state = `${entity?.state ?? ''}`.trim();
  const ranAt = Date.parse(state);
  const listed = Array.isArray(attributes.entity_id) ? attributes.entity_id.filter((id): id is string => typeof id === 'string') : [];
  return {
    entityId,
    name,
    icon: sceneIconOf(typeof attributes.icon === 'string' ? attributes.icon : null, name),
    color: SCENE_PALETTE[hashName(name)],
    entityIds: listed,
    ranAt: Number.isFinite(ranAt) ? ranAt : null,
    available: Boolean(entity) && state !== 'unavailable',
  };
}

/** The scene of the room in place now: the last one run, if it ran in the last hours. */
export function activeSceneOf(scenes: SceneModel[], now = Date.now()) {
  const recent = scenes
    .filter((scene) => scene.ranAt !== null && now - scene.ranAt < SCENE_ACTIVE_HOURS * 3_600_000)
    .sort((a, b) => (b.ranAt as number) - (a.ranAt as number));
  return recent[0]?.entityId ?? null;
}

/*
 * How full a scene that is running reads, from 0 to 1. Home Assistant does not
 * say how long a script lasts: once it has run here, its last real duration
 * sets the pace; the first time, the fill slows down as it goes. Only the end
 * of the scene takes it to 1.
 */
export function sceneFill(elapsedMs: number, expectedMs: number | null) {
  const elapsed = Math.max(0, elapsedMs);
  if (expectedMs && expectedMs > 0) return Math.min(0.96, elapsed / expectedMs);
  return 0.9 * (1 - Math.exp(-elapsed / 12_000));
}

/** The id of the snapshot that undoes the last scene run in a room. */
export function undoSceneId(roomId: string) {
  return `domus_undo_${roomId.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
}

export type SceneCall = { domain: 'scene'; service: string; data: Record<string, unknown> };

/** First a snapshot of what the scene will change, then the scene. */
export function runSceneCalls(scene: SceneModel, roomId: string): SceneCall[] {
  const run: SceneCall = { domain: 'scene', service: 'turn_on', data: { entity_id: scene.entityId } };
  if (scene.entityIds.length === 0) return [run];
  return [{ domain: 'scene', service: 'create', data: { scene_id: undoSceneId(roomId), snapshot_entities: scene.entityIds } }, run];
}

export function undoSceneCall(roomId: string): SceneCall {
  return { domain: 'scene', service: 'turn_on', data: { entity_id: `scene.${undoSceneId(roomId)}` } };
}
