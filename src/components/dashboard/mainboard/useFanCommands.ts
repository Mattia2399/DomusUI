import { useCallback } from 'react';
import type React from 'react';
import type { Widget } from '../../../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import type { DeviceCommandRollbackReason } from '../../../hooks/useDeviceCommandCoordinator';
import { useDeviceCommandCoordinator } from '../../../hooks/useDeviceCommandCoordinator';
import { useI18n } from '../../../i18n/I18nProvider';
import { FAN_PENDING_ATTRIBUTE, quantizeFanPercentage, resolveFanModel, type FanPending } from '../../widgets/fanModel';

type Coordinator = Pick<ReturnType<typeof useDeviceCommandCoordinator>, 'run'>;
type FanAction = 'power' | 'percentage' | 'presetMode' | 'oscillating' | 'direction';

function isSilentRollback(reason: DeviceCommandRollbackReason) {
  return reason === 'superseded' || reason === 'cancelled' || reason === 'connection_lost';
}

function confirmed(entity: MockEntityState | undefined, field: FanAction, target: boolean | number | string, speedCount?: number) {
  const model = resolveFanModel(entity);
  if (!model.available) return false;
  if (field === 'power') return model.isOn === target;
  if (field === 'percentage') {
    if (model.percentage === undefined || typeof target !== 'number') return false;
    return Math.abs(model.percentage - target) <= Math.max(2, speedCount ? 50 / speedCount : 2);
  }
  if (field === 'presetMode') return model.presetMode === target;
  if (field === 'oscillating') return model.oscillating === target;
  return model.direction === target;
}

export function useFanCommands({
  activeWidget,
  isEditMode,
  isHaConnected,
  isDemo,
  haStatesForUi,
  commandCoordinator,
  callHaService,
  addNotification,
  setFanPendingByEntity,
  setFanStateMocks,
}: {
  activeWidget?: Widget;
  isEditMode: boolean;
  isHaConnected: boolean;
  isDemo: boolean;
  haStatesForUi: MockEntityStateMap;
  commandCoordinator: Coordinator;
  callHaService: (domain: string, service: string, payload: Record<string, unknown>) => Promise<boolean>;
  addNotification: (type: 'alert', message: string) => unknown;
  setFanPendingByEntity: React.Dispatch<React.SetStateAction<Record<string, FanPending>>>;
  setFanStateMocks: React.Dispatch<React.SetStateAction<MockEntityStateMap>>;
}) {
  const { t } = useI18n();
  const clearPending = useCallback((entityId: string) => {
    setFanPendingByEntity((current) => {
      if (!(entityId in current)) return current;
      const next = { ...current };
      delete next[entityId];
      return next;
    });
  }, [setFanPendingByEntity]);

  const runFanAction = useCallback((widget: Widget | undefined, field: FanAction, target: boolean | number | string) => {
    if (!widget || widget.kind !== 'fan' || isEditMode) return;
    const entityId = widget.entityId.trim();
    if (!entityId.startsWith('fan.')) return;
    const entity = haStatesForUi[entityId];
    const model = resolveFanModel(entity);
    if (!model.available || Object.values(model.pending).some((value) => value !== undefined)) return;
    if (field === 'power' && !(target === true ? model.canTurnOn : model.canTurnOff)) return;
    if (field === 'percentage' && !model.canSetSpeed) return;
    if (field === 'presetMode' && (!model.canSetPreset || !model.presetModes.includes(String(target)))) return;
    if (field === 'oscillating' && !model.canOscillate) return;
    if (field === 'direction' && !model.canSetDirection) return;

    const service = field === 'power' ? (target ? 'turn_on' : 'turn_off')
      : field === 'percentage' ? 'set_percentage'
        : field === 'presetMode' ? 'set_preset_mode'
          : field === 'oscillating' ? 'oscillate' : 'set_direction';
    const payload: Record<string, unknown> = { entity_id: entityId };
    if (field === 'percentage') payload.percentage = quantizeFanPercentage(Number(target), model.speedCount);
    if (field === 'presetMode') payload.preset_mode = target;
    if (field === 'oscillating') payload.oscillating = target;
    if (field === 'direction') payload.direction = target;
    const pending: FanPending = field === 'power' ? { isOn: Boolean(target) }
      : field === 'percentage' ? { percentage: Number(payload.percentage), isOn: Number(payload.percentage) > 0 }
        : field === 'presetMode' ? { presetMode: String(target) }
          : field === 'oscillating' ? { oscillating: Boolean(target) }
            : { direction: target as 'forward' | 'reverse' };

    if (isDemo) {
      setFanStateMocks((current) => {
        const previous = current[entityId];
        if (!previous) return current;
        const nextAttributes = { ...(previous.rawAttributes ?? {}) };
        if (field === 'percentage') {
          nextAttributes.percentage = payload.percentage;
          nextAttributes.preset_mode = null;
        } else if (field === 'presetMode') nextAttributes.preset_mode = target;
        else if (field === 'oscillating') nextAttributes.oscillating = target;
        else if (field === 'direction') nextAttributes.direction = target;
        const nextIsOn = field === 'power' ? Boolean(target) : field === 'percentage' ? Number(payload.percentage) > 0 : previous.toggleOn;
        return { ...current, [entityId]: {
          ...previous,
          state: nextIsOn ? 'on' : 'off',
          toggleOn: nextIsOn,
          rawAttributes: nextAttributes,
        } };
      });
      return;
    }
    if (!isHaConnected) return;
    void commandCoordinator.run({
      key: `fan:${entityId}`,
      entityId,
      domain: 'fan',
      service,
      timeoutMs: 9000,
      send: () => callHaService('fan', service, payload),
      confirm: (live) => confirmed(live, field, field === 'percentage' ? payload.percentage as number : target, model.speedCount),
      onOptimistic: () => setFanPendingByEntity((current) => ({ ...current, [entityId]: pending })),
      onConfirmed: () => clearPending(entityId),
      onRollback: (reason) => {
        clearPending(entityId);
        if (!isSilentRollback(reason)) addNotification('alert', t('fan.command.rejected'));
      },
    });
  }, [activeWidget, addNotification, callHaService, clearPending, commandCoordinator, haStatesForUi, isDemo, isEditMode, isHaConnected, setFanPendingByEntity, setFanStateMocks, t]);

  return {
    toggleFan: (widget?: Widget) => {
      const targetWidget = widget ?? activeWidget;
      const model = resolveFanModel(haStatesForUi[targetWidget?.entityId.trim() ?? '']);
      runFanAction(targetWidget, 'power', !model.isOn);
    },
    setFanPercentage: (percentage: number, widget?: Widget) => runFanAction(widget ?? activeWidget, 'percentage', percentage),
    setFanPreset: (mode: string, widget?: Widget) => runFanAction(widget ?? activeWidget, 'presetMode', mode),
    setFanOscillation: (oscillating: boolean, widget?: Widget) => runFanAction(widget ?? activeWidget, 'oscillating', oscillating),
    setFanDirection: (direction: 'forward' | 'reverse', widget?: Widget) => runFanAction(widget ?? activeWidget, 'direction', direction),
  };
}

export function enrichFanPending(entity: MockEntityState, pending: FanPending): MockEntityState {
  return {
    ...entity,
    state: pending.isOn === undefined ? entity.state : pending.isOn ? 'on' : 'off',
    toggleOn: pending.isOn ?? entity.toggleOn,
    rawAttributes: { ...(entity.rawAttributes ?? {}), [FAN_PENDING_ATTRIBUTE]: pending },
  };
}
