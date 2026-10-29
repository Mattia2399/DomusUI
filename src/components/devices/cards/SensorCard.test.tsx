import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SensorModel } from '../model/sensor';
import { SensorCard } from './SensorCard';

afterEach(cleanup);

const temperature: SensorModel = {
  entityId: 'sensor.living_temperature',
  name: 'Soggiorno',
  kind: 'temp',
  available: true,
  value: 21.4,
  alarm: false,
  battery: null,
  changedAt: null,
};
const day = [
  { t: 1, v: 20.8 },
  { t: 2, v: 21.1 },
  { t: 3, v: 21.4 },
];

describe('SensorCard of a room', () => {
  it('draws a faint outline while the history is on its way, then the line', () => {
    const view = render(<SensorCard model={temperature} history={[]} historyLoading onOpenPanel={() => undefined} />);
    expect(view.container.querySelector('.dv-spark.is-waiting')).not.toBeNull();

    view.rerender(<SensorCard model={temperature} history={day} onOpenPanel={() => undefined} />);
    expect(view.container.querySelector('.dv-spark.is-waiting')).toBeNull();
    expect(view.container.querySelector('.dv-spark polyline')).not.toBeNull();
  });

  it('leaves the space empty when there is no history, or the sensor cannot answer', () => {
    const empty = render(<SensorCard model={temperature} history={[]} onOpenPanel={() => undefined} />);
    expect(empty.container.querySelector('.dv-spark')).toBeNull();
    empty.unmount();

    const away = render(<SensorCard model={{ ...temperature, available: false }} history={[]} historyLoading onOpenPanel={() => undefined} />);
    expect(away.container.querySelector('.dv-spark')).toBeNull();
  });
});
