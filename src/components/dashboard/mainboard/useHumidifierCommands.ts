import { useCallback } from 'react';
import type React from 'react';
import type { Widget } from '../../../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import type { DeviceCommandRollbackReason } from '../../../hooks/useDeviceCommandCoordinator';
import { useDeviceCommandCoordinator } from '../../../hooks/useDeviceCommandCoordinator';
import { useI18n } from '../../../i18n/I18nProvider';
import { HUMIDIFIER_PENDING_ATTRIBUTE, clampHumidifierTarget, resolveHumidifierModel, type HumidifierPending } from '../../widgets/humidifierModel';

type Coordinator = Pick<ReturnType<typeof useDeviceCommandCoordinator>, 'run'>;
type Action = 'power' | 'humidity' | 'mode';

const isSilentRollback = (reason: DeviceCommandRollbackReason) =>
  reason === 'superseded' || reason === 'cancelled' || reason === 'connection_lost';

function confirmed(entity: MockEntityState | undefined, action: Action, target: boolean | number | string, step: number) {
  const model = resolveHumidifierModel(entity);
  if (!model.available) return false;
  if (action === 'power') return model.isOn === target;
  if (action === 'mode') return model.mode === target;
  return model.targetHumidity !== undefined && typeof target === 'number' && Math.abs(model.targetHumidity - target) <= Math.max(step / 2, 0.5);
}

export function useHumidifierCommands({
  activeWidget,
  isEditMode,
  isHaConnected,
  isDemo,
  haStatesForUi,
  commandCoordinator,
  callHaService,
  addNotification,
  setPendingByEntity,
  setStateMocks,
}: {
  activeWidget?: Widget;
  isEditMode: boolean;
  isHaConnected: boolean;
  isDemo: boolean;
  haStatesForUi: MockEntityStateMap;
  commandCoordinator: Coordinator;
  callHaService: (domain: string, service: string, payload: Record<string, unknown>) => Promise<boolean>;
  addNotification: (type: 'alert', message: string) => unknown;
  setPendingByEntity: React.Dispatch<React.SetStateAction<Record<string, HumidifierPending>>>;
  setStateMocks: React.Dispatch<React.SetStateAction<MockEntityStateMap>>;
}) {
  const { t } = useI18n();
  const clearPending = useCallback((entityId: string) => {
    setPendingByEntity((current) => {
      if (!(entityId in current)) return current;
      const next = { ...current };
      delete next[entityId];
      return next;
    });
  }, [setPendingByEntity]);

  const run = useCallback((widget: Widget | undefined, action: Action, target: boolean | number | string) => {
    if (!widget || widget.kind !== 'humidifier' || isEditMode) return;
    const entityId = widget.entityId.trim();
    if (!entityId.startsWith('humidifier.')) return;
    const model = resolveHumidifierModel(haStatesForUi[entityId]);
    if (!model.available || Object.values(model.pending).some((value) => value !== undefined)) return;
    if (action === 'humidity' && !model.canSetHumidity) return;
    if (action === 'mode' && (!model.canSetMode || !model.availableModes.includes(String(target)))) return;

    const service = action === 'power' ? (target ? 'turn_on' : 'turn_off') : action === 'humidity' ? 'set_humidity' : 'set_mode';
    const payload: Record<string, unknown> = { entity_id: entityId };
    const normalizedTarget = action === 'humidity'
      ? clampHumidifierTarget(Number(target), model.minHumidity, model.maxHumidity, model.targetHumidityStep)
      : target;
    if (action === 'humidity') payload.humidity = normalizedTarget;
    if (action === 'mode') payload.mode = normalizedTarget;
    const pending: HumidifierPending = action === 'power' ? { isOn: Boolean(normalizedTarget) }
      : action === 'humidity' ? { targetHumidity: Number(normalizedTarget) }
        : { mode: String(normalizedTarget) };

    if (isDemo) {
      setStateMocks((current) => {
        const previous = current[entityId];
        if (!previous) return current;
        const rawAttributes = { ...(previous.rawAttributes ?? {}) };
        if (action === 'humidity') rawAttributes.humidity = normalizedTarget;
        if (action === 'mode') rawAttributes.mode = normalizedTarget;
        const nextOn = action === 'power' ? Boolean(normalizedTarget) : previous.toggleOn;
        return { ...current, [entityId]: { ...previous, state: nextOn ? 'on' : 'off', toggleOn: nextOn, rawAttributes } };
      });
      return;
    }
    if (!isHaConnected) return;
    void commandCoordinator.run({
      key: `humidifier:${entityId}`,
      entityId,
      domain: 'humidifier',
      service,
      timeoutMs: 9000,
      send: () => callHaService('humidifier', service, payload),
      confirm: (live) => confirmed(live, action, normalizedTarget, model.targetHumidityStep),
      onOptimistic: () => setPendingByEntity((current) => ({ ...current, [entityId]: pending })),
      onConfirmed: () => clearPending(entityId),
      onRollback: (reason) => {
        clearPending(entityId);
        if (!isSilentRollback(reason)) addNotification('alert', t('humidifier.command.rejected'));
      },
    });
  }, [addNotification, callHaService, clearPending, commandCoordinator, haStatesForUi, isDemo, isEditMode, isHaConnected, setPendingByEntity, setStateMocks, t]);

  return {
    toggleHumidifier: (widget?: Widget) => {
      const target = widget ?? activeWidget;
      run(target, 'power', !resolveHumidifierModel(haStatesForUi[target?.entityId.trim() ?? '']).isOn);
    },
    setHumidifierTargetHumidity: (humidity: number, widget?: Widget) => run(widget ?? activeWidget, 'humidity', humidity),
    setHumidifierMode: (mode: string, widget?: Widget) => run(widget ?? activeWidget, 'mode', mode),
  };
}

export function enrichHumidifierPending(entity: MockEntityState, pending: HumidifierPending): MockEntityState {
  return {
    ...entity,
    state: pending.isOn === undefined ? entity.state : pending.isOn ? 'on' : 'off',
    toggleOn: pending.isOn ?? entity.toggleOn,
    targetHumidity: pending.targetHumidity ?? entity.targetHumidity,
    rawAttributes: {
      ...(entity.rawAttributes ?? {}),
      ...(pending.targetHumidity === undefined ? {} : { humidity: pending.targetHumidity }),
      ...(pending.mode === undefined ? {} : { mode: pending.mode }),
      [HUMIDIFIER_PENDING_ATTRIBUTE]: pending,
    },
  };
}
