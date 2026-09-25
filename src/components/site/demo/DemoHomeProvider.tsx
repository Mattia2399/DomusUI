import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import poolImage from '../../../assets/pool-spa-preview.jpg';
import { useDashboardState, type DashboardStateShape } from '../../../hooks/useDashboardState';
import type { MockEntityState } from '../../../types/ha';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import { MEDIA_ARTWORK, MEDIA_DURATION_SECONDS, STATIC_ENTITIES, type DemoCardId } from './fixtures';

/**
 * One simulated home shared by every section of the site.
 *
 * Toggling the lamp in the "Live" scene is reflected by the same card in the
 * hero or in the layout morph: the page behaves like one continuous home
 * rather than a set of disconnected demos. Nothing here talks to Home
 * Assistant — it is local React state only.
 */

export type AlarmState = 'disarmed' | 'armed_home' | 'armed_away' | 'armed_night' | 'armed_vacation';

type DemoHomeState = {
  lampOn: boolean;
  lampBrightness: number;
  lampHs: [number, number];
  coverPosition: number;
  alarm: AlarmState;
  locked: boolean;
  mediaPlaying: boolean;
  mediaProgress: number;
  switchOn: boolean;
  climateOn: boolean;
  climateTarget: number;
  climateMode: string;
  climateFanMode: string;
};

type DemoHomeActions = {
  toggleLamp: () => void;
  setLampBrightness: (value: number) => void;
  setLampHs: (hs: [number, number]) => void;
  setCoverPosition: (value: number) => void;
  setAlarm: (value: AlarmState) => void;
  toggleLock: () => void;
  toggleMedia: () => void;
  seekMedia: (seconds: number) => void;
  toggleSwitch: () => void;
  toggleClimate: () => void;
  setClimateTarget: (value: number) => void;
  setClimateMode: (mode: string) => void;
  setClimateFanMode: (mode: string) => void;
};

type DemoHomeContextValue = {
  home: DemoHomeState;
  actions: DemoHomeActions;
  entities: Partial<Record<DemoCardId, MockEntityState>>;
  switchConsumption: MockEntityState;
  dashboardState: DashboardStateShape;
};

const DemoHomeContext = createContext<DemoHomeContextValue | null>(null);

