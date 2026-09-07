import { useEffect, useRef } from 'react';
import type React from 'react';
import type { ActiveDevice } from '../../settings/types';
import type { GridItem, Widget } from '../../../types/dashboardModels';
import type { MockEntityStateMap } from '../../../types/ha';
import type { DeviceCommandRollbackReason } from '../../../hooks/useDeviceCommandCoordinator';
import { useDeviceCommandCoordinator } from '../../../hooks/useDeviceCommandCoordinator';
import {
  buildLightColorServicePayload,
  buildLightCommandOptionsPayload,
  percentToHaBrightness,
  resolveLightCapabilities,
  type LightCommandOptions,
  type LightFlashMode,
} from './mainBoardLightModel';
import {
  LIGHT_BRIGHTNESS_PENDING_TTL_MS,
  LIGHT_TOGGLE_PENDING_TTL_MS,
  SWITCH_TOGGLE_PENDING_TTL_MS,
} from './useLightSwitchPendingController';
import { normalizeLower, toFiniteNumber, toTrimmedString } from './mainBoardValueUtils';
import { useI18n } from '../../../i18n/I18nProvider';

const LIGHT_BRIGHTNESS_DEBOUNCE_MS = 120;

type CommandCoordinator = Pick<
  ReturnType<typeof useDeviceCommandCoordinator>,
  'run' | 'cancel'
>;

type DemoLightActions = {
  toggleLamp: () => void;
  setLampBrightness: (value: number) => void;
  setLampColorTemp: (kelvin: number) => void;
  setLampHsColor: (hs: [number, number]) => void;
};

type PendingController = {
  setLightTogglePending: (entityId: string, targetOn: boolean) => void;
  setLightPowerPendingIfChanged: (entityId: string, targetOn: boolean) => void;
  setLightBrightnessPending: (entityId: string, brightness: number) => void;
  setLightColorPending: (entityId: string, hsColor: [number, number]) => void;
  setSwitchTogglePending: (entityId: string, targetOn: boolean) => void;
  clearLightTogglePending: (entityId: string) => void;
  clearSwitchTogglePending: (entityId: string) => void;
  clearLightCommandPending: (
    entityId: string,
    options?: { brightness?: boolean; color?: boolean; toggle?: boolean },
  ) => void;
};

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

function hueAlmostEqual(value: number | undefined, expected: number | undefined, tolerance = 1.2) {
  if (!Number.isFinite(value) || !Number.isFinite(expected)) {
    return false;
  }
  const distance = Math.abs((value as number) - (expected as number)) % 360;
  return Math.min(distance, 360 - distance) <= tolerance;
}

function isSilentRollback(reason: DeviceCommandRollbackReason) {
  return reason === 'superseded' || reason === 'cancelled' || reason === 'connection_lost';
}

