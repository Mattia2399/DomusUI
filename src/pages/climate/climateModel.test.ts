import { expectTypeOf, it } from 'vitest';
import type { ClimateZone, GeneratorWaterTarget, RoomTemperatureTarget } from './climateModel';
import type { HaArea } from '../../hooks/useHaLiveConnection';

it('keeps room intent, water targets and existing area references distinct', () => {
  expectTypeOf<GeneratorWaterTarget>().not.toExtend<RoomTemperatureTarget>();
  expectTypeOf<RoomTemperatureTarget>().not.toExtend<GeneratorWaterTarget>();
  expectTypeOf<ClimateZone['areaId']>().toEqualTypeOf<HaArea['area_id']>();
});
