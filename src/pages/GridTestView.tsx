import { useEffect, useMemo, useRef, useState } from 'react';
import { SectionCardRenderer, WidgetCardRenderer } from '../components/widgets/CardRenderer';
import type { DashboardSection, SceneKey, Widget } from '../types/dashboardModels';
import { DashboardGrid } from '../components/dashboard/DashboardGrid';
import { DummyCard } from '../components/dashboard/DummyCard';
import { WidgetWrapper } from '../components/dashboard/WidgetWrapper';
import type { MockEntityStateMap } from '../types/ha';
import { useDashboardState } from '../hooks/useDashboardState';
import { SensorCard } from '../components/widgets/SensorCard';
import { GridEngineLab } from '../components/dashboard/gridEngine2/GridEngineLab';
import { ShadowInspector } from '../components/dashboard/gridEngine2/ShadowInspector';

type DummyWidget = {
  id: string;
  title: string;
  width: number;
  height: number;
  color: string;
};

type WidgetTestItem = {
  id: string;
  width: number;
  height: number;
  widget: Widget;
};

type SectionTestItem = {
  id: string;
  width: number;
  height: number;
  section: DashboardSection;
};

const MEDIA_DURATION_SECONDS = 4200;
const SENSOR_LAB_SIZES = [
  { id: 'mini', label: 'Mini · 104×48', width: 104, height: 48, gridW: 1, gridH: 1 },
  { id: 'compact', label: 'Compact · 104×112', width: 104, height: 112, gridW: 1, gridH: 2 },
  { id: 'standard', label: 'Standard · 192×112', width: 192, height: 112, gridW: 2, gridH: 2 },
  { id: 'full-wide', label: 'Full wide · 296×112', width: 296, height: 112, gridW: 3, gridH: 2 },
  { id: 'full-tall', label: 'Full tall · 192×176', width: 192, height: 176, gridW: 2, gridH: 3 },
] as const;

const DUMMY_WIDGETS: DummyWidget[] = [
  { id: 'compact-sensor-1', title: 'Sensore Ingresso 1x1', width: 1, height: 1, color: 'bg-cyan-500/20' },
  { id: 'compact-sensor-2', title: 'Sensore Cucina 1x1', width: 1, height: 1, color: 'bg-teal-500/20' },
  { id: 'light-base-1', title: 'Luci Zona Giorno 2x1', width: 2, height: 1, color: 'bg-amber-500/20' },
  { id: 'light-base-2', title: 'Luci Notturne 2x1', width: 2, height: 1, color: 'bg-yellow-500/20' },
  { id: 'climate-compact', title: 'Clima Compatto 2x2', width: 2, height: 2, color: 'bg-blue-500/20' },
  { id: 'shutters-compact', title: 'Tapparelle Compatte 2x2', width: 2, height: 2, color: 'bg-violet-500/20' },
  { id: 'scene-header', title: 'Scene Rapide 4x2', width: 4, height: 2, color: 'bg-pink-500/20' },
  { id: 'status-header', title: 'Testata Stato Casa 4x2', width: 4, height: 2, color: 'bg-indigo-500/20' },
  { id: 'camera-extended', title: 'Telecamera Estesa 4x4', width: 4, height: 4, color: 'bg-emerald-500/20' },
  { id: 'climate-extended', title: 'Clima Esteso 4x4', width: 4, height: 4, color: 'bg-rose-500/20' },
];

