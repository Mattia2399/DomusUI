import type { VacuumRelatedEntityInfo } from '../widgets/vacuumDeviceModel';

/* A control or a reading that the integration of a robot adds beside the vacuum entity. */

export type VacuumRelatedEntityActionRequest = {
  entityId: string;
  action: 'toggle' | 'select' | 'number' | 'press';
  value?: string | number | boolean;
};

export function formatRelatedValue(entity: VacuumRelatedEntityInfo, unavailable: string) {
  const value = entity.stateLabel || entity.state || unavailable;
  return entity.unit && !value.endsWith(entity.unit) ? `${value} ${entity.unit}` : value;
}