export function useLightSwitchCommands({
  activeWidget,
  isEditMode,
  isHaConnected,
  haStatesForUi,
  commandCoordinator,
  pending,
  callHaService,
  addNotification,
  actions,
  updateWidgetWithAutoLayout,
  setWidgets,
  setActiveDevice,
  resolveLightLayoutForState,
  resolveSwitchLayout,
  resolveAutoWidgetLayoutChanges,
  sameLayout,
}: {
  activeWidget: Widget | undefined;
  isEditMode: boolean;
  isHaConnected: boolean;
  haStatesForUi: MockEntityStateMap;
  commandCoordinator: CommandCoordinator;
  pending: PendingController;
  callHaService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
  ) => Promise<boolean>;
  addNotification: (type: 'alert', message: string) => unknown;
  actions: DemoLightActions;
  updateWidgetWithAutoLayout: (id: string, updater: (widget: Widget) => Widget) => void;
  setWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
  setActiveDevice: React.Dispatch<React.SetStateAction<ActiveDevice | null>>;
  resolveLightLayoutForState: (widget: Widget, nextIsOn: boolean) => GridItem;
  resolveSwitchLayout: (widget: Widget) => GridItem;
  resolveAutoWidgetLayoutChanges: (previous: Widget[], next: Widget[]) => Widget[];
  sameLayout: (left: GridItem, right: GridItem) => boolean;
}) {
  const { t } = useI18n();
  const lightBrightnessDebounceRef = useRef<Record<string, number>>({});

  const clearBrightnessDebounce = (entityId?: string) => {
    if (entityId) {
      const timeoutId = lightBrightnessDebounceRef.current[entityId];
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        delete lightBrightnessDebounceRef.current[entityId];
      }
      return;
    }
    Object.values(lightBrightnessDebounceRef.current).forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    lightBrightnessDebounceRef.current = {};
  };

  useEffect(() => {
    if (!isHaConnected) clearBrightnessDebounce();
  }, [isHaConnected]);

  useEffect(() => () => clearBrightnessDebounce(), []);

  const reportUnconfirmedCommand = (
    reason: DeviceCommandRollbackReason,
    message: string,
  ) => {
    if (!isSilentRollback(reason)) {
      addNotification('alert', message);
    }
  };

  const scheduleHaLightBrightness = (
    entityId: string,
    safeValue: number,
    options?: LightCommandOptions,
  ) => {
    commandCoordinator.cancel(`light-brightness:${entityId}`, 'superseded');
    clearBrightnessDebounce(entityId);
    lightBrightnessDebounceRef.current[entityId] = window.setTimeout(() => {
      const service = safeValue <= 0 ? 'turn_off' : 'turn_on';
      void commandCoordinator.run({
        key: `light-brightness:${entityId}`,
        entityId,
        domain: 'light',
        service,
        timeoutMs: LIGHT_BRIGHTNESS_PENDING_TTL_MS,
        send: () =>
          callHaService('light', service, {
            entity_id: entityId,
            ...(safeValue > 0 ? { brightness_pct: safeValue } : {}),
            ...buildLightCommandOptionsPayload(options),
          }),
        confirm: (entity) => {
          const isOn =
            typeof entity?.toggleOn === 'boolean'
              ? entity.toggleOn
              : normalizeLower(entity?.state) === 'on';
          if (safeValue <= 0) return !isOn;
          const brightness =
            typeof entity?.brightness === 'number'
              ? entity.brightness
              : typeof entity?.numericValue === 'number'
                ? entity.numericValue
                : undefined;
          return isOn && almostEqual(brightness, safeValue, 2);
        },
        onConfirmed: () =>
          pending.clearLightCommandPending(entityId, { brightness: true, toggle: true }),
        onRollback: (reason) => {
          if (reason !== 'superseded') {
            pending.clearLightCommandPending(entityId, { brightness: true, toggle: true });
          }
          reportUnconfirmedCommand(
            reason,
            t('command.light.brightness'),
          );
        },
      });
      delete lightBrightnessDebounceRef.current[entityId];
    }, LIGHT_BRIGHTNESS_DEBOUNCE_MS);
  };

  const toggleLightEntity = (widget?: Widget) => {
    const targetWidget = widget ?? activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    const applyLocalToggle = (nextOn: boolean) => {
      if (targetWidget?.kind !== 'light') return;
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: nextOn,
        status: nextOn ? 'Opening' : 'Closed',
        value: nextOn ? Math.max(40, current.value ?? 0) : 0,
        layout: resolveLightLayoutForState(current, nextOn),
      }));
    };

    if (isHaConnected && entityId) {
      const liveEntity = haStatesForUi[entityId];
      const currentIsOn =
        typeof liveEntity?.toggleOn === 'boolean'
          ? liveEntity.toggleOn
          : targetWidget?.isOn ?? false;
      const nextIsOn = !currentIsOn;
      void commandCoordinator.run({
        key: `light-toggle:${entityId}`,
        entityId,
        domain: 'light',
        service: 'toggle',
        timeoutMs: LIGHT_TOGGLE_PENDING_TTL_MS,
        onOptimistic: () => {
          pending.setLightTogglePending(entityId, nextIsOn);
          applyLocalToggle(nextIsOn);
        },
        send: () => callHaService('light', 'toggle', { entity_id: entityId }),
        confirm: (entity) => {
          const confirmedOn =
            typeof entity?.toggleOn === 'boolean'
              ? entity.toggleOn
              : normalizeLower(entity?.state) === 'on';
          return confirmedOn === nextIsOn;
        },
        onConfirmed: () => pending.clearLightTogglePending(entityId),
        onRollback: (reason, entity) => {
          pending.clearLightTogglePending(entityId);
          const confirmedOn =
            typeof entity?.toggleOn === 'boolean'
              ? entity.toggleOn
              : normalizeLower(entity?.state) === 'on';
          applyLocalToggle(confirmedOn);
          reportUnconfirmedCommand(reason, t('command.light.state'));
        },
      });
      return;
    }

    if (targetWidget?.dataSource !== 'mock') return;

    if (targetWidget?.kind === 'light' && targetWidget.id !== 'light.living_room_lamp') {
      applyLocalToggle(!targetWidget.isOn);
      return;
    }
    actions.toggleLamp();
  };

  const toggleSwitchEntity = (widget?: Widget) => {
    const targetWidget =
      widget?.kind === 'switch'
        ? widget
        : activeWidget?.kind === 'switch'
          ? activeWidget
          : undefined;
    if (!targetWidget) return;

    const entityId = targetWidget.entityId;
    const applyLocalToggle = (nextOn: boolean) => {
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: nextOn,
        status: nextOn ? 'on' : 'off',
        value: nextOn ? 1 : 0,
        layout: resolveSwitchLayout(current),
      }));
      setActiveDevice((current) =>
        current?.type === 'switch' && current.id === targetWidget.id
          ? { ...current, status: nextOn ? 'Acceso' : 'Spento' }
          : current,
      );
    };

    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const currentIsOn =
      typeof liveEntity?.toggleOn === 'boolean'
        ? liveEntity.toggleOn
        : normalizeLower(liveEntity?.stateLabel ?? liveEntity?.state ?? targetWidget.status) ===
            'on' || Boolean(targetWidget.isOn);
    const nextIsOn = !currentIsOn;

    if (isHaConnected && entityId) {
      const entityDomain = entityId.split('.')[0]?.trim() || 'homeassistant';
      const serviceDomain = ['switch', 'input_boolean', 'fan'].includes(entityDomain)
        ? entityDomain
        : 'homeassistant';
      const service = nextIsOn ? 'turn_on' : 'turn_off';
      void commandCoordinator.run({
        key: `switch-toggle:${entityId}`,
        entityId,
        domain: serviceDomain,
        service,
        timeoutMs: SWITCH_TOGGLE_PENDING_TTL_MS,
        onOptimistic: () => {
          pending.setSwitchTogglePending(entityId, nextIsOn);
          applyLocalToggle(nextIsOn);
        },
        send: () => callHaService(serviceDomain, service, { entity_id: entityId }),
        confirm: (entity) => {
          const confirmedOn =
            typeof entity?.toggleOn === 'boolean'
              ? entity.toggleOn
              : normalizeLower(entity?.state) === 'on';
          return confirmedOn === nextIsOn;
        },
        onConfirmed: () => pending.clearSwitchTogglePending(entityId),
        onRollback: (reason, entity) => {
          pending.clearSwitchTogglePending(entityId);
          const confirmedOn =
            typeof entity?.toggleOn === 'boolean'
              ? entity.toggleOn
              : normalizeLower(entity?.state) === 'on';
          applyLocalToggle(confirmedOn);
          reportUnconfirmedCommand(
            reason,
            t('command.device.state'),
          );
        },
      });
      return;
    }
    if (targetWidget.dataSource === 'mock') applyLocalToggle(nextIsOn);
  };

  const setLightBrightness = (value: number, options?: LightCommandOptions) => {
    const targetWidget = activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    const safeValue = clamp(Math.round(value), 0, 100);
    if (isHaConnected && entityId) {
      pending.setLightBrightnessPending(entityId, safeValue);
      pending.setLightPowerPendingIfChanged(entityId, safeValue > 0);
      scheduleHaLightBrightness(entityId, safeValue, options);
      return;
    }
    if (targetWidget?.dataSource !== 'mock') return;
    if (targetWidget?.kind === 'light' && targetWidget.id !== 'light.living_room_lamp') {
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: safeValue > 0,
        status: safeValue > 0 ? 'Opening' : 'Closed',
        value: safeValue,
        layout: resolveLightLayoutForState(current, safeValue > 0),
      }));
      return;
    }
    actions.setLampBrightness(safeValue);
  };

  const handleWidgetBrightnessChange = (widget: Widget, value: number) => {
    if (widget.kind !== 'light' || isEditMode) return;
    const safeValue = clamp(Math.round(value), 0, 100);
    const nextOn = safeValue > 0;
    const nextStatus = nextOn ? 'Opening' : 'Closed';
    const applyLocal = () => {
      setWidgets((previous) => {
        const next = previous.map((entry) => {
          if (entry.id !== widget.id) return entry;
          const nextLayout = resolveLightLayoutForState(entry, nextOn);
          if (
            entry.value === safeValue &&
            entry.isOn === nextOn &&
            entry.status === nextStatus &&
            sameLayout(entry.layout, nextLayout)
          ) {
            return entry;
          }
          return {
            ...entry,
            value: safeValue,
            isOn: nextOn,
            status: nextStatus,
            layout: nextLayout,
          };
        });
        const resolved = resolveAutoWidgetLayoutChanges(previous, next);
        const changed =
          resolved.length !== previous.length ||
          resolved.some((entry, index) => {
            const oldEntry = previous[index];
            return (
              !oldEntry ||
              oldEntry.id !== entry.id ||
              oldEntry.parentSectionId !== entry.parentSectionId ||
              !sameLayout(oldEntry.layout, entry.layout) ||
              oldEntry.value !== entry.value ||
              oldEntry.isOn !== entry.isOn ||
              oldEntry.status !== entry.status
            );
          });
        return changed ? resolved : previous;
      });
    };

    if (isHaConnected && widget.entityId) {
      pending.setLightBrightnessPending(widget.entityId, safeValue);
      pending.setLightPowerPendingIfChanged(widget.entityId, nextOn);
      scheduleHaLightBrightness(widget.entityId, safeValue);
      applyLocal();
      return;
    }
    if (widget.dataSource !== 'mock') return;
    if (widget.id === 'light.living_room_lamp') actions.setLampBrightness(safeValue);
    applyLocal();
  };

  const setLightColorTemp = (kelvin: number, options?: LightCommandOptions) => {
    const targetWidget = activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const capabilities = resolveLightCapabilities(liveEntity);
    const safeKelvin = clamp(
      Math.round(kelvin),
      capabilities.minColorTempKelvin,
      capabilities.maxColorTempKelvin,
    );
    if (isHaConnected && entityId) {
      pending.setLightPowerPendingIfChanged(entityId, true);
      void commandCoordinator.run({
        key: `light-color-temperature:${entityId}`,
        entityId,
        domain: 'light',
        service: 'turn_on',
        timeoutMs: LIGHT_BRIGHTNESS_PENDING_TTL_MS,
        send: () =>
          callHaService('light', 'turn_on', {
            entity_id: entityId,
            color_temp_kelvin: safeKelvin,
            ...buildLightCommandOptionsPayload(options),
          }),
        confirm: (entity) => {
          const confirmedKelvin =
            toFiniteNumber(entity?.colorTempKelvin) ??
            toFiniteNumber(entity?.color_temp_kelvin) ??
            toFiniteNumber(entity?.rawAttributes?.color_temp_kelvin);
          return almostEqual(confirmedKelvin, safeKelvin, 25);
        },
        onConfirmed: () =>
          pending.clearLightCommandPending(entityId, { toggle: true }),
        onRollback: (reason) => {
          if (reason !== 'superseded') {
            pending.clearLightCommandPending(entityId, { toggle: true });
          }
          reportUnconfirmedCommand(
            reason,
            t('command.light.temperature'),
          );
        },
      });
      return;
    }
    if (targetWidget?.dataSource !== 'mock') return;
    if (targetWidget?.kind === 'light' && targetWidget.id !== 'light.living_room_lamp') {
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: true,
        status: 'Opening',
        layout: resolveLightLayoutForState(current, true),
      }));
      return;
    }
    actions.setLampColorTemp(safeKelvin);
  };

  const setLightHsColor = (
    hs: [number, number],
    options?: LightCommandOptions,
    widget?: Widget,
  ) => {
    const targetWidget = widget?.kind === 'light' ? widget : activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    const safeHue = clamp(Math.round(hs[0]), 0, 360);
    const safeSat = clamp(Math.round(hs[1]), 0, 100);
    if (isHaConnected && entityId) {
      const capabilities = resolveLightCapabilities(haStatesForUi[entityId]);
      const preferredColorMode = capabilities.preferredColorMode ?? 'hs';
      pending.setLightPowerPendingIfChanged(entityId, true);
      pending.setLightColorPending(entityId, [safeHue, safeSat]);
      void commandCoordinator.run({
        key: `light-color:${entityId}`,
        entityId,
        domain: 'light',
        service: 'turn_on',
        timeoutMs: LIGHT_BRIGHTNESS_PENDING_TTL_MS,
        send: () =>
          callHaService('light', 'turn_on', {
            entity_id: entityId,
            ...buildLightColorServicePayload(preferredColorMode, [safeHue, safeSat]),
            ...buildLightCommandOptionsPayload(options),
          }),
        confirm: (entity) => {
          const confirmedHs = entity?.hsColor ?? entity?.hs_color;
          return Boolean(
            confirmedHs &&
              hueAlmostEqual(confirmedHs[0], safeHue) &&
              almostEqual(confirmedHs[1], safeSat, 2),
          );
        },
        onConfirmed: () =>
          pending.clearLightCommandPending(entityId, { color: true, toggle: true }),
        onRollback: (reason) => {
          if (reason !== 'superseded') {
            pending.clearLightCommandPending(entityId, { color: true, toggle: true });
          }
          reportUnconfirmedCommand(reason, t('command.light.color'));
        },
      });
      return;
    }
    if (targetWidget?.dataSource !== 'mock') return;
    if (targetWidget?.kind === 'light' && targetWidget.id !== 'light.living_room_lamp') {
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: true,
        status: 'Opening',
        layout: resolveLightLayoutForState(current, true),
      }));
      return;
    }
    actions.setLampHsColor([safeHue, safeSat]);
  };

  const setLightWhite = (value: number, options?: LightCommandOptions) => {
    const targetWidget = activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    const safeValue = clamp(Math.round(value), 0, 100);
    if (isHaConnected && entityId) {
      pending.setLightBrightnessPending(entityId, safeValue);
      pending.setLightPowerPendingIfChanged(entityId, safeValue > 0);
      if (safeValue <= 0) {
        scheduleHaLightBrightness(entityId, safeValue, options);
        return;
      }
      void commandCoordinator.run({
        key: `light-white:${entityId}`,
        entityId,
        domain: 'light',
        service: 'turn_on',
        timeoutMs: LIGHT_BRIGHTNESS_PENDING_TTL_MS,
        send: () =>
          callHaService('light', 'turn_on', {
            entity_id: entityId,
            white: percentToHaBrightness(safeValue),
            ...buildLightCommandOptionsPayload(options),
          }),
        confirm: (entity) => {
          const brightness =
            typeof entity?.brightness === 'number'
              ? entity.brightness
              : typeof entity?.numericValue === 'number'
                ? entity.numericValue
                : undefined;
          return almostEqual(brightness, safeValue, 2);
        },
        onConfirmed: () =>
          pending.clearLightCommandPending(entityId, { brightness: true, toggle: true }),
        onRollback: (reason) => {
          if (reason !== 'superseded') {
            pending.clearLightCommandPending(entityId, { brightness: true, toggle: true });
          }
          reportUnconfirmedCommand(
            reason,
            t('command.light.white'),
          );
        },
      });
      return;
    }
    if (targetWidget?.dataSource !== 'mock') return;
    if (targetWidget?.kind === 'light' && targetWidget.id !== 'light.living_room_lamp') {
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: safeValue > 0,
        status: safeValue > 0 ? 'Opening' : 'Closed',
        value: safeValue,
        layout: resolveLightLayoutForState(current, safeValue > 0),
      }));
      return;
    }
    actions.setLampBrightness(safeValue);
  };

  const setLightEffect = (effect: string, options?: LightCommandOptions) => {
    const targetWidget = activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    const safeEffect = effect.trim();
    if (!safeEffect) return;
    if (isHaConnected && entityId) {
      pending.setLightPowerPendingIfChanged(entityId, true);
      void commandCoordinator.run({
        key: `light-effect:${entityId}`,
        entityId,
        domain: 'light',
        service: 'turn_on',
        timeoutMs: LIGHT_BRIGHTNESS_PENDING_TTL_MS,
        send: () =>
          callHaService('light', 'turn_on', {
            entity_id: entityId,
            effect: safeEffect,
            ...buildLightCommandOptionsPayload(options),
          }),
        confirm: (entity) =>
          normalizeLower(
            toTrimmedString(entity?.effect) ??
              toTrimmedString(entity?.rawAttributes?.effect),
          ) === normalizeLower(safeEffect),
        onConfirmed: () =>
          pending.clearLightCommandPending(entityId, { toggle: true }),
        onRollback: (reason) => {
          if (reason !== 'superseded') {
            pending.clearLightCommandPending(entityId, { toggle: true });
          }
          reportUnconfirmedCommand(reason, t('command.light.effect'));
        },
      });
      return;
    }
    if (targetWidget?.dataSource !== 'mock') return;
    if (targetWidget?.kind === 'light' && targetWidget.id !== 'light.living_room_lamp') {
      updateWidgetWithAutoLayout(targetWidget.id, (current) => ({
        ...current,
        isOn: true,
        status: 'Opening',
        layout: resolveLightLayoutForState(current, true),
      }));
    }
  };

  const flashLight = (mode: LightFlashMode) => {
    const targetWidget = activeWidget;
    const entityId = targetWidget?.kind === 'light' ? targetWidget.entityId : undefined;
    if (!isHaConnected || !entityId) return;
    void commandCoordinator.run({
      key: `light-flash:${entityId}`,
      entityId,
      domain: 'light',
      service: 'turn_on',
      timeoutMs: LIGHT_BRIGHTNESS_PENDING_TTL_MS,
      confirmation: 'service_response',
      send: () =>
        callHaService('light', 'turn_on', {
          entity_id: entityId,
          flash: mode,
        }),
      onRollback: (reason) =>
        reportUnconfirmedCommand(reason, t('command.light.flash')),
    });
  };

  return {
    toggleLightEntity,
    toggleSwitchEntity,
    setLightBrightness,
    handleWidgetBrightnessChange,
    setLightColorTemp,
    setLightHsColor,
    setLightWhite,
    setLightEffect,
    flashLight,
  };
}
