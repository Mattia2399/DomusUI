import React from 'react';
import { ClimateCard } from './ClimateCard';
import { LightCard } from './LightCard';
import { SwitchCard } from './SwitchCard';
import { FanCard } from './FanCard';
import { HumidifierCard } from './HumidifierCard';
import { CameraCard } from './CameraCard';
import { SensorCard } from './SensorCard';
import { MediaCard } from './MediaCard';
import { AlarmCard } from './AlarmCard';
import { VacuumCard } from './VacuumCard';
import { LockCard } from './LockCard';
import { CoverCard } from './CoverCard';
import { CalendarCard } from './CalendarCard';
import { MembersCard } from './MembersCard';
import { GreetingCard } from './GreetingCard';
import { GreetingWeatherCard } from './GreetingWeatherCard';
import { WeatherCard } from './WeatherCard';
import { ScenesCard, SCENES_CATALOG } from './ScenesCard';
import { resolveWidgetDisplayVariant, type WidgetDisplayMetrics } from './widgetDisplayVariant';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { ROOT_CANVAS_ROW_UNITS, type DashboardSection, type SceneKey, type Widget } from '../../types/dashboardModels';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import type { MockEntityState } from '../../types/ha';

type HouseMemberCardItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
};

type WidgetCardRendererProps = {
  widget: Widget;
  dashboardState: DashboardStateShape;
  isEditMode: boolean;
  isInteractive?: boolean;
  isSelected: boolean;
  value?: number;
  sensorHistory?: number[];
  sensorBatteryEntity?: MockEntityState;
  switchConsumptionEntity?: MockEntityState;
  onClick: () => void;
  onLightBrightnessChange?: (widget: Widget, value: number) => void;
  onLightColorChange?: (widget: Widget, hs: [number, number]) => void;
  onSwitchToggle?: (widget: Widget) => void;
  onFanToggle?: (widget: Widget) => void;
  onFanPercentageChange?: (widget: Widget, percentage: number) => void;
  onFanPresetChange?: (widget: Widget, mode: string) => void;
  onFanOscillationChange?: (widget: Widget, oscillating: boolean) => void;
  onFanDirectionChange?: (widget: Widget, direction: 'forward' | 'reverse') => void;
  onHumidifierToggle?: (widget: Widget) => void;
  onHumidifierTargetHumidityChange?: (widget: Widget, humidity: number) => void;
  onHumidifierModeChange?: (widget: Widget, mode: string) => void;
  onClimateTargetTempChange?: (widget: Widget, value: number) => void;
  onClimateTargetRangeChange?: (widget: Widget, low: number, high: number) => void;
  onClimateTargetHumidityChange?: (widget: Widget, value: number) => void;
  onClimatePowerToggle?: (widget: Widget) => void;
  onClimateModeChange?: (widget: Widget, mode: string) => void;
  onClimateFanModeChange?: (widget: Widget, mode: string) => void;
  onClimatePresetModeChange?: (widget: Widget, mode: string) => void;
  onClimateSwingModeChange?: (widget: Widget, mode: string) => void;
  onClimateSwingHorizontalModeChange?: (widget: Widget, mode: string) => void;
  onMediaToggle?: (widget: Widget) => void;
  onMediaPrevious?: (widget: Widget) => void;
  onMediaNext?: (widget: Widget) => void;
  onMediaSeek?: (widget: Widget, position: number) => void;
  onMediaShuffle?: (widget: Widget) => void;
  onMediaRepeat?: (widget: Widget) => void;
  onMediaSelectSource?: (widget: Widget, source: string) => void;
  mediaHideHeader?: boolean;
  onAlarmDisarm?: (widget: Widget) => void;
  onAlarmArm?: (widget: Widget, mode: 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass') => void;
  onVacuumStartPause?: (widget: Widget) => void;
  onVacuumStop?: (widget: Widget) => void;
  onVacuumReturnToBase?: (widget: Widget) => void;
  onLockToggle?: (widget: Widget) => boolean | void;
  onLockOpen?: (widget: Widget) => void;
  onCoverPositionChange?: (widget: Widget, position: number) => void;
  onCoverTiltPositionChange?: (widget: Widget, position: number) => void;
  onCoverOpen?: (widget: Widget) => void;
  onCoverStop?: (widget: Widget) => void;
  onCoverClose?: (widget: Widget) => void;
  onMembersOpenPanel?: (widget: Widget) => void;
  liveEntity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  houseMembers?: HouseMemberCardItem[];
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

function WidgetCardRendererComponent({
  widget,
  dashboardState,
  isEditMode,
  isInteractive = true,
  isSelected,
  value,
  sensorHistory,
  sensorBatteryEntity,
  switchConsumptionEntity,
  onClick,
  onLightBrightnessChange,
  onLightColorChange,
  onSwitchToggle,
  onFanToggle,
  onFanPercentageChange,
  onFanPresetChange,
  onFanOscillationChange,
  onFanDirectionChange,
  onHumidifierToggle,
  onHumidifierTargetHumidityChange,
  onHumidifierModeChange,
  onClimateTargetTempChange,
  onClimateTargetRangeChange,
  onClimateTargetHumidityChange,
  onClimatePowerToggle,
  onClimateModeChange,
  onClimateFanModeChange,
  onClimatePresetModeChange,
  onClimateSwingModeChange,
  onClimateSwingHorizontalModeChange,
  onMediaToggle,
  onMediaPrevious,
  onMediaNext,
  onMediaSeek,
  onMediaShuffle,
  onMediaRepeat,
  onMediaSelectSource,
  mediaHideHeader = false,
  onAlarmDisarm,
  onAlarmArm,
  onVacuumStartPause,
  onVacuumStop,
  onVacuumReturnToBase,
  onLockToggle,
  onLockOpen,
  onCoverPositionChange,
  onCoverTiltPositionChange,
  onCoverOpen,
  onCoverStop,
  onCoverClose,
  onMembersOpenPanel,
  liveEntity,
  gridBreakpoint,
  houseMembers,
  onDisplayMetricsChange,
}: WidgetCardRendererProps) {
  const controlsEnabled = !isEditMode && isInteractive;
  const displayVariant = resolveWidgetDisplayVariant({
    kind: widget.kind,
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });

  if (widget.kind === 'climate') {
    return (
      <ClimateCard
        widget={widget}
        state={dashboardState}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        liveEntity={liveEntity}
        onTemperatureChange={controlsEnabled && onClimateTargetTempChange ? (nextValue) => onClimateTargetTempChange(widget, nextValue) : undefined}
        onTargetRangeChange={controlsEnabled && onClimateTargetRangeChange ? (low, high) => onClimateTargetRangeChange(widget, low, high) : undefined}
        onTargetHumidityChange={controlsEnabled && onClimateTargetHumidityChange ? (nextValue) => onClimateTargetHumidityChange(widget, nextValue) : undefined}
        onPowerToggle={controlsEnabled && onClimatePowerToggle ? () => onClimatePowerToggle(widget) : undefined}
        onModeChange={controlsEnabled && onClimateModeChange ? (mode) => onClimateModeChange(widget, mode) : undefined}
        onFanModeChange={controlsEnabled && onClimateFanModeChange ? (mode) => onClimateFanModeChange(widget, mode) : undefined}
        onPresetModeChange={controlsEnabled && onClimatePresetModeChange ? (mode) => onClimatePresetModeChange(widget, mode) : undefined}
        onSwingModeChange={controlsEnabled && onClimateSwingModeChange ? (mode) => onClimateSwingModeChange(widget, mode) : undefined}
        onSwingHorizontalModeChange={controlsEnabled && onClimateSwingHorizontalModeChange ? (mode) => onClimateSwingHorizontalModeChange(widget, mode) : undefined}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'light') {
    return (
      <LightCard
        widget={widget}
        state={dashboardState}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onBrightnessChange={controlsEnabled && onLightBrightnessChange ? (nextValue) => onLightBrightnessChange(widget, nextValue) : undefined}
        onColorChange={controlsEnabled && onLightColorChange ? (nextHs) => onLightColorChange(widget, nextHs) : undefined}
        liveLightState={liveEntity}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'switch') {
    return (
      <SwitchCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onToggleSwitch={controlsEnabled && onSwitchToggle ? () => onSwitchToggle(widget) : undefined}
        liveEntity={liveEntity}
        consumptionEntity={switchConsumptionEntity}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'fan') {
    return (
      <FanCard
        widget={widget}
        entity={liveEntity}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onOpen={onClick}
        onPowerToggle={controlsEnabled && onFanToggle ? () => onFanToggle(widget) : undefined}
        onPercentageChange={controlsEnabled && onFanPercentageChange ? (percentage) => onFanPercentageChange(widget, percentage) : undefined}
        onPresetChange={controlsEnabled && onFanPresetChange ? (mode) => onFanPresetChange(widget, mode) : undefined}
        onOscillationChange={controlsEnabled && onFanOscillationChange ? (oscillating) => onFanOscillationChange(widget, oscillating) : undefined}
        onDirectionChange={controlsEnabled && onFanDirectionChange ? (direction) => onFanDirectionChange(widget, direction) : undefined}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'humidifier') {
    return (
      <HumidifierCard
        widget={widget}
        entity={liveEntity}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onOpen={onClick}
        onPowerToggle={controlsEnabled && onHumidifierToggle ? () => onHumidifierToggle(widget) : undefined}
        onTargetHumidityChange={controlsEnabled && onHumidifierTargetHumidityChange ? (humidity) => onHumidifierTargetHumidityChange(widget, humidity) : undefined}
        onModeChange={controlsEnabled && onHumidifierModeChange ? (mode) => onHumidifierModeChange(widget, mode) : undefined}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'camera') {
    return (
      <CameraCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        liveEntity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'media') {
    return (
      <MediaCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onTogglePlayback={controlsEnabled && onMediaToggle ? () => onMediaToggle(widget) : undefined}
        onPreviousTrack={controlsEnabled && onMediaPrevious ? () => onMediaPrevious(widget) : undefined}
        onNextTrack={controlsEnabled && onMediaNext ? () => onMediaNext(widget) : undefined}
        onSeek={controlsEnabled && onMediaSeek ? (position) => onMediaSeek(widget, position) : undefined}
        onShuffle={controlsEnabled && onMediaShuffle ? () => onMediaShuffle(widget) : undefined}
        onRepeat={controlsEnabled && onMediaRepeat ? () => onMediaRepeat(widget) : undefined}
        onSelectSource={controlsEnabled && onMediaSelectSource ? (source) => onMediaSelectSource(widget, source) : undefined}
        hideHeader={mediaHideHeader}
        liveEntity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'alarm') {
    return (
      <AlarmCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onQuickDisarm={controlsEnabled && onAlarmDisarm ? () => onAlarmDisarm(widget) : undefined}
        onQuickArm={controlsEnabled && onAlarmArm ? (mode) => onAlarmArm(widget, mode) : undefined}
        liveEntity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'vacuum') {
    return (
      <VacuumCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onStartPause={controlsEnabled && onVacuumStartPause ? () => onVacuumStartPause(widget) : undefined}
        onStop={controlsEnabled && onVacuumStop ? () => onVacuumStop(widget) : undefined}
        onReturnToBase={controlsEnabled && onVacuumReturnToBase ? () => onVacuumReturnToBase(widget) : undefined}
        liveEntity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'lock') {
    return (
      <LockCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onToggleLock={controlsEnabled && onLockToggle ? () => onLockToggle(widget) : undefined}
        onOpenDoor={controlsEnabled && onLockOpen ? () => onLockOpen(widget) : undefined}
        liveEntity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />
    );
  }

  if (widget.kind === 'cover') {
    return (
      <CoverCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        liveEntity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        onDisplayMetricsChange={onDisplayMetricsChange}
        onPositionChange={controlsEnabled && onCoverPositionChange ? (position) => onCoverPositionChange(widget, position) : undefined}
        onTiltPositionChange={controlsEnabled && onCoverTiltPositionChange ? (position) => onCoverTiltPositionChange(widget, position) : undefined}
        onOpenCover={controlsEnabled && onCoverOpen ? () => onCoverOpen(widget) : undefined}
        onStopCover={controlsEnabled && onCoverStop ? () => onCoverStop(widget) : undefined}
        onCloseCover={controlsEnabled && onCoverClose ? () => onCoverClose(widget) : undefined}
      />
    );
  }

  if (widget.kind === 'members') {
    return (
      <MembersCard
        widget={widget}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
        onOpenMembersPanel={controlsEnabled && onMembersOpenPanel ? () => onMembersOpenPanel(widget) : undefined}
        houseMembers={houseMembers}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
      />
    );
  }

  if (widget.kind === 'calendar') {
    return (
      <CalendarCard
        widget={widget}
        entity={liveEntity}
        gridBreakpoint={gridBreakpoint}
        displayVariant={displayVariant}
        isSelected={isSelected}
        isEditMode={isEditMode}
        onClick={onClick}
      />
    );
  }

  return (
    <SensorCard
      widget={widget}
      isSelected={isSelected}
      value={value}
      sensorHistory={sensorHistory}
      batteryEntity={sensorBatteryEntity}
      isEditMode={isEditMode}
      onClick={onClick}
      liveEntity={liveEntity}
      onDisplayMetricsChange={onDisplayMetricsChange}
    />
  );
}

function areWidgetEntitiesEqual(prevEntity: MockEntityState | undefined, nextEntity: MockEntityState | undefined) {
  if (prevEntity === nextEntity) {
    return true;
  }
  if (!prevEntity || !nextEntity) {
    return !prevEntity && !nextEntity;
  }
  return (
    prevEntity.state === nextEntity.state &&
    prevEntity.stateLabel === nextEntity.stateLabel &&
    prevEntity.secondary === nextEntity.secondary &&
    prevEntity.numericValue === nextEntity.numericValue &&
    prevEntity.targetValue === nextEntity.targetValue &&
    prevEntity.currentValue === nextEntity.currentValue &&
    prevEntity.brightness === nextEntity.brightness &&
    prevEntity.toggleOn === nextEntity.toggleOn &&
    prevEntity.progress === nextEntity.progress &&
    prevEntity.mediaPosition === nextEntity.mediaPosition &&
    prevEntity.mediaPositionUpdatedAt === nextEntity.mediaPositionUpdatedAt &&
    prevEntity.mediaTitle === nextEntity.mediaTitle &&
    prevEntity.mediaArtist === nextEntity.mediaArtist &&
    prevEntity.mediaAlbumName === nextEntity.mediaAlbumName &&
    prevEntity.mediaAlbumArtist === nextEntity.mediaAlbumArtist &&
    prevEntity.mediaChannel === nextEntity.mediaChannel &&
    prevEntity.mediaContentId === nextEntity.mediaContentId &&
    prevEntity.mediaContentType === nextEntity.mediaContentType &&
    prevEntity.mediaEpisode === nextEntity.mediaEpisode &&
    prevEntity.mediaPlaylist === nextEntity.mediaPlaylist &&
    prevEntity.mediaSeason === nextEntity.mediaSeason &&
    prevEntity.mediaSeriesTitle === nextEntity.mediaSeriesTitle &&
    prevEntity.mediaTrack === nextEntity.mediaTrack &&
    prevEntity.appId === nextEntity.appId &&
    prevEntity.appName === nextEntity.appName &&
    prevEntity.source === nextEntity.source &&
    prevEntity.sourceList === nextEntity.sourceList &&
    prevEntity.soundMode === nextEntity.soundMode &&
    prevEntity.soundModeList === nextEntity.soundModeList &&
    prevEntity.groupMembers === nextEntity.groupMembers &&
    prevEntity.mediaDeviceClass === nextEntity.mediaDeviceClass &&
    prevEntity.volumeLevel === nextEntity.volumeLevel &&
    prevEntity.mediaMuted === nextEntity.mediaMuted &&
    prevEntity.volumeStep === nextEntity.volumeStep &&
    prevEntity.hvacMode === nextEntity.hvacMode &&
    prevEntity.fanMode === nextEntity.fanMode &&
    prevEntity.presetMode === nextEntity.presetMode &&
    prevEntity.swingMode === nextEntity.swingMode &&
    prevEntity.swingHorizontalMode === nextEntity.swingHorizontalMode &&
    prevEntity.rawAttributes === nextEntity.rawAttributes
  );
}

function areWidgetCardRendererPropsEqual(prevProps: WidgetCardRendererProps, nextProps: WidgetCardRendererProps) {
  if (prevProps.widget !== nextProps.widget) {
    return false;
  }
  if (prevProps.isEditMode !== nextProps.isEditMode) {
    return false;
  }
  if (prevProps.isSelected !== nextProps.isSelected) {
    return false;
  }
  if (prevProps.gridBreakpoint !== nextProps.gridBreakpoint) {
    return false;
  }
  if (prevProps.onDisplayMetricsChange !== nextProps.onDisplayMetricsChange) {
    return false;
  }
  if (prevProps.onLightColorChange !== nextProps.onLightColorChange) {
    return false;
  }
  if (prevProps.onFanToggle !== nextProps.onFanToggle ||
      prevProps.onFanPercentageChange !== nextProps.onFanPercentageChange ||
      prevProps.onFanPresetChange !== nextProps.onFanPresetChange ||
      prevProps.onFanOscillationChange !== nextProps.onFanOscillationChange ||
      prevProps.onFanDirectionChange !== nextProps.onFanDirectionChange) {
    return false;
  }
  if (prevProps.onHumidifierToggle !== nextProps.onHumidifierToggle ||
      prevProps.onHumidifierTargetHumidityChange !== nextProps.onHumidifierTargetHumidityChange ||
      prevProps.onHumidifierModeChange !== nextProps.onHumidifierModeChange) {
    return false;
  }
  if (prevProps.onCoverPositionChange !== nextProps.onCoverPositionChange) {
    return false;
  }
  if (prevProps.onCoverTiltPositionChange !== nextProps.onCoverTiltPositionChange) {
    return false;
  }
  if (prevProps.onCoverOpen !== nextProps.onCoverOpen) {
    return false;
  }
  if (prevProps.onCoverStop !== nextProps.onCoverStop) {
    return false;
  }
  if (prevProps.onCoverClose !== nextProps.onCoverClose) {
    return false;
  }
  if (!areWidgetEntitiesEqual(prevProps.liveEntity, nextProps.liveEntity)) {
    return false;
  }

  const kind = nextProps.widget.kind;
  if ((kind === 'climate' || kind === 'light') && prevProps.dashboardState !== nextProps.dashboardState) {
    return false;
  }
  if (kind === 'sensor') {
    if (!areWidgetEntitiesEqual(prevProps.sensorBatteryEntity, nextProps.sensorBatteryEntity)) {
      return false;
    }
    if (prevProps.value !== nextProps.value) {
      return false;
    }
    if (prevProps.sensorHistory !== nextProps.sensorHistory) {
      return false;
    }
  }
  if (kind === 'switch' && !areWidgetEntitiesEqual(prevProps.switchConsumptionEntity, nextProps.switchConsumptionEntity)) {
    return false;
  }
  if (kind === 'members' && prevProps.houseMembers !== nextProps.houseMembers) {
    return false;
  }

  return true;
}

export const WidgetCardRenderer = React.memo(
  WidgetCardRendererComponent,
  areWidgetCardRendererPropsEqual,
);

type SectionCardRendererProps = {
  section: DashboardSection;
  state: DashboardStateShape;
  compact?: boolean;
  isEditMode?: boolean;
  onWeatherClick?: () => void;
  runningSceneId?: SceneKey | null;
  runningSceneStartedAt?: number | null;
  onAddScene?: (sceneId: SceneKey) => void;
  onSceneTrigger?: (sceneId: SceneKey) => void;
};

export function SectionCardRenderer({
  section,
  state,
  compact = false,
  isEditMode = false,
  onWeatherClick,
  runningSceneId,
  runningSceneStartedAt,
  onAddScene,
  onSceneTrigger,
}: SectionCardRendererProps) {
  if (section.kind === 'greeting') {
    const showWeather = section.showWeather ?? false;
    if (showWeather) {
      return (
        <GreetingWeatherCard
          state={state}
          title={section.title}
          subtitle={section.subtitle}
          titleAuto={section.titleAuto}
          subtitleAuto={section.subtitleAuto}
          compact={compact}
          isEditMode={isEditMode}
          onWeatherClick={onWeatherClick}
          weatherLayout={section.weatherLayout}
          weatherUnit={section.weatherUnit}
          weatherForecastType={section.weatherForecastType}
          weatherForecastDays={section.weatherForecastDays}
          weatherForecastDensity={section.weatherForecastDensity}
          weatherSecondaryInfo={section.weatherSecondaryInfo}
          weatherShowCondition={section.weatherShowCondition}
          weatherShowPrecipitation={section.weatherShowPrecipitation}
          weatherShowWind={section.weatherShowWind}
          weatherConditionOverride={section.weatherCondition}
        />
      );
    }
    return (
      <GreetingCard
        state={state}
        title={section.title}
        subtitle={section.subtitle}
        titleAuto={section.titleAuto}
        subtitleAuto={section.subtitleAuto}
        compact={compact}
      />
    );
  }

  if (section.kind === 'weather') {
    const compactHint = section.layout.h <= ROOT_CANVAS_ROW_UNITS || section.layout.w <= 2;
    const denseHint = compact || section.layout.h <= ROOT_CANVAS_ROW_UNITS * 2 || section.layout.w <= 3;
    return (
      <WeatherCard
        weather={state.weather}
        compactHint={compactHint}
        denseHint={denseHint}
        layout={section.weatherLayout}
        unit={section.weatherUnit}
        forecastType={section.weatherForecastType}
        forecastDays={section.weatherForecastDays}
        forecastDensity={section.weatherForecastDensity}
        secondaryInfo={section.weatherSecondaryInfo}
      />
    );
  }

  return (
    <ScenesCard
      title={section.title ?? 'Scenari'}
      scenes={section.scenes ?? SCENES_CATALOG.slice(0, 4).map((scene) => scene.id)}
      sceneLabels={section.sceneLabels}
      sceneIcons={section.sceneIcons}
      compact={compact}
      isEditMode={isEditMode}
      runningSceneId={runningSceneId}
      runningSceneStartedAt={runningSceneStartedAt}
      onAddScene={onAddScene}
      onSceneTrigger={onSceneTrigger}
    />
  );
}
