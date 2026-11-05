import React from 'react';
import { onceLoaded } from '../../../common/onceLoaded';
import type { RelatedLook } from '../../../../types/relatedControl';
import { RELATED_LOOKS, type RelatedFamily } from './relatedControlRegistry';
import type { RelatedLookProps } from './relatedLookTypes';

/*
 * Each family of looks arrives only when a panel uses it. The base one is what
 * the panels already load, so it asks for nothing more.
 */

type Looks = { default: React.ComponentType<RelatedLookProps> };

export const RELATED_FAMILY_LOADERS: Record<RelatedFamily, () => Promise<Looks>> = {
  base: onceLoaded(() => import('./looks/BaseLooks')),
  values: onceLoaded(() => import('./looks/ValuesLooks')),
  actions: onceLoaded(() => import('./looks/ActionsLooks')),
  indicators: onceLoaded(() => import('./looks/IndicatorsLooks')),
  charts: onceLoaded(() => import('./looks/ChartsLooks')),
  text: onceLoaded(() => import('./looks/TextLooks')),
  advanced: onceLoaded(() => import('./looks/AdvancedLooks')),
};

export const familyOfLook = (look: RelatedLook) => RELATED_LOOKS[look].family;
