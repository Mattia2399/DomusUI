import { useEffect, useMemo, useState } from 'react';
import type { MockEntityStateMap } from '../types/ha';

const STORAGE_KEY = 'ha.dashboard.consumption.config.v1';

export type ConsumptionCardId = 'electricity' | 'water' | 'gas' | 'trend';

export type ConsumptionEntityConfig = {
  waterCurrentEntityId: string;
  waterGoalEntityId: string;
  waterRainRecoveryEntityId: string;
  gasTodayEntityId: string;
};

export type ConsumptionDashboardData = {
  waterCurrentLiters: number;
  waterGoalLiters: number;
  waterRainRecoveryLitersPerMin: number;
  gasTodayCubicMeters: number;
};

const DEFAULT_CONSUMPTION_CONFIG: ConsumptionEntityConfig = {
  waterCurrentEntityId: 'sensor.water_today_liters',
  waterGoalEntityId: 'input_number.water_daily_goal_liters',
  waterRainRecoveryEntityId: 'sensor.water_rain_recovery_lpm',
  gasTodayEntityId: 'sensor.gas_today_m3',
};

const DEFAULT_DASHBOARD_DATA: ConsumptionDashboardData = {
  waterCurrentLiters: 240,
  waterGoalLiters: 400,
  waterRainRecoveryLitersPerMin: 4.2,
  gasTodayCubicMeters: 1.2,
};

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
  return {
    waterCurrentLiters,
    waterGoalLiters,
    waterRainRecoveryLitersPerMin,
    gasTodayCubicMeters,
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
