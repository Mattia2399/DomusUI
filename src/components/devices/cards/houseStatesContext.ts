import React from 'react';
import type { MockEntityState } from '../../../types/ha';

/*
 * The live states of the house, for the cards that gather sensors of the
 * whole house (sensorHouse.tsx). Kept apart so that the Home providing them
 * does not load the sensor families.
 */
export type HouseStates = Record<string, MockEntityState | undefined>;

export const HouseStatesContext = React.createContext<HouseStates | null>(null);

export const HouseStatesProvider = HouseStatesContext.Provider;
