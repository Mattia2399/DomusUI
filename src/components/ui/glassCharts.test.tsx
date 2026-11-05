import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GlassAreaChart } from './GlassAreaChart';
import { GlassBarChart } from './GlassBarChart';
import { chartArea, chartLine, chartRange, chartX, chartY, finitePoints } from './glassChart';
import { changePercent, GlassCompareChart } from './GlassCompareChart';
import { GlassHistoryChart } from './GlassHistoryChart';
import { GlassLineChart } from './GlassLineChart';
import { GlassMultiChart } from './GlassMultiChart';
import { GlassSparkline } from './GlassSparkline';
import { GlassStats } from './GlassStats';

afterEach(cleanup);

const POINTS = [20, 21, 19, 22];

describe('the geometry of a chart', () => {
  it('fits every value in the box and keeps a margin', () => {
    const range = chartRange(POINTS);
    expect(range.low).toBeLessThan(19);
    expect(range.high).toBeGreaterThan(22);
    POINTS.forEach((point) => {
      expect(chartY(point, range)).toBeGreaterThan(0);
      expect(chartY(point, range)).toBeLessThan(100);
    });
  });

  it('makes room for what it must also show', () => {
    expect(chartRange(POINTS, [40]).high).toBeGreaterThan(40);
  });

  it('never divides by zero on a flat line or with nothing', () => {
    expect(chartRange([5, 5]).high).toBeGreaterThan(chartRange([5, 5]).low);
    expect(chartRange([0, 0]).high).toBeGreaterThan(chartRange([0, 0]).low);
    expect(chartRange([])).toEqual({ low: 0, high: 1 });
    expect(chartX(0, 1)).toBe(100);
  });

  it('draws from side to side and closes the area along the bottom', () => {
    const range = chartRange(POINTS);
    expect(chartLine(POINTS, range).startsWith('M 0.00')).toBe(true);
    expect(chartLine(POINTS, range)).toContain('L 100.00');
    expect(chartArea(POINTS, range).endsWith('L 100 100 L 0 100 Z')).toBe(true);
    expect(chartArea([], range)).toBe('');
  });

  it('leaves out what is not a number', () => {
    expect(finitePoints([1, Number.NaN, Infinity, 2])).toEqual([1, 2]);
  });
});

describe('with nothing to draw', () => {
  it.each([[[]], [[5]], [[Number.NaN, 4]]])('says so instead of an empty chart: %j', (points) => {
    const { container } = render(<GlassLineChart points={points} emptyLabel="Nessun dato" />);
    expect(screen.getByText('Nessun dato')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('the bars too', () => {
    render(<GlassBarChart bars={[null, null]} emptyLabel="Nessun dato" />);
    expect(screen.getByText('Nessun dato')).toBeTruthy();
  });
});

describe('the charts', () => {
  it('the line has its last point, its band and its limit', () => {
    const { container } = render(<GlassLineChart points={POINTS} band={[20, 21]} threshold={22} label="Temperatura" axis={['0:00', 'ora']} />);
    expect(screen.getByRole('img', { name: 'Temperatura' })).toBeTruthy();
    expect(container.querySelector('.glass-plot-band')).toBeTruthy();
    expect(container.querySelector('.glass-plot-threshold')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('.glass-plot-end')!.style.left).toBe('100%');
    expect(container.querySelector('.glass-plot-area')).toBeNull();
    expect(screen.getByText('ora')).toBeTruthy();
  });

  it('the area is the same line shaded', () => {
    const { container } = render(<GlassAreaChart points={POINTS} />);
    expect(container.querySelector('.glass-plot-area')).toBeTruthy();
  });

  it('the bars: the current one stands out, those to come are empty', () => {
    const { container } = render(<GlassBarChart bars={[1, 2, 4, null, null]} current={2} />);
    const bars = container.querySelectorAll<HTMLElement>('.glass-bars > i');
    expect(bars).toHaveLength(5);
    expect(bars[2].className).toContain('is-current');
    expect(bars[2].style.height).toBe('100%');
    expect(bars[0].style.height).toBe('25%');
    expect(bars[3].className).toContain('is-future');
  });

  it('a bar of nothing can still be seen', () => {
    const { container } = render(<GlassBarChart bars={[0, 10]} />);
    expect(container.querySelector<HTMLElement>('.glass-bars > i')!.style.height).toBe('3%');
  });

  it('changing the period changes the chart', () => {
    const { container } = render(
      <GlassHistoryChart
        ariaLabel="Periodo"
        periods={[
          { id: 'day', label: '24 ore', points: POINTS, note: 'ultime 24 ore' },
          { id: 'week', label: '7 giorni', points: [], note: 'ultimi 7 giorni' },
        ]}
        emptyLabel="Nessun dato"
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '7 giorni' }));
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText('ultimi 7 giorni')).toBeTruthy();
  });

  it('touching a name in the legend hides its line', () => {
    const { container } = render(
      <GlassMultiChart
        ariaLabel="Acqua"
        series={[
          { id: 'in', label: 'Mandata', points: POINTS },
          { id: 'out', label: 'Ritorno', points: [18, 19, 18, 20] },
        ]}
      />,
    );
    expect(container.querySelectorAll('path.glass-plot-line')).toHaveLength(2);
    const name = screen.getByRole('button', { name: 'Ritorno' });
    fireEvent.click(name);
    expect(name.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('path.glass-plot-line')).toHaveLength(1);
    fireEvent.click(name);
    expect(container.querySelectorAll('path.glass-plot-line')).toHaveLength(2);
  });

  it('the comparison: the difference and whether it is good', () => {
    expect(changePercent(6.2, 7)).toBe(-11);
    expect(changePercent(5, 0)).toBeNull();
    const { container, rerender } = render(<GlassCompareChart current={{ label: 'Oggi', value: 6.2, text: '6,2 kg' }} previous={{ label: 'Ieri', value: 7, text: '7 kg' }} difference="−11%" lowerIsBetter />);
    expect(container.querySelector('b.is-better')).toBeTruthy();
    rerender(<GlassCompareChart current={{ label: 'Oggi', value: 6.2, text: '6,2 kg' }} previous={{ label: 'Ieri', value: 7, text: '7 kg' }} difference="−11%" />);
    expect(container.querySelector('b.is-worse')).toBeTruthy();
  });

  it('the three numbers', () => {
    render(<GlassStats items={[{ label: 'Minimo', value: '19,3°' }, { label: 'Massimo', value: '21,8°' }, { label: 'Media', value: '20,6°' }]} />);
    expect(screen.getByText('Massimo')).toBeTruthy();
    expect(screen.getByText('20,6°')).toBeTruthy();
  });
});

describe('every chart has the three forms', () => {
  it.each(['compact', 'group', 'hero'] as const)('%s', (size) => {
    const { container } = render(
      <>
        <GlassSparkline points={POINTS} size={size} />
        <GlassLineChart points={POINTS} size={size} />
        <GlassAreaChart points={POINTS} size={size} />
        <GlassBarChart bars={POINTS} size={size} />
        <GlassMultiChart ariaLabel="M" series={[]} size={size} />
        <GlassCompareChart current={{ label: 'A', value: 1, text: '1' }} previous={{ label: 'B', value: 2, text: '2' }} size={size} />
        <GlassStats items={[]} size={size} />
      </>,
    );
    expect(container.querySelectorAll(`.is-${size}`)).toHaveLength(7);
  });
});