function buildTestWidget(config: {
  id: string;
  kind: Widget['kind'];
  title: string;
  entityId: string;
  width: number;
  height: number;
  status: string;
  isOn: boolean;
  value?: number;
  unit?: string;
}): Widget {
  const { id, kind, title, entityId, width, height, status, isOn, value, unit } = config;

  return {
    id,
    kind,
    title,
    entityId,
    status,
    isOn,
    value,
    unit,
    layout: {
      i: id,
      x: 0,
      y: 0,
      w: width,
      h: height,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function GridTestView() {
  const { state: dashboardState, actions } = useDashboardState();
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [runningSceneId, setRunningSceneId] = useState<SceneKey | null>(null);
  const [runningSceneStartedAt, setRunningSceneStartedAt] = useState<number | null>(null);
  const sceneTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (sceneTimeoutRef.current !== null) {
        window.clearTimeout(sceneTimeoutRef.current);
      }
    };
  }, []);

  const liveEntities = useMemo<MockEntityStateMap>(() => {
    const climateMode = dashboardState.climate.mode.trim().toLowerCase();
    const safeClimateMode = climateMode.length > 0 ? climateMode : 'auto';
    const mediaPosition = Math.round((dashboardState.speaker.progress / 100) * MEDIA_DURATION_SECONDS);

    return {
      'light.living_room_lamp': {
        state: dashboardState.lamp.isOn ? 'on' : 'off',
        stateLabel: dashboardState.lamp.status,
        brightness: dashboardState.lamp.brightness,
        supportedFeatures: 191,
        colorMode: 'hs',
        supportedColorModes: ['brightness', 'color_temp', 'hs', 'rgb', 'xy', 'rgbw', 'rgbww', 'white'],
        hsColor: dashboardState.lamp.hsColor,
        rgbColor: [82, 125, 255],
        rgbwColor: [82, 125, 255, 32],
        rgbwwColor: [82, 125, 255, 16, 42],
        xyColor: [0.18, 0.15],
        colorTempKelvin: dashboardState.lamp.colorTemp,
        minColorTempKelvin: 2000,
        maxColorTempKelvin: 6500,
        effect: 'off',
        effectList: ['off', 'colorloop', 'pulse', 'rainbow'],
        rawAttributes: {
          friendly_name: dashboardState.lamp.name,
          brightness: Math.round((dashboardState.lamp.brightness / 100) * 255),
          supported_features: 191,
          color_mode: 'hs',
          supported_color_modes: ['brightness', 'color_temp', 'hs', 'rgb', 'xy', 'rgbw', 'rgbww', 'white'],
          hs_color: dashboardState.lamp.hsColor,
          rgb_color: [82, 125, 255],
          rgbw_color: [82, 125, 255, 32],
          rgbww_color: [82, 125, 255, 16, 42],
          xy_color: [0.18, 0.15],
          color_temp_kelvin: dashboardState.lamp.colorTemp,
          min_color_temp_kelvin: 2000,
          max_color_temp_kelvin: 6500,
          effect: 'off',
          effect_list: ['off', 'colorloop', 'pulse', 'rainbow'],
        },
      },
      'climate.air_conditioner': {
        state: dashboardState.climate.isOn ? safeClimateMode : 'off',
        stateLabel: dashboardState.climate.status,
        currentValue: dashboardState.climate.currentTemp,
        targetValue: dashboardState.climate.targetTemp,
        targetTempLow: dashboardState.climate.targetTempLow,
        targetTempHigh: dashboardState.climate.targetTempHigh,
        minTemp: dashboardState.climate.minTemp,
        maxTemp: dashboardState.climate.maxTemp,
        targetTempStep: dashboardState.climate.targetTempStep,
        supportedFeatures: dashboardState.climate.supportedFeatures,
        hvacMode: safeClimateMode,
        hvacAction: dashboardState.climate.hvacAction,
        fanMode: dashboardState.climate.fanMode,
        fanModes: dashboardState.climate.fanModes,
        currentHumidity: dashboardState.climate.currentHumidity,
        targetHumidity: dashboardState.climate.targetHumidity,
        minHumidity: dashboardState.climate.minHumidity,
        maxHumidity: dashboardState.climate.maxHumidity,
        targetHumidityStep: dashboardState.climate.targetHumidityStep,
        presetMode: dashboardState.climate.presetMode,
        presetModes: dashboardState.climate.presetModes,
        swingMode: dashboardState.climate.swingMode,
        swingModes: dashboardState.climate.swingModes,
        swingHorizontalMode: dashboardState.climate.swingHorizontalMode,
        swingHorizontalModes: dashboardState.climate.swingHorizontalModes,
        unit: dashboardState.climate.temperatureUnit ?? 'C',
        rawAttributes: {
          friendly_name: dashboardState.climate.name,
          hvac_mode: safeClimateMode,
          hvac_action: dashboardState.climate.hvacAction,
          supported_features: dashboardState.climate.supportedFeatures,
          current_temperature: dashboardState.climate.currentTemp,
          temperature: dashboardState.climate.targetTemp,
          target_temp_low: dashboardState.climate.targetTempLow,
          target_temp_high: dashboardState.climate.targetTempHigh,
          min_temp: dashboardState.climate.minTemp,
          max_temp: dashboardState.climate.maxTemp,
          target_temp_step: dashboardState.climate.targetTempStep,
          temperature_unit: dashboardState.climate.temperatureUnit ?? 'C',
          fan_mode: dashboardState.climate.fanMode,
          fan_modes: dashboardState.climate.fanModes ?? [],
          hvac_modes: dashboardState.climate.hvacModes ?? [],
          current_humidity: dashboardState.climate.currentHumidity,
          humidity: dashboardState.climate.targetHumidity,
          min_humidity: dashboardState.climate.minHumidity,
          max_humidity: dashboardState.climate.maxHumidity,
          target_humidity_step: dashboardState.climate.targetHumidityStep,
          preset_mode: dashboardState.climate.presetMode,
          preset_modes: dashboardState.climate.presetModes ?? [],
          swing_mode: dashboardState.climate.swingMode,
          swing_modes: dashboardState.climate.swingModes ?? [],
          swing_horizontal_mode: dashboardState.climate.swingHorizontalMode,
          swing_horizontal_modes: dashboardState.climate.swingHorizontalModes ?? [],
        },
      },
      'media_player.living_room_tv': {
        state: dashboardState.speaker.isPlaying ? 'playing' : 'paused',
        stateLabel: dashboardState.speaker.status,
        progress: dashboardState.speaker.progress,
        mediaTitle: 'Lo-fi Focus Session',
        mediaArtist: 'Dashboard Studio',
        mediaDuration: MEDIA_DURATION_SECONDS,
        mediaPosition: mediaPosition,
        mediaPositionUpdatedAt: Date.now(),
        imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&q=80&fit=crop',
      },
      'camera.front_door': {
        state: 'streaming',
        stateLabel: 'Online',
        imageUrl: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=1200&q=80&fit=crop',
        rawAttributes: {
          friendly_name: 'Front Door Cam',
          entity_picture: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=1200&q=80&fit=crop',
        },
      },
      'sensor.living_room_humidity': {
        state: String(Math.round(dashboardState.weather.humidity)),
        stateLabel: 'Tracking',
        numericValue: dashboardState.weather.humidity,
        unit: '%',
      },
    };
  }, [dashboardState]);

  const widgetItems = useMemo<WidgetTestItem[]>(
    () => [
      {
        id: 'real-sensor-1x1',
        width: 1,
        height: 1,
        widget: buildTestWidget({
          id: 'sensor.living_room_humidity',
          kind: 'sensor',
          title: 'Umidita Soggiorno 1x1',
          entityId: 'sensor.living_room_humidity',
          width: 1,
          height: 1,
          status: 'Tracking',
          isOn: true,
          value: Math.round(dashboardState.weather.humidity),
          unit: '%',
        }),
      },
      {
        id: 'real-light-2x1',
        width: 2,
        height: 1,
        widget: buildTestWidget({
          id: 'light.living_room_lamp',
          kind: 'light',
          title: 'Luci Base 2x1',
          entityId: 'light.living_room_lamp',
          width: 2,
          height: 1,
          status: dashboardState.lamp.status,
          isOn: dashboardState.lamp.isOn,
          value: dashboardState.lamp.brightness,
          unit: '%',
        }),
      },
      {
        id: 'real-climate-2x2',
        width: 2,
        height: 2,
        widget: buildTestWidget({
          id: 'climate.air_conditioner',
          kind: 'climate',
          title: 'Clima Compatto 2x2',
          entityId: 'climate.air_conditioner',
          width: 2,
          height: 2,
          status: dashboardState.climate.status,
          isOn: dashboardState.climate.isOn,
          value: dashboardState.climate.targetTemp,
          unit: dashboardState.climate.temperatureUnit ?? 'C',
        }),
      },
      {
        id: 'real-media-4x2',
        width: 4,
        height: 2,
        widget: buildTestWidget({
          id: 'media_player.living_room_tv',
          kind: 'media',
          title: 'Media Living 4x2',
          entityId: 'media_player.living_room_tv',
          width: 4,
          height: 2,
          status: dashboardState.speaker.status,
          isOn: dashboardState.speaker.isPlaying,
          value: dashboardState.speaker.progress,
          unit: '%',
        }),
      },
      {
        id: 'real-camera-4x4',
        width: 4,
        height: 4,
        widget: buildTestWidget({
          id: 'camera.front_door',
          kind: 'camera',
          title: 'Telecamera Estesa 4x4',
          entityId: 'camera.front_door',
          width: 4,
          height: 4,
          status: 'Online',
          isOn: true,
        }),
      },
    ],
    [dashboardState],
  );

  const sectionItems = useMemo<SectionTestItem[]>(
    () => [
      {
        id: 'section-scenes-4x2',
        width: 4,
        height: 2,
        section: {
          id: 'section-scenes-grid-test',
          kind: 'scenes',
          title: 'Scene Rapide 4x2',
          scenes: ['music', 'night', 'arrive', 'morning'],
          layout: { i: 'section-scenes-grid-test', x: 0, y: 0, w: 4, h: 2 },
        },
      },
      {
        id: 'section-weather-4x4',
        width: 4,
        height: 4,
        section: {
          id: 'section-weather-grid-test',
          kind: 'weather',
          weatherLayout: 'card',
          weatherForecastDays: 5,
          weatherForecastType: 'daily',
          weatherForecastDensity: 'comfortable',
          weatherSecondaryInfo: 'auto',
          layout: { i: 'section-weather-grid-test', x: 0, y: 0, w: 4, h: 4 },
        },
      },
    ],
    [],
  );

  const handleSceneTrigger = (sceneId: SceneKey) => {
    setRunningSceneId(sceneId);
    setRunningSceneStartedAt(Date.now());
    if (sceneTimeoutRef.current !== null) {
      window.clearTimeout(sceneTimeoutRef.current);
    }
    sceneTimeoutRef.current = window.setTimeout(() => {
      setRunningSceneId((current) => (current === sceneId ? null : current));
      setRunningSceneStartedAt(null);
      sceneTimeoutRef.current = null;
    }, 2800);
  };

  const handleWidgetCardClick = (widget: Widget) => {
    setSelectedWidgetId(widget.id);
    if (widget.kind === 'light') {
      actions.toggleLamp();
      return;
    }
    if (widget.kind === 'climate') {
      actions.toggleClimatePower();
      return;
    }
    if (widget.kind === 'media') {
      actions.toggleSpeakerPlayback();
    }
  };

  return (
    <main className="apple-bg-main min-h-screen w-full">
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-4 py-6 sm:px-6 lg:px-10">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Grid Engine Test</p>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">Unita di Griglia Rigide</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Resize della finestra per validare l incastro: 4 colonne su mobile, 8 su tablet, 12 su desktop.
          </p>
        </div>

        <GridEngineLab />

        <ShadowInspector />

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-white/70">Sensor Card Lab</h2>
            <p className="mt-1 text-xs text-white/50">Stesso modello dati, cinque contenitori reali.</p>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            {SENSOR_LAB_SIZES.map((item) => {
              const sensorWidget = buildTestWidget({
                id: `sensor-lab-${item.id}`,
                kind: 'sensor',
                title: 'Umidità soggiorno',
                entityId: 'sensor.living_room_humidity',
                width: item.gridW,
                height: item.gridH,
                status: 'Tracking',
                isOn: true,
                value: 58,
                unit: '%',
              });
              return (
                <div key={item.id} className="space-y-2">
                  <div style={{ width: item.width, height: item.height }}>
                    <SensorCard
                      widget={sensorWidget}
                      isSelected={false}
                      value={58}
                      sensorHistory={[42, 46, 45, 51, 49, 54, 56, 58]}
                      liveEntity={{
                        state: '58',
                        numericValue: 58,
                        unit: '%',
                        rawAttributes: { device_class: 'humidity' },
                      }}
                      isEditMode={false}
                      onClick={() => undefined}
                    />
                  </div>
                  <p className="text-[11px] text-white/48">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-white/70">Dummy Layout Test</h2>
          <DashboardGrid rowUnit={96}>
            {DUMMY_WIDGETS.map((widget) => (
              <WidgetWrapper key={widget.id} width={widget.width} height={widget.height}>
                <DummyCard title={widget.title} color={widget.color} />
              </WidgetWrapper>
            ))}
          </DashboardGrid>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-white/70">Real Cards Test</h2>
          <DashboardGrid rowUnit={96}>
            {widgetItems.map((item) => (
              <WidgetWrapper key={item.id} width={item.width} height={item.height}>
                <WidgetCardRenderer
                  widget={item.widget}
                  dashboardState={dashboardState}
                  isEditMode={false}
                  isSelected={selectedWidgetId === item.widget.id}
                  value={item.widget.value}
                  onClick={() => handleWidgetCardClick(item.widget)}
                  liveEntity={liveEntities[item.widget.entityId]}
                  switchConsumptionEntity={
                    item.widget.kind === 'switch' && item.widget.switchConsumptionEntityId
                      ? liveEntities[item.widget.switchConsumptionEntityId]
                      : undefined
                  }
                  onLightBrightnessChange={(_, value) => actions.setLampBrightness(value)}
                  onClimateTargetTempChange={(_, nextTemp) => actions.setClimateTarget(nextTemp)}
                  onClimateTargetRangeChange={(_, low, high) => actions.setClimateTargetRange(low, high)}
                  onClimateModeChange={(_, mode) => actions.setClimateMode(mode)}
                  onClimateFanModeChange={(_, mode) => actions.setClimateFanMode(mode)}
                  onMediaToggle={() => actions.toggleSpeakerPlayback()}
                  onMediaSeek={(_, position) => {
                    const nextProgress = clamp((position / MEDIA_DURATION_SECONDS) * 100, 0, 100);
                    actions.setSpeakerProgress(nextProgress);
                  }}
                />
              </WidgetWrapper>
            ))}

            {sectionItems.map((item) => (
              <WidgetWrapper key={item.id} width={item.width} height={item.height}>
                <SectionCardRenderer
                  section={item.section}
                  state={dashboardState}
                  compact={false}
                  isEditMode={false}
                  runningSceneId={runningSceneId}
                  runningSceneStartedAt={runningSceneStartedAt}
                  onSceneTrigger={handleSceneTrigger}
                  onAddScene={() => {}}
                />
              </WidgetWrapper>
            ))}
          </DashboardGrid>
        </div>
      </section>
    </main>
  );
}

export default GridTestView;
