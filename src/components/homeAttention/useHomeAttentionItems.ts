import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityStateMap } from '../../types/ha';
import type { DashboardHouseContext } from '../../services/dashboardHouseContext';
import { buildHomeAttentionItems, type HomeAttentionArea, type HomeAttentionItem } from './homeAttentionEngine';
import { useHomeAttentionPreferences } from './homeAttentionPreferences';
import { isHomeAttentionItemSuppressed, useHomeAttentionSuppressions } from './homeAttentionSuppressions';

export type UseHomeAttentionItemsOptions = {
  runtimeMode: 'real' | 'demo';
  connected: boolean;
  states: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HomeAttentionArea[];
  houseContext?: DashboardHouseContext | null;
  widgets?: Widget[];
  /** Skip the work while nothing shows the items. */
  enabled?: boolean;
};

const EMPTY: HomeAttentionItem[] = [];

/**
 * The attention items as the Home shows them: the shared preferences and
 * categories, without the ones snoozed or hidden on this device.
 */
export function useHomeAttentionItems({
  runtimeMode,
  connected,
  states,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  houseContext,
  widgets = [],
  enabled = true,
}: UseHomeAttentionItemsOptions) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const { preferences } = useHomeAttentionPreferences(runtimeMode);
  const suppressionState = useHomeAttentionSuppressions(runtimeMode);
  const { suppressions } = suppressionState;

  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  const candidateItems = useMemo(
    () =>
      enabled && preferences.enabled
        ? buildHomeAttentionItems({
            runtimeMode,
            connected,
            states,
            entityRegistry,
            deviceRegistry,
            areas,
            houseContext,
            widgets,
            now,
            batteryWarningThreshold: preferences.batteryWarningThreshold,
            openingWarningMinutes: preferences.openingWarningMinutes,
            locale,
          }).filter((item) => preferences.categories[item.category])
        : EMPTY,
    [areas, connected, deviceRegistry, enabled, entityRegistry, houseContext, locale, now, preferences, runtimeMode, states, widgets],
  );

  const items = useMemo(
    () => candidateItems.filter((item) => !isHomeAttentionItemSuppressed(item, suppressions, now)),
    [candidateItems, now, suppressions],
  );

  return { candidateItems, items, now, ...suppressionState };
}
