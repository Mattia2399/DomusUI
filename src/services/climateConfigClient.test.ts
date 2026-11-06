import { describe, expect, it, vi } from 'vitest';
import { CLIMATE_CONFIG_TYPES, emptyClimateConfig, getClimateConfig, saveClimateConfig, type ClimateCallApi } from './climateConfigClient';

describe('Climate HOUSE config client', () => {
  it('loads absent configuration and sends an optimistic save with the whole document', async () => {
    const empty = emptyClimateConfig();
    const mock = vi.fn(async (message: Record<string, unknown>) => (
      message.type === CLIMATE_CONFIG_TYPES.get
        ? { state: 'absent', revision: 0, config: null }
        : { state: 'ready', revision: 1, config: empty }),
    );
    const callApi = mock as unknown as ClimateCallApi;
    expect(await getClimateConfig(callApi)).toEqual({ state: 'absent', revision: 0, config: null });
    expect(await saveClimateConfig(callApi, empty, 0)).toEqual({ state: 'ready', revision: 1, config: empty });
    expect(mock).toHaveBeenLastCalledWith(
      { type: CLIMATE_CONFIG_TYPES.save, config: empty, expected_revision: 0 },
      { reportError: false, throwOnError: true },
    );
  });

  it('refuses malformed or unconfirmed responses', async () => {
    await expect(getClimateConfig(async <T,>() => ({ state: 'ready', revision: 0, config: null }) as T)).rejects.toThrow();
    await expect(saveClimateConfig(async <T,>() => ({ state: 'absent', revision: 0, config: null }) as T, emptyClimateConfig(), 0)).rejects.toThrow();
  });
});
