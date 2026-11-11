import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import { dashboardHouseLookups, type DashboardHouseContext } from '../../services/dashboardHouseContext';
import { filterEntityIdsForWidgetKind } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import type { WidgetKind } from '../../types/dashboardModels';
import type { PickerEntity } from '../editor/EntityPicker';

/** Every entity the picker can show, with its name and its room. */
export function pickerEntitiesOf(entityIds: readonly string[], states: MockEntityStateMap, registry: readonly HaEntityRegistryEntry[] = [], areas: readonly HaArea[] = [], houseContext?: DashboardHouseContext | null): PickerEntity[] {
  const byId = new Map(registry.map((entry) => [entry.entityId.toLowerCase(), entry]));
  const areaName = new Map(areas.map((area) => [area.area_id, area.name]));
  const house = dashboardHouseLookups(houseContext ?? null);
  return [...new Set(entityIds)].map((entityId) => {
    const entry = byId.get(entityId.toLowerCase());
    const friendly = states[entityId]?.rawAttributes?.friendly_name;
    // Security domains remain on their existing editor path; House has no sensitive membership.
    const legacyRoom = houseContext === undefined || /^(binary_sensor|lock|alarm_control_panel|camera)\./.test(entityId);
    const houseEntity = (entry?.registryId ? house.entitiesByRegistryId.get(entry.registryId) : undefined) ?? house.entities.get(entityId);
    const areaId = legacyRoom ? entry?.areaId : houseEntity?.effectiveRoomId ?? undefined;
    return {
      entityId,
      name: (typeof friendly === 'string' && friendly.trim()) || entry?.name || entityId,
      areaId,
      areaName: areaId ? (legacyRoom ? areaName.get(areaId) : house.roomNames.get(areaId)) : undefined,
      deviceId: entry?.deviceId,
    };
  });
}

/** The entities a card of this kind can command: those of Home Assistant, and in the demo those of the demo. */
export function cardEntityIdsOf(kind: WidgetKind, haEntityIds: readonly string[], demoEntityIds: readonly string[] = []) {
  return [...new Set([...filterEntityIdsForWidgetKind(kind, [...haEntityIds]), ...demoEntityIds])];
}

export type ExtraRole = 'battery' | 'connection' | 'status' | 'consumption';

const unitOf = (states: MockEntityStateMap, entityId: string) => `${states[entityId]?.rawAttributes?.unit_of_measurement ?? states[entityId]?.unit ?? ''}`.trim().toLowerCase();
const classOf = (states: MockEntityStateMap, entityId: string) => `${states[entityId]?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();

/** Whether an entity can play this part for a card. */
export function fitsRole(role: ExtraRole, entityId: string, states: MockEntityStateMap) {
  const domain = entityId.split('.')[0];
  if (role === 'battery') return domain === 'sensor' && (classOf(states, entityId) === 'battery' || /battery|batteria/.test(entityId));
  if (role === 'connection') return domain === 'binary_sensor' || (domain === 'sensor' && ['signal_strength'].includes(classOf(states, entityId))) || /connect|online|rssi|link/.test(entityId);
  if (role === 'status') return domain === 'binary_sensor' || domain === 'sensor';
  return domain === 'sensor' && (['power', 'energy'].includes(classOf(states, entityId)) || ['w', 'kw', 'wh', 'kwh'].includes(unitOf(states, entityId)));
}

/** One of the same device that fits the part: what the user is offered first. */
export function sameDeviceEntity(role: ExtraRole, mainEntityId: string, states: MockEntityStateMap, registry: readonly HaEntityRegistryEntry[] = []) {
  const main = registry.find((entry) => entry.entityId.toLowerCase() === mainEntityId.toLowerCase());
  if (!main?.deviceId) return undefined;
  return registry.find((entry) => entry.deviceId === main.deviceId && entry.entityId !== mainEntityId && !entry.disabledBy && !entry.hiddenBy && fitsRole(role, entry.entityId, states))?.entityId;
}
