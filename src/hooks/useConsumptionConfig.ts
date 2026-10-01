import { useEffect, useMemo, useState } from 'react';
import type { MockEntityStateMap } from '../types/ha';

const STORAGE_KEY = 'ha.dashboard.consumption.config.v1';

export type ConsumptionCardId = 'electricity' | 'water' | 'gas' | 'trend';

export type ConsumptionEntityConfig = {
  solarPowerEntityId: string;
  gridPowerEntityId: string;
  homePowerEntityId: string;
  solarMixEntityId: string;
  batteryPowerEntityId: string;
  batterySocEntityId: string;
  waterCurrentEntityId: string;
  waterGoalEntityId: string;
  waterRainRecoveryEntityId: string;
  gasTodayEntityId: string;
};

export type ConsumptionDashboardData = {
  solarPowerKw: number;
  gridPowerKw: number;
  homePowerKw: number;
  batterySocPct: number;
  batteryPowerKw: number;
  evSocPct: number;
  evPowerKw: number;
  solarMixPct: number;
  waterCurrentLiters: number;
  waterGoalLiters: number;
  waterRainRecoveryLitersPerMin: number;
  gasTodayCubicMeters: number;
  weeklyTrendPoints: number[];
};

const DEFAULT_CONSUMPTION_CONFIG: ConsumptionEntityConfig = {
  solarPowerEntityId: 'sensor.solar_power_kw',
  gridPowerEntityId: 'sensor.grid_power_kw',
  homePowerEntityId: 'sensor.home_power_kw',
  solarMixEntityId: 'sensor.solar_mix_percent',
  batteryPowerEntityId: 'sensor.battery_power_kw',
  batterySocEntityId: 'sensor.battery_soc',
  waterCurrentEntityId: 'sensor.water_today_liters',
  waterGoalEntityId: 'input_number.water_daily_goal_liters',
  waterRainRecoveryEntityId: 'sensor.water_rain_recovery_lpm',
  gasTodayEntityId: 'sensor.gas_today_m3',
};

