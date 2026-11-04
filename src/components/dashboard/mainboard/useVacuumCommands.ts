import type React from 'react';
import type { Widget } from '../../../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import { useDeviceCommandCoordinator } from '../../../hooks/useDeviceCommandCoordinator';
import type { DeviceCommandRollbackReason } from '../../../hooks/useDeviceCommandCoordinator';
import type { VacuumRelatedEntityActionRequest } from '../../settings/VacuumRelatedControl';
import {
  VACUUM_COMMAND_TTL_MS,
  normalizeVacuumState,
  translateVacuumState,
} from './mainBoardVacuumModel';
import { normalizeLower, toFiniteNumber, toTrimmedString } from './mainBoardValueUtils';

type CommandCoordinator = Pick<ReturnType<typeof useDeviceCommandCoordinator>, 'run'>;

type CallHaService = (
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>,
) => Promise<boolean>;

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

type ReportUnconfirmedCommand = (reason: DeviceCommandRollbackReason, message: string) => void;

type VacuumServiceName = 'start' | 'pause' | 'stop' | 'return_to_base' | 'locate' | 'clean_spot';

function almostEqual(value: number | undefined, expected: number | undefined, tolerance = 0.15) {
  return (
    Number.isFinite(value) &&
    Number.isFinite(expected) &&
    Math.abs((value as number) - (expected as number)) <= tolerance
  );
}