const INITIAL_STATE: DemoHomeState = {
  lampOn: true,
  lampBrightness: 72,
  lampHs: [34, 78],
  coverPosition: 64,
  alarm: 'armed_home',
  locked: true,
  mediaPlaying: true,
  mediaProgress: 38,
  switchOn: true,
  climateOn: true,
  climateTarget: 22.5,
  climateMode: 'heat',
  climateFanMode: 'auto',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function DemoHomeProvider({ children }: { children: ReactNode }) {
  // The production mock state is still needed by cards that read global data.
  const { state: dashboardState } = useDashboardState();
  const { demo } = useSiteCopy();
  const [home, setHome] = useState<DemoHomeState>(INITIAL_STATE);

  const actions = useMemo<DemoHomeActions>(() => {
    const patch = (next: Partial<DemoHomeState> | ((current: DemoHomeState) => Partial<DemoHomeState>)) =>
      setHome((current) => ({ ...current, ...(typeof next === 'function' ? next(current) : next) }));
    return {
      toggleLamp: () => patch((c) => ({ lampOn: !c.lampOn })),
      setLampBrightness: (value) => patch({ lampBrightness: clamp(Math.round(value), 0, 100), lampOn: value > 0 }),
      setLampHs: (hs) => patch({ lampHs: hs, lampOn: true }),
      setCoverPosition: (value) => patch({ coverPosition: clamp(Math.round(value), 0, 100) }),
      setAlarm: (value) => patch({ alarm: value }),
      toggleLock: () => patch((c) => ({ locked: !c.locked })),
      toggleMedia: () => patch((c) => ({ mediaPlaying: !c.mediaPlaying })),
      seekMedia: (seconds) =>
        patch({ mediaProgress: clamp(Math.round((seconds / MEDIA_DURATION_SECONDS) * 100), 0, 100) }),
      toggleSwitch: () => patch((c) => ({ switchOn: !c.switchOn })),
      toggleClimate: () => patch((c) => ({ climateOn: !c.climateOn })),
      setClimateTarget: (value) => patch({ climateTarget: clamp(value, 16, 30), climateOn: true }),
      setClimateMode: (mode) => patch({ climateMode: mode, climateOn: mode !== 'off' }),
      setClimateFanMode: (mode) => patch({ climateFanMode: mode }),
    };
  }, []);

  const value = useMemo<DemoHomeContextValue>(() => {
    const brightness255 = Math.round((home.lampBrightness / 100) * 255);
    const climateMode = home.climateOn ? home.climateMode : 'off';
    const climateAction = !home.climateOn ? 'off' : climateMode === 'cool' ? 'cooling' : 'heating';
    const switchWatts = home.switchOn ? 128 : 0;
    const climateLabel = demo.climateModes[climateMode as keyof typeof demo.climateModes] ?? demo.climateModes.auto;

    const entities: Partial<Record<DemoCardId, MockEntityState>> = {
      light: {
        state: home.lampOn ? 'on' : 'off',
        toggleOn: home.lampOn,
        brightness: brightness255,
        hsColor: home.lampHs,
        colorTempKelvin: 3000,
        supportedColorModes: ['brightness', 'hs', 'color_temp'],
        rawAttributes: {
          friendly_name: demo.titles.light,
          supported_color_modes: ['brightness', 'hs', 'color_temp'],
          color_mode: 'hs',
          brightness: brightness255,
          hs_color: home.lampHs,
          color_temp_kelvin: 3000,
        },
      },
      climate: {
        state: climateMode,
        stateLabel: climateLabel,
        currentValue: 21.5,
        targetValue: home.climateTarget,
        hvacMode: climateMode,
        hvacAction: climateAction,
        hvacModes: ['off', 'heat', 'cool', 'auto', 'dry'],
        fanMode: home.climateFanMode,
        fanModes: ['auto', '1', '2', '3'],
        currentHumidity: 48,
        targetHumidity: 45,
        minTemp: 16,
        maxTemp: 30,
        targetTempStep: 0.5,
        supportedFeatures: 1023,
        rawAttributes: {
          friendly_name: demo.titles.climate,
          hvac_mode: climateMode,
          hvac_action: climateAction,
          hvac_modes: ['off', 'heat', 'cool', 'auto', 'dry'],
          fan_mode: home.climateFanMode,
          fan_modes: ['auto', '1', '2', '3'],
          current_temperature: 21.5,
          temperature: home.climateTarget,
          target_temp_step: 0.5,
          min_temp: 16,
          max_temp: 30,
          temperature_unit: '°C',
          current_humidity: 48,
          humidity: 45,
          supported_features: 1023,
        },
      },
      alarm: {
        state: home.alarm,
        supportedFeatures: 63,
        rawAttributes: { friendly_name: demo.titles.alarm, code_arm_required: false },
      },
      lock: {
        state: home.locked ? 'locked' : 'unlocked',
        supportedFeatures: 1,
        rawAttributes: { friendly_name: demo.titles.lock, battery_level: 84 },
      },
      switch: {
        state: home.switchOn ? 'on' : 'off',
        toggleOn: home.switchOn,
        rawAttributes: { device_class: 'outlet', friendly_name: demo.titles.switch },
      },
      camera: {
        state: 'streaming',
        imageUrl: poolImage,
        rawAttributes: { friendly_name: demo.titles.camera, entity_picture: poolImage },
      },
      media: {
        state: home.mediaPlaying ? 'playing' : 'paused',
        progress: home.mediaProgress,
        mediaTitle: 'Blue Hour',
        mediaArtist: demo.mediaArtist,
        mediaDuration: MEDIA_DURATION_SECONDS,
        mediaPosition: Math.round((home.mediaProgress / 100) * MEDIA_DURATION_SECONDS),
        mediaPositionUpdatedAt: 0,
        imageUrl: MEDIA_ARTWORK,
      },
      cover: {
        state: home.coverPosition <= 0 ? 'closed' : 'open',
        supportedFeatures: 15,
        rawAttributes: {
          friendly_name: demo.titles.cover,
          current_position: home.coverPosition,
          supported_features: 15,
        },
      },
      sensor: STATIC_ENTITIES.sensor,
      vacuum: { ...STATIC_ENTITIES.vacuum, stateLabel: demo.vacuumDocked },
    };

    return {
      home,
      actions,
      entities,
      switchConsumption: { state: String(switchWatts), numericValue: switchWatts, unit: 'W' },
      dashboardState,
    };
  }, [home, actions, dashboardState, demo]);

  return <DemoHomeContext.Provider value={value}>{children}</DemoHomeContext.Provider>;
}

export function useDemoHome() {
  const context = useContext(DemoHomeContext);
  if (!context) {
    throw new Error('useDemoHome must be used inside <DemoHomeProvider>.');
  }
  return context;
}
