import React from 'react';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { useAmbientAssetUrl } from '../../theme/ambient/AmbientProvider';
import { LightCard } from '../devices/cards/LightCard';
import { DeviceCard } from '../devices/cards/DeviceCard';
import { ClimateCard } from '../devices/cards/ClimateCard';
import { SensorFamilyCard, toFamilySensorModel } from '../devices/cards/SensorFamilyCard';
import { SecurityCard } from '../devices/cards/SecurityCard';
import { MediaCard } from '../devices/cards/MediaCard';
import { AlarmCard, toAlarmModel } from '../devices/cards/AlarmCard';
import { VacuumCard, toVacuumModel } from '../devices/cards/VacuumCard';
import { CalendarCard } from '../devices/cards/CalendarCard';
import { MembersCard, type HouseMember } from '../devices/cards/MembersCard';
import { buildCalendarCardEvents } from './CalendarCard';
import { toLightModel, type LightAction } from '../devices/model/light';
import { toDeviceModel, type DeviceAction } from '../devices/model/device';
import { resolveClimateStep, toClimateModel, type ClimateAction } from '../devices/model/climate';
import { toSecurityModel, type LockCommand } from '../devices/model/security';
import { toMediaModel, type MediaAction } from '../devices/model/media';
import { buildCameraCardModel } from './cameraCardModel';
import type { GridV2CardFormat } from './cardCapabilityRegistry';
import type { WidgetCardCallbacks } from './CardRenderer';

/*
 * The cards of a room on a Home with the v2 metrics
 * (docs/home-cards-grid-engine-2.md §7): the model comes from the same
 * builders the Rooms page uses, the card draws the format of its box, and
 * every action of the card reaches the callback the Home already had (§7.2).
 * A card whose entity the shared cards do not know keeps its Home card.
 */

export type GridV2DeviceCardProps = WidgetCardCallbacks & {
  widget: Widget;
  liveEntity?: MockEntityState;
  format: GridV2CardFormat;
  isEditMode: boolean;
  isSelected: boolean;
  /** Commands reach Home Assistant; otherwise the card only shows and opens. */
  controlsEnabled: boolean;
  sensorHistory?: number[];
  /** The battery sensor of a sensor's device, when the Home found one. */
  sensorBatteryEntity?: MockEntityState;
  houseMembers?: HouseMember[];
  onClick: () => void;
  /** The Home card, for an entity the shared cards do not know. */
  fallback: React.ReactNode;
};

/** A stand-in state for a card without a live entity (a demo card), from what the Home widget knows. */
function entityOf(widget: Widget, liveEntity: MockEntityState | undefined): MockEntityState {
  if (liveEntity) return liveEntity;
  const on = Boolean(widget.isOn);
  const state =
    widget.kind === 'cover' ? (on ? 'open' : 'closed')
      : widget.kind === 'lock' ? (on ? 'locked' : 'unlocked')
        : widget.kind === 'climate' ? (on ? 'heat' : 'off')
          : widget.kind === 'media' ? (on ? 'paused' : 'off')
            : widget.kind === 'alarm' || widget.kind === 'vacuum' ? `${widget.status ?? ''}`.toLowerCase()
            : widget.kind === 'sensor' ? `${widget.value ?? ''}`
              : on ? 'on' : 'off';
  return {
    state,
    rawAttributes: {
      friendly_name: widget.title,
      ...(widget.kind === 'climate' && typeof widget.value === 'number' ? { temperature: widget.value } : null),
      ...(widget.kind === 'sensor' && widget.unit ? { unit_of_measurement: widget.unit } : null),
      ...(widget.kind === 'light' && widget.dataSource === 'mock'
        ? { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: Math.round((Number(widget.value ?? 100) / 100) * 255) }
        : null),
    },
  } as MockEntityState;
}