export function useVacuumCommands({
  activeWidget,
  isHaConnected,
  haStates,
  haStatesForUi,
  vacuumStateMocks,
  setVacuumStateMocks,
  setWidgets,
  updateWidget,
  commandCoordinator,
  callHaService,
  runHaCoordinatedCommand,
  reportUnconfirmedCommand,
  vacuumReturnToBaseTimeoutRef,
}: {
  activeWidget: Widget | undefined;
  isHaConnected: boolean;
  haStates: MockEntityStateMap;
  haStatesForUi: MockEntityStateMap;
  vacuumStateMocks: MockEntityStateMap;
  setVacuumStateMocks: React.Dispatch<React.SetStateAction<MockEntityStateMap>>;
  setWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  updateWidget: (id: string, updater: (widget: Widget) => Widget) => void;
  commandCoordinator: CommandCoordinator;
  callHaService: CallHaService;
  runHaCoordinatedCommand: RunHaCoordinatedCommand;
  reportUnconfirmedCommand: ReportUnconfirmedCommand;
  vacuumReturnToBaseTimeoutRef: React.MutableRefObject<Record<string, number>>;
}) {
  const resolveVacuumTargetContext = (widget?: Widget) => {
    const targetWidget = widget?.kind === 'vacuum' ? widget : activeWidget?.kind === 'vacuum' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const stateValue = normalizeVacuumState(
      toTrimmedString(liveEntity?.stateLabel) ??
        toTrimmedString(liveEntity?.state) ??
        targetWidget?.status,
    );
    return {
      targetWidget,
      entityId,
      liveEntity,
      stateValue,
    };
  };

  const cancelVacuumReturnTimer = (widgetId: string) => {
    const timers = vacuumReturnToBaseTimeoutRef.current;
    const timeoutId = timers[widgetId];
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      delete timers[widgetId];
    }
  };

  const scheduleVacuumDocking = (widgetId: string, entityId?: string) => {
    cancelVacuumReturnTimer(widgetId);
    vacuumReturnToBaseTimeoutRef.current[widgetId] = window.setTimeout(() => {
      setWidgets((prev) =>
        prev.map((entry) => {
          if (entry.id !== widgetId || entry.kind !== 'vacuum') {
            return entry;
          }
          return {
            ...entry,
            status: 'docked',
            isOn: false,
          };
        }),
      );
      setVacuumMockState(entityId, 'docked');
      delete vacuumReturnToBaseTimeoutRef.current[widgetId];
    }, 3800);
  };

  const updateVacuumMockEntity = (
    entityId: string | undefined,
    updater: (entity: MockEntityState) => MockEntityState,
  ) => {
    if (!entityId || haStates[entityId]) return;
    setVacuumStateMocks((current) => {
      const entity = current[entityId];
      return entity ? { ...current, [entityId]: updater(entity) } : current;
    });
  };

  const setVacuumMockState = (entityId: string | undefined, stateValue: string) => {
    updateVacuumMockEntity(entityId, (entity) => ({
      ...entity,
      state: stateValue,
      stateLabel: translateVacuumState(normalizeVacuumState(stateValue)),
    }));
  };

  const callVacuumService = (service: VacuumServiceName, widget?: Widget) => {
    const { targetWidget, entityId } = resolveVacuumTargetContext(widget);
    if (isHaConnected && entityId && haStates[entityId]) {
      if (service === 'locate') {
        runHaCoordinatedCommand({
          key: 'vacuum-locate',
          entityId,
          domain: 'vacuum',
          service,
          timeoutMs: VACUUM_COMMAND_TTL_MS,
          confirmation: 'service_response',
          errorMessage: 'Il robot non ha accettato il comando di localizzazione.',
        });
        return;
      }
      const expectedStates: Record<Exclude<typeof service, 'locate'>, string[]> = {
        start: ['cleaning'],
        pause: ['paused'],
        stop: ['idle', 'docked'],
        return_to_base: ['returning', 'docked'],
        clean_spot: ['cleaning'],
      };
      runHaCoordinatedCommand({
        key: 'vacuum-state',
        entityId,
        domain: 'vacuum',
        service,
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        confirm: (entity) => expectedStates[service].includes(normalizeVacuumState(
          toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
        )),
        errorMessage: 'Il robot non ha confermato il nuovo stato.',
      });
      return;
    }

    if (!targetWidget) {
      return;
    }

    const fallbackStatus =
      service === 'start'
        ? 'cleaning'
        : service === 'pause'
          ? 'paused'
          : service === 'return_to_base'
            ? 'returning'
            : service === 'clean_spot'
              ? 'cleaning'
              : service === 'locate'
                ? targetWidget.status
                : 'idle';
    setVacuumMockState(entityId, fallbackStatus);
    cancelVacuumReturnTimer(targetWidget.id);
    updateWidget(targetWidget.id, (current) => {
      const normalizedFallback = normalizeVacuumState(fallbackStatus);
      const baseArea =
        typeof current.vacuumCleanedArea === 'number' && Number.isFinite(current.vacuumCleanedArea)
          ? current.vacuumCleanedArea
          : 45;
      const baseMinutes =
        typeof current.vacuumCleaningMinutes === 'number' && Number.isFinite(current.vacuumCleaningMinutes)
          ? current.vacuumCleaningMinutes
          : 32;

      const nextArea =
        service === 'clean_spot'
          ? Math.round((baseArea + 1.2) * 10) / 10
          : Math.round(baseArea * 10) / 10;
      const nextMinutes = service === 'clean_spot' ? Math.round(baseMinutes + 3) : Math.round(baseMinutes);

      return {
        ...current,
        status: fallbackStatus,
        isOn: ['cleaning', 'paused', 'returning'].includes(normalizedFallback),
        vacuumCleanedArea: nextArea,
        vacuumCleaningMinutes: nextMinutes,
      };
    });
    if (service === 'return_to_base') {
      scheduleVacuumDocking(targetWidget.id, entityId);
    }
  };

  const startVacuum = (widget?: Widget) => {
    callVacuumService('start', widget);
  };

  const pauseVacuum = (widget?: Widget) => {
    callVacuumService('pause', widget);
  };

  const stopVacuum = (widget?: Widget) => {
    callVacuumService('stop', widget);
  };

  const returnVacuumToBase = (widget?: Widget) => {
    callVacuumService('return_to_base', widget);
  };

  const locateVacuum = (widget?: Widget) => {
    callVacuumService('locate', widget);
  };

  const cleanVacuumSpot = (widget?: Widget) => {
    callVacuumService('clean_spot', widget);
  };

  const cleanVacuumArea = (areaIds: string[], widget?: Widget) => {
    const normalizedAreaIds = Array.from(
      new Set(
        areaIds
          .map((areaId) => areaId.trim())
          .filter((areaId) => areaId.length > 0),
      ),
    );
    if (!normalizedAreaIds.length) {
      return;
    }

    const { targetWidget, entityId } = resolveVacuumTargetContext(widget);
    if (isHaConnected && entityId && haStates[entityId]) {
      runHaCoordinatedCommand({
        key: 'vacuum-state',
        entityId,
        domain: 'vacuum',
        service: 'clean_area',
        payload: { cleaning_area_id: normalizedAreaIds },
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        confirm: (entity) => normalizeVacuumState(
          toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
        ) === 'cleaning',
        errorMessage: 'Il robot non ha confermato la pulizia delle aree selezionate.',
      });
      return;
    }
    setVacuumMockState(entityId, 'cleaning');
    if (entityId && !haStates[entityId]) {
      setVacuumStateMocks((current) => {
        const areaEntity = current['sensor.demo_robot_cleaned_area'];
        const timeEntity = current['sensor.demo_robot_cleaning_time'];
        if (!areaEntity && !timeEntity) return current;
        const nextArea = Math.round(((toFiniteNumber(areaEntity?.state) ?? 47.6) + normalizedAreaIds.length * 1.5) * 10) / 10;
        const nextTime = Math.round((toFiniteNumber(timeEntity?.state) ?? 38) + normalizedAreaIds.length * 4);
        return {
          ...current,
          ...(areaEntity ? { 'sensor.demo_robot_cleaned_area': { ...areaEntity, state: String(nextArea), stateLabel: String(nextArea), numericValue: nextArea } } : {}),
          ...(timeEntity ? { 'sensor.demo_robot_cleaning_time': { ...timeEntity, state: String(nextTime), stateLabel: String(nextTime), numericValue: nextTime } } : {}),
        };
      });
    }
    if (!targetWidget) {
      return;
    }
    cancelVacuumReturnTimer(targetWidget.id);
    updateWidget(targetWidget.id, (current) => {
      const baseArea =
        typeof current.vacuumCleanedArea === 'number' && Number.isFinite(current.vacuumCleanedArea)
          ? current.vacuumCleanedArea
          : 45;
      const baseMinutes =
        typeof current.vacuumCleaningMinutes === 'number' && Number.isFinite(current.vacuumCleaningMinutes)
          ? current.vacuumCleaningMinutes
          : 32;
      return {
        ...current,
        status: 'cleaning',
        isOn: true,
        vacuumCleanedArea: Math.round((baseArea + Math.max(1, normalizedAreaIds.length) * 1.5) * 10) / 10,
        vacuumCleaningMinutes: Math.round(baseMinutes + Math.max(1, normalizedAreaIds.length) * 4),
      };
    });
  };

  const setVacuumFanSpeed = (fanSpeed: string, widget?: Widget) => {
    const trimmed = fanSpeed.trim();
    if (!trimmed) {
      return;
    }
    const { targetWidget, entityId } = resolveVacuumTargetContext(widget);
    if (isHaConnected && entityId && haStates[entityId]) {
      runHaCoordinatedCommand({
        key: 'vacuum-fan-speed',
        entityId,
        domain: 'vacuum',
        service: 'set_fan_speed',
        payload: { fan_speed: trimmed },
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        confirm: (entity) => normalizeLower(toTrimmedString(entity?.rawAttributes?.fan_speed)) === normalizeLower(trimmed),
        errorMessage: 'Il robot non ha confermato la nuova potenza.',
      });
      return;
    }
    updateVacuumMockEntity(entityId, (entity) => ({
      ...entity,
      rawAttributes: { ...(entity.rawAttributes ?? {}), fan_speed: trimmed },
    }));
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status: current.status,
      vacuumFanSpeed: trimmed,
    }));
  };

  const sendVacuumCommand = (command: string, params?: unknown, widget?: Widget) => {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      return;
    }
    const { entityId, targetWidget } = resolveVacuumTargetContext(widget);
    if (isHaConnected && entityId && haStates[entityId]) {
      const payload: Record<string, unknown> = {
        entity_id: entityId,
        command: trimmedCommand,
      };
      if (params !== undefined) {
        payload.params = params as Record<string, unknown> | unknown[];
      }
      const { entity_id: _entityId, ...commandPayload } = payload;
      runHaCoordinatedCommand({
        key: 'vacuum-custom-command',
        entityId,
        domain: 'vacuum',
        service: 'send_command',
        payload: commandPayload,
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: 'Il robot non ha accettato il comando personalizzato.',
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    const normalized = trimmedCommand.toLowerCase();
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status:
        normalized.includes('return')
          ? 'returning'
          : normalized.includes('pause')
            ? 'paused'
            : normalized.includes('start') || normalized.includes('clean')
              ? 'cleaning'
              : current.status,
      isOn:
        normalized.includes('return') ||
        normalized.includes('pause') ||
        normalized.includes('start') ||
        normalized.includes('clean')
          ? true
          : current.isOn,
    }));
    if (normalized.includes('return')) {
      scheduleVacuumDocking(targetWidget.id, entityId);
    }
  };

  const toggleVacuumStartPause = (widget?: Widget) => {
    const { stateValue } = resolveVacuumTargetContext(widget);
    if (stateValue === 'cleaning') {
      pauseVacuum(widget);
      return;
    }
    startVacuum(widget);
  };

  const controlVacuumRelatedEntity = async (request: VacuumRelatedEntityActionRequest) => {
    const entityId = request.entityId.trim();
    const domain = entityId.split('.')[0]?.trim();
    if (!entityId || !domain) return false;

    const mockEntity = vacuumStateMocks[entityId];
    if (mockEntity && !haStates[entityId]) {
      setVacuumStateMocks((current) => {
        const entity = current[entityId];
        if (!entity) return current;
        if (request.action === 'toggle') {
          const nextOn = typeof request.value === 'boolean'
            ? request.value
            : !(entity.toggleOn ?? entity.state === 'on');
          return { ...current, [entityId]: { ...entity, state: nextOn ? 'on' : 'off', stateLabel: nextOn ? 'Attivo' : 'Disattivato', toggleOn: nextOn } };
        }
        if (request.action === 'select' && typeof request.value === 'string') {
          return { ...current, [entityId]: { ...entity, state: request.value, stateLabel: request.value } };
        }
        if (request.action === 'number') {
          const value = toFiniteNumber(request.value);
          return value === undefined ? current : { ...current, [entityId]: { ...entity, state: String(value), stateLabel: String(value), numericValue: value } };
        }
        if (request.action === 'press') {
          const timestamp = new Date().toISOString();
          return { ...current, [entityId]: { ...entity, state: timestamp, stateLabel: 'Eseguito' } };
        }
        return current;
      });
      return true;
    }

    if (!isHaConnected) return false;
    if (request.action === 'toggle') {
      const liveEntity = haStatesForUi[entityId] ?? haStatesForUi[entityId.toLowerCase()];
      const isOn = liveEntity?.toggleOn ?? normalizeLower(liveEntity?.state) === 'on';
      const service = isOn ? 'turn_off' : 'turn_on';
      return commandCoordinator.run({
        key: `vacuum-related-toggle:${entityId}`,
        entityId,
        domain,
        service,
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        send: () => callHaService(domain, service, { entity_id: entityId }),
        confirm: (entity) => {
          const confirmedOn = typeof entity?.toggleOn === 'boolean'
            ? entity.toggleOn
            : normalizeLower(entity?.state) === 'on';
          return confirmedOn === !isOn;
        },
        onRollback: (reason) => reportUnconfirmedCommand(reason, 'Il controllo del robot non ha confermato il nuovo stato.'),
      });
    }
    if (request.action === 'select' && typeof request.value === 'string') {
      const option = request.value;
      return runHaCoordinatedCommand({
        key: 'vacuum-related-select',
        entityId,
        domain,
        service: 'select_option',
        payload: { option },
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        confirm: (entity) => normalizeLower(toTrimmedString(entity?.state)) === normalizeLower(option),
        errorMessage: 'Il controllo del robot non ha confermato la selezione.',
      });
    }
    if (request.action === 'number') {
      const value = toFiniteNumber(request.value);
      return value === undefined
        ? false
        : runHaCoordinatedCommand({
            key: 'vacuum-related-value',
            entityId,
            domain,
            service: 'set_value',
            payload: { value },
            timeoutMs: VACUUM_COMMAND_TTL_MS,
            confirm: (entity) => almostEqual(
              toFiniteNumber(entity?.numericValue) ?? toFiniteNumber(entity?.state),
              value,
            ),
            errorMessage: 'Il controllo del robot non ha confermato il valore.',
          });
    }
    if (request.action === 'press') {
      return runHaCoordinatedCommand({
        key: 'vacuum-related-press',
        entityId,
        domain,
        service: 'press',
        timeoutMs: VACUUM_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: 'Il controllo del robot non ha accettato il comando.',
      });
    }
    return false;
  };

  return {
    startVacuum,
    pauseVacuum,
    stopVacuum,
    returnVacuumToBase,
    locateVacuum,
    cleanVacuumSpot,
    cleanVacuumArea,
    setVacuumFanSpeed,
    sendVacuumCommand,
    toggleVacuumStartPause,
    controlVacuumRelatedEntity,
  };
}
