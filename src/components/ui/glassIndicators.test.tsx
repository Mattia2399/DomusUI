import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { batteryMeaning, GlassBattery } from './GlassBattery';
import { barsOfSignal, GlassConnection } from './GlassConnection';
import { GlassGauge } from './GlassGauge';
import { GlassHumidity } from './GlassHumidity';
import { GlassIconStatus } from './GlassIconStatus';
import { GlassLed } from './GlassLed';
import { GlassLevel } from './GlassLevel';
import { GlassMiniRing } from './GlassMiniRing';
import { GlassProgressBar } from './GlassProgressBar';
import { GlassRadialGauge } from './GlassRadialGauge';
import { GlassStatusBadge } from './GlassStatusBadge';
import { GlassStatusGlow } from './GlassStatusGlow';
import { GlassTemperature } from './GlassTemperature';
import { GlassTrend } from './GlassTrend';
import { GlassValueDisplay } from './GlassValueDisplay';
import { GlassValuePill } from './GlassValuePill';

afterEach(cleanup);

const ALL: Array<[string, (size: 'compact' | 'group' | 'hero') => React.ReactElement]> = [
  ['glass-value-display', (size) => <GlassValueDisplay value={148} unit="°C" size={size} />],
  ['glass-value-pill', (size) => <GlassValuePill label="Acqua" value="62°" size={size} />],
  ['glass-status-badge', (size) => <GlassStatusBadge label="In funzione" size={size} />],
  ['glass-led', (size) => <GlassLed label="Fiamma" size={size} />],
  ['glass-status-glow', (size) => <GlassStatusGlow title="Pellet" size={size} />],
  ['glass-gauge', (size) => <GlassGauge percent={40} value="40%" size={size} />],
  ['glass-gauge is-radial', (size) => <GlassRadialGauge value={148} min={0} max={300} display="148°" size={size} />],
  ['glass-mini-ring', (size) => <GlassMiniRing percent={40} label="Filtro" size={size} />],
  ['glass-progress', (size) => <GlassProgressBar percent={40} size={size} />],
  ['glass-battery', (size) => <GlassBattery percent={40} size={size} />],
  ['glass-temperature', (size) => <GlassTemperature value={50} min={30} max={90} size={size} />],
  ['glass-humidity', (size) => <GlassHumidity percent={48} size={size} />],
  ['glass-level', (size) => <GlassLevel percent={40} size={size} />],
  ['glass-connection', (size) => <GlassConnection bars={3} label="Online" size={size} />],
  ['glass-trend', (size) => <GlassTrend direction="up" label="+0,6°" size={size} />],
  ['glass-icon-status', (size) => <GlassIconStatus icon={<svg />} title="Chiusa" size={size} />],
];

describe('every reading has the three forms', () => {
  it.each(ALL.flatMap(([name, make]) => (['compact', 'group', 'hero'] as const).map((size) => [name, size, make] as const)))('%s %s', (name, size, make) => {
    const { container } = render(make(size));
    const selector = `.${name.replace(' ', '.')}.is-${size}`;
    expect(container.querySelector(selector)).toBeTruthy();
  });
});

describe('values at their limits', () => {
  it('a bar never goes past its ends', () => {
    const { container, rerender } = render(<GlassProgressBar percent={140} label="Avanzamento" />);
    const bar = screen.getByRole('progressbar', { name: 'Avanzamento' });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(container.querySelector<HTMLElement>('.glass-fill-info')!.style.width).toBe('100%');
    rerender(<GlassProgressBar percent={-5} label="Avanzamento" vertical />);
    expect(container.querySelector<HTMLElement>('.glass-fill-info')!.style.height).toBe('0%');
  });

  it('the battery changes colour under 20 and under 10', () => {
    expect(batteryMeaning(50)).toBe('ok');
    expect(batteryMeaning(19)).toBe('warn');
    expect(batteryMeaning(9)).toBe('bad');
    expect(batteryMeaning(20)).toBe('ok');
    expect(batteryMeaning(10)).toBe('warn');
    render(<GlassBattery percent={18.4} />);
    expect(screen.getByText('18%')).toBeTruthy();
  });

  it('the tank warns under its threshold and says its value to a reader', () => {
    const { container, rerender } = render(<GlassLevel percent={40} label="Pellet" />);
    expect(container.querySelector('.glass-fill-info')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Pellet' }).getAttribute('aria-valuenow')).toBe('40');
    rerender(<GlassLevel percent={15} label="Pellet" />);
    expect(container.querySelector('.glass-fill-warn')).toBeTruthy();
  });

  it('the signal has its notches', () => {
    expect([-40, -60, -70, -85, -95].map(barsOfSignal)).toEqual([4, 3, 2, 1, 0]);
    const { container } = render(<GlassConnection bars={1} label="Debole" />);
    expect(container.querySelectorAll('.glass-fill-warn')).toHaveLength(1);
  });

  it('the temperature keeps its point on the scale', () => {
    const { container } = render(<GlassTemperature value={200} min={30} max={90} ideal={[55, 70]} idealLabel="Ideale" />);
    expect(container.querySelector<HTMLElement>('.glass-temperature-now')!.style.left).toBe('100%');
    expect(screen.getByText('Ideale')).toBeTruthy();
  });

  it('the humidity tells inside from outside the good range', () => {
    const { container, rerender } = render(<GlassHumidity percent={48} status="Ideale" />);
    expect(container.querySelector('em.glass-mean-ok')).toBeTruthy();
    rerender(<GlassHumidity percent={72} status="Alta" />);
    expect(container.querySelector('em.glass-mean-warn')).toBeTruthy();
  });

  it('the colour of a reading is its meaning, never the device', () => {
    const { container } = render(<GlassStatusBadge label="Blocco fiamma" meaning="bad" />);
    expect(container.querySelector('.glass-tint-bad')).toBeTruthy();
    render(<GlassStatusGlow title="Allarme" meaning="bad" />);
    expect(screen.getByRole('alert').textContent).toBe('Allarme');
  });

  it('a gauge has as many bands as it is given', () => {
    const { container } = render(<GlassRadialGauge value={148} min={0} max={300} zones={[{ from: 0, to: 200, meaning: 'ok' }, { from: 240, to: 300, meaning: 'bad' }]} display="148°" label="Fumi" />);
    expect(container.querySelectorAll('path.is-zone')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Fumi' })).toBeTruthy();
  });

  it('the small ring and the pill say what they read', () => {
    render(
      <>
        <GlassMiniRing percent={8} label="Panno" value="8%" meaning="bad" />
        <GlassValuePill label="Acqua" value="62°" />
        <GlassValueDisplay value={148} unit="°C" status="Normale" meaning="ok" />
        <GlassLed label="Allarme" meaning="bad" blink />
        <GlassTrend direction="flat" label="stabile" />
        <GlassIconStatus icon={<svg />} title="Finestra" note="da 2 ore" />
      </>,
    );
    for (const text of ['Panno', '8%', 'Acqua', '62°', '148', 'Normale', 'Allarme', 'stabile', 'da 2 ore']) expect(screen.getByText(text)).toBeTruthy();
  });
});