const DEFAULT_DASHBOARD_DATA: ConsumptionDashboardData = {
  solarPowerKw: 5.0,
  gridPowerKw: 2.5,
  homePowerKw: 2.5,
  batterySocPct: 60,
  batteryPowerKw: 0.5,
  evSocPct: 45,
  evPowerKw: 0,
  solarMixPct: 70,
  waterCurrentLiters: 240,
  waterGoalLiters: 400,
  waterRainRecoveryLitersPerMin: 4.2,
  gasTodayCubicMeters: 1.2,
  weeklyTrendPoints: [46, 54, 48, 66, 60, 72, 68],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeConfigValue(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function resolveNumericValue(states: MockEntityStateMap, entityId: string, fallback: number) {
  const normalizedId = entityId.trim();
  if (!normalizedId) {
    return fallback;
  }

  const entity = states[normalizedId];
  if (!entity) {
    return fallback;
  }

  const directValue =
    toFiniteNumber(entity.numericValue) ??
    toFiniteNumber(entity.currentValue) ??
    toFiniteNumber(entity.targetValue) ??
    toFiniteNumber(entity.brightness);
  if (directValue !== undefined) {
    return directValue;
  }

  return toFiniteNumber(entity.state) ?? fallback;
}

function readStoredConfig() {
  if (typeof window === 'undefined') {
    return DEFAULT_CONSUMPTION_CONFIG;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_CONSUMPTION_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConsumptionEntityConfig>;
    return {
      solarPowerEntityId: normalizeConfigValue(parsed.solarPowerEntityId, DEFAULT_CONSUMPTION_CONFIG.solarPowerEntityId),
      gridPowerEntityId: normalizeConfigValue(parsed.gridPowerEntityId, DEFAULT_CONSUMPTION_CONFIG.gridPowerEntityId),
      homePowerEntityId: normalizeConfigValue(parsed.homePowerEntityId, DEFAULT_CONSUMPTION_CONFIG.homePowerEntityId),
      solarMixEntityId: normalizeConfigValue(parsed.solarMixEntityId, DEFAULT_CONSUMPTION_CONFIG.solarMixEntityId),
      batteryPowerEntityId: normalizeConfigValue(parsed.batteryPowerEntityId, DEFAULT_CONSUMPTION_CONFIG.batteryPowerEntityId),
      batterySocEntityId: normalizeConfigValue(parsed.batterySocEntityId, DEFAULT_CONSUMPTION_CONFIG.batterySocEntityId),
      waterCurrentEntityId: normalizeConfigValue(parsed.waterCurrentEntityId, DEFAULT_CONSUMPTION_CONFIG.waterCurrentEntityId),
      waterGoalEntityId: normalizeConfigValue(parsed.waterGoalEntityId, DEFAULT_CONSUMPTION_CONFIG.waterGoalEntityId),
      waterRainRecoveryEntityId: normalizeConfigValue(parsed.waterRainRecoveryEntityId, DEFAULT_CONSUMPTION_CONFIG.waterRainRecoveryEntityId),
      gasTodayEntityId: normalizeConfigValue(parsed.gasTodayEntityId, DEFAULT_CONSUMPTION_CONFIG.gasTodayEntityId),
    };
  } catch {
    return DEFAULT_CONSUMPTION_CONFIG;
  }
}

export function createConsumptionDashboardData(
  config: ConsumptionEntityConfig,
  states: MockEntityStateMap,
): ConsumptionDashboardData {
  const solarPowerKw = resolveNumericValue(states, config.solarPowerEntityId, DEFAULT_DASHBOARD_DATA.solarPowerKw);
  const gridPowerKw = resolveNumericValue(states, config.gridPowerEntityId, DEFAULT_DASHBOARD_DATA.gridPowerKw);
  const homePowerKw = resolveNumericValue(states, config.homePowerEntityId, DEFAULT_DASHBOARD_DATA.homePowerKw);
  const waterCurrentLiters = resolveNumericValue(
    states,
    config.waterCurrentEntityId,
    DEFAULT_DASHBOARD_DATA.waterCurrentLiters,
  );
  const waterGoalLitersRaw = resolveNumericValue(
    states,
    config.waterGoalEntityId,
    DEFAULT_DASHBOARD_DATA.waterGoalLiters,
  );
  const waterGoalLiters = Math.max(1, waterGoalLitersRaw);
  const waterRainRecoveryLitersPerMin = Math.max(
    0,
    resolveNumericValue(
      states,
      config.waterRainRecoveryEntityId,
      DEFAULT_DASHBOARD_DATA.waterRainRecoveryLitersPerMin,
    ),
  );
  const gasTodayCubicMeters = resolveNumericValue(
    states,
    config.gasTodayEntityId,
    DEFAULT_DASHBOARD_DATA.gasTodayCubicMeters,
  );
  const solarMixRaw = resolveNumericValue(states, config.solarMixEntityId, DEFAULT_DASHBOARD_DATA.solarMixPct);
  const normalizedSolarMix = solarMixRaw >= 0 && solarMixRaw <= 1 ? solarMixRaw * 100 : solarMixRaw;
  const solarMixPct = clamp(Math.round(normalizedSolarMix), 0, 100);
  const batterySocPct = clamp(
    Math.round(resolveNumericValue(states, config.batterySocEntityId, DEFAULT_DASHBOARD_DATA.batterySocPct)),
    0,
    100,
  );
  const batteryPowerKw = resolveNumericValue(
    states,
    config.batteryPowerEntityId,
    DEFAULT_DASHBOARD_DATA.batteryPowerKw,
  );
  const evSocPct = clamp(
    Math.round(resolveNumericValue(states, 'sensor.ev_soc', DEFAULT_DASHBOARD_DATA.evSocPct)),
    0,
    100,
  );
  const evPowerKw = resolveNumericValue(
    states,
    'sensor.ev_charge_power_kw',
    DEFAULT_DASHBOARD_DATA.evPowerKw,
  );

  return {
    solarPowerKw,
    gridPowerKw,
    homePowerKw,
    batterySocPct,
    batteryPowerKw,
    evSocPct,
    evPowerKw,
    solarMixPct,
    waterCurrentLiters,
    waterGoalLiters,
    waterRainRecoveryLitersPerMin,
    gasTodayCubicMeters,
    weeklyTrendPoints: DEFAULT_DASHBOARD_DATA.weeklyTrendPoints,
  };
}

export function useConsumptionConfig() {
  const [config, setConfig] = useState<ConsumptionEntityConfig>(readStoredConfig);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfigField = (field: keyof ConsumptionEntityConfig, value: string) => {
    setConfig((current) => ({
      ...current,
      [field]: value.trim(),
    }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONSUMPTION_CONFIG);
  };

  const memoizedConfig = useMemo(() => config, [config]);

  return {
    config: memoizedConfig,
    updateConfigField,
    resetConfig,
  };
}

export { DEFAULT_CONSUMPTION_CONFIG, DEFAULT_DASHBOARD_DATA };
