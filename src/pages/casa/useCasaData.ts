import { useEffect, useState } from 'react';
import { getClimateConfig, type ClimateConfigResponse } from '../../services/climateConfigClient';
import { getEnergyState, type EnergyState } from '../../services/energyCoreClient';
import {
  getIrrigationCoreConfig,
  getIrrigationCoreState,
  type IrrigationCoreDocument,
  type IrrigationCoreState,
} from '../../services/irrigationCoreClient';
import {
  getWasteCollectionConfig,
  getWasteCollectionPreview,
  type WasteCollectionDocument,
  type WasteCollectionPreview,
} from '../../services/wasteCollectionClient';

export type CasaCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

/** What Domus Core says of each function; `undefined` while it is asked, `null` when it cannot be read. */
export type CasaCoreData = {
  climate?: ClimateConfigResponse | null;
  energy?: EnergyState | null;
  irrigationConfig?: IrrigationCoreDocument | null;
  irrigationState?: IrrigationCoreState | null;
  wasteConfig?: WasteCollectionDocument | null;
  wastePreview?: WasteCollectionPreview | null;
};

export type CasaDataAccess = {
  climate: boolean;
  energy: boolean;
  irrigation: boolean;
  waste: boolean;
};

const settle = async <T,>(read: () => Promise<T | null>): Promise<T | null> => {
  try {
    return (await read()) ?? null;
  } catch {
    return null;
  }
};

/**
 * Reads, once when Casa opens, the functions of Domus Core that the account may open. Nothing is
 * asked without a connection; what cannot be read stays unknown, and is neither shown nor offered.
 */
export function useCasaData(callApi: CasaCallApi, connected: boolean, access: CasaDataAccess): CasaCoreData {
  const [data, setData] = useState<CasaCoreData>({});
  const { climate, energy, irrigation, waste } = access;

  useEffect(() => {
    if (!connected) {
      setData({ climate: null, energy: null, irrigationConfig: null, irrigationState: null, wasteConfig: null, wastePreview: null });
      return undefined;
    }
    let alive = true;
    const put = (patch: CasaCoreData) => {
      if (alive) setData((current) => ({ ...current, ...patch }));
    };
    setData({});
    if (climate) void settle(() => getClimateConfig(callApi)).then((value) => put({ climate: value }));
    else put({ climate: null });
    if (energy) void settle(() => getEnergyState(callApi)).then((value) => put({ energy: value }));
    else put({ energy: null });
    if (irrigation) {
      void settle(() => getIrrigationCoreConfig(callApi)).then((value) => put({ irrigationConfig: value }));
      void settle(() => getIrrigationCoreState(callApi)).then((value) => put({ irrigationState: value }));
    } else put({ irrigationConfig: null, irrigationState: null });
    if (waste) {
      void settle(() => getWasteCollectionConfig(callApi)).then((value) => put({ wasteConfig: value }));
      void settle(() => getWasteCollectionPreview(callApi, 7)).then((value) => put({ wastePreview: value }));
    } else put({ wasteConfig: null, wastePreview: null });
    return () => {
      alive = false;
    };
    // The access is read through its four flags: a new object with the same answers asks nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callApi, connected, climate, energy, irrigation, waste]);

  return data;
}