export default function GridV2DeviceCard(props: GridV2DeviceCardProps) {
  const {
    widget,
    liveEntity,
    format,
    isEditMode,
    isSelected,
    controlsEnabled,
    sensorHistory,
    onClick,
    fallback,
  } = props;
  const resolveAssetUrl = useAmbientAssetUrl();
  const entity = entityOf(widget, liveEntity);
  const name = widget.title?.trim() || undefined;
  const run = <T,>(handler: ((value: T) => void) | undefined) => (value: T) => {
    if (controlsEnabled) handler?.(value);
  };
  const common = {
    editing: isEditMode,
    selected: isSelected,
    onSelect: onClick,
  };
  // As in Rooms: the surface opens the panel and the icon commands the device.
  const openPanel = props.onOpenPanel ?? onClick;

  if (widget.kind === 'light') {
    const base = toLightModel(widget.entityId, entity);
    const model = { ...base, name: name ?? base.name };
    const onAction = run<LightAction>((action) => {
      if (action.type === 'turn_on' || action.type === 'turn_off') props.onToggleOnly?.(widget);
      else if (action.type === 'brightness') props.onLightBrightnessChange?.(widget, action.pct);
      else if (action.type === 'hue') props.onLightColorChange?.(widget, [action.hue, 100]);
      else if (action.type === 'kelvin') props.onLightColorTempChange?.(widget, action.kelvin);
      else if (action.mode === 'color') props.onLightColorChange?.(widget, [model.hue, 100]);
      else props.onLightColorTempChange?.(widget, model.kelvin);
    });
    // A lit light that grew to three rows keeps the slider of a room's tile.
    const lightFormat = format === 'U×2' && widget.layout.h >= 3 ? 'U×3' : format;
    return <LightCard model={model} format={lightFormat} {...common} onAction={onAction} onOpenPanel={openPanel} />;
  }

  if (widget.kind === 'switch' || widget.kind === 'fan' || widget.kind === 'humidifier' || widget.kind === 'cover') {
    const base = toDeviceModel(widget.entityId, entity);
    if (!base) return <>{fallback}</>;
    const model = { ...base, name: name ?? base.name };
    const toggle = widget.kind === 'fan' ? props.onFanToggle : widget.kind === 'humidifier' ? props.onHumidifierToggle : props.onToggleOnly;
    const onAction = run<DeviceAction>((action) => {
      switch (action.type) {
        case 'turn_on':
        case 'turn_off':
          toggle?.(widget);
          break;
        case 'fan_pct':
          props.onFanPercentageChange?.(widget, action.pct);
          break;
        case 'fan_preset':
          if (action.preset) props.onFanPresetChange?.(widget, action.preset);
          break;
        case 'fan_oscillate':
          props.onFanOscillationChange?.(widget, action.oscillating);
          break;
        case 'fan_direction':
          props.onFanDirectionChange?.(widget, action.direction);
          break;
        case 'cover_open':
          props.onCoverOpen?.(widget);
          break;
        case 'cover_close':
          props.onCoverClose?.(widget);
          break;
        case 'cover_stop':
          props.onCoverStop?.(widget);
          break;
        case 'cover_position':
          props.onCoverPositionChange?.(widget, action.position);
          break;
        case 'cover_tilt':
          props.onCoverTiltPositionChange?.(widget, action.tilt);
          break;
        case 'humidity':
          props.onHumidifierTargetHumidityChange?.(widget, action.target);
          break;
        case 'humidifier_mode':
          props.onHumidifierModeChange?.(widget, action.mode);
          break;
      }
    });
    return <DeviceCard model={model} format={format} {...common} onAction={onAction} onOpenPanel={openPanel} />;
  }

  if (widget.kind === 'climate') {
    const base = toClimateModel(widget.entityId, entity);
    const model = { ...base, name: name ?? base.name };
    const onAction = run<ClimateAction>((raw) => {
      const action = resolveClimateStep(model, raw);
      switch (action.type) {
        case 'turn_on':
        case 'turn_off':
          props.onClimatePowerToggle?.(widget);
          break;
        case 'mode':
          props.onClimateModeChange?.(widget, action.mode);
          break;
        case 'target':
          props.onClimateTargetTempChange?.(widget, action.target);
          break;
        case 'range':
          props.onClimateTargetRangeChange?.(widget, action.low, action.high);
          break;
        case 'fan':
          props.onClimateFanModeChange?.(widget, action.fanMode);
          break;
        case 'swing':
          props.onClimateSwingModeChange?.(widget, action.swing);
          break;
        case 'preset':
          props.onClimatePresetModeChange?.(widget, action.preset);
          break;
      }
    });
    return <ClimateCard model={model} format={format} {...common} onAction={onAction} onOpenPanel={openPanel} />;
  }

  if (widget.kind === 'sensor') {
    const battery = Number(props.sensorBatteryEntity?.state);
    const model = toFamilySensorModel(widget.entityId, entity, {
      name,
      battery: props.sensorBatteryEntity && Number.isFinite(battery) ? battery : null,
    });
    if (!model) return <>{fallback}</>;
    // The Home keeps the last 24 hours as plain values: spread them over the day.
    const values = sensorHistory ?? [];
    const now = Date.now();
    const history = values.map((value, index) => ({
      t: now - ((values.length - 1 - index) * 86_400_000) / Math.max(1, values.length - 1),
      v: value,
    }));
    return <SensorFamilyCard model={model} history={history} format={format} meterKw={widget.sensorMeterKw} now={now} {...common} onOpen={openPanel} />;
  }

  if (widget.kind === 'lock' || widget.kind === 'camera') {
    const base = toSecurityModel(widget.entityId, entity);
    if (!base) return <>{fallback}</>;
    const picture = widget.kind === 'camera' ? buildCameraCardModel(widget, liveEntity).imageUrl : undefined;
    const onLockCommand = run<LockCommand>((command) => {
      if (command === 'open') props.onLockOpen?.(widget);
      else props.onLockToggle?.(widget);
    });
    return (
      <SecurityCard
        model={{ ...base, name: name ?? base.name }}
        pictureUrl={picture ? resolveAssetUrl(picture) ?? null : null}
        format={format}
        {...common}
        onOpen={openPanel}
        onLockCommand={onLockCommand}
      />
    );
  }

  if (widget.kind === 'media') {
    const base = toMediaModel(widget.entityId, entity);
    const model = { ...base, name: name ?? base.name };
    const onAction = run<MediaAction>((action) => {
      if (action.type === 'play_pause') props.onMediaToggle?.(widget);
      else if (action.type === 'previous') props.onMediaPrevious?.(widget);
      else if (action.type === 'next') props.onMediaNext?.(widget);
      else if (action.type === 'seek') props.onMediaSeek?.(widget, action.position);
      else if (action.type === 'volume') props.onMediaVolumeChange?.(widget, action.level);
      else if (action.type === 'source') props.onMediaSelectSource?.(widget, action.source);
    });
    return (
      <MediaCard
        model={model}
        pictureUrl={model.picture ? resolveAssetUrl(model.picture) ?? null : null}
        format={format}
        {...common}
        onAction={onAction}
        onOpen={openPanel}
      />
    );
  }

  if (widget.kind === 'alarm') {
    const model = toAlarmModel(widget.entityId, entity, name);
    return (
      <AlarmCard
        model={model}
        format={format}
        {...common}
        onArm={run((mode) => props.onAlarmArm?.(widget, mode as Parameters<NonNullable<typeof props.onAlarmArm>>[1]))}
        onDisarm={() => { if (controlsEnabled) props.onAlarmDisarm?.(widget); }}
        onOpen={openPanel}
      />
    );
  }

  if (widget.kind === 'vacuum') {
    const model = toVacuumModel(widget.entityId, entity, {
      name,
      area: widget.vacuumCleanedArea ?? null,
      minutes: widget.vacuumCleaningMinutes ?? null,
      mapUrl: widget.vacuumMapUrl ? resolveAssetUrl(widget.vacuumMapUrl) ?? null : null,
    });
    return (
      <VacuumCard
        model={model}
        format={format}
        {...common}
        onStartPause={() => { if (controlsEnabled) props.onVacuumStartPause?.(widget); }}
        onReturnToBase={() => { if (controlsEnabled) props.onVacuumReturnToBase?.(widget); }}
        onOpen={openPanel}
      />
    );
  }

  if (widget.kind === 'calendar') {
    const events = buildCalendarCardEvents(widget, liveEntity, '')
      .filter((event) => event.title !== '')
      .map((event) => ({ uid: event.uid, title: event.title, start: event.start, end: event.end, allDay: event.allDay, location: event.location }));
    return (
      <CalendarCard
        name={name ?? widget.entityId}
        events={events}
        available={Boolean(liveEntity) || events.length > 0}
        format={format}
        {...common}
        onOpen={openPanel}
      />
    );
  }

  if (widget.kind === 'members') {
    return (
      <MembersCard
        title={name ?? ''}
        members={props.houseMembers ?? []}
        format={format}
        {...common}
        onOpen={() => (controlsEnabled && props.onMembersOpenPanel ? props.onMembersOpenPanel(widget) : onClick())}
      />
    );
  }

  return <>{fallback}</>;
}
