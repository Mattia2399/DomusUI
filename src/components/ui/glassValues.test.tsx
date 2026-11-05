import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassArrows } from './GlassArrows';
import { GlassCheckbox } from './GlassCheckbox';
import { GlassLedRow } from './GlassLedRow';
import { GlassLevels } from './GlassLevels';
import { checkNumber, GlassNumberInput } from './GlassNumberInput';
import { GlassRange } from './GlassRange';
import { GlassRingSlider, shareOnArc } from './GlassRingSlider';
import { GlassToggleCard } from './GlassToggleCard';

afterEach(cleanup);

const FORMS = ['compact', 'group', 'hero'] as const;
const OPTIONS = [
  { value: 'a', label: 'Primo' },
  { value: 'b', label: 'Secondo' },
  { value: 'c', label: 'Terzo' },
];
const LEVELS = [1, 2, 3, 4, 5].map((value) => ({ value, label: `P${value}` }));

function Arrows({ onChange = () => undefined }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('a');
  return (
    <GlassArrows
      ariaLabel="Anticipo"
      previousLabel="Prima"
      nextLabel="Dopo"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('GlassArrows', () => {
  it('walks through the options and stops at the ends', () => {
    const onChange = vi.fn();
    render(<Arrows onChange={onChange} />);
    const previous = screen.getByRole('button', { name: 'Prima' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Dopo' }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(['b', 'c']);
    expect(next.disabled).toBe(true);
    expect(screen.getByText('Terzo')).toBeTruthy();
  });

  it('answers the arrow keys and nothing else', () => {
    const onChange = vi.fn();
    render(<Arrows onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Anticipo' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    fireEvent.keyDown(group, { key: 'a' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it.each(FORMS)('has the form %s', (size) => {
    const { container } = render(<GlassArrows ariaLabel="A" previousLabel="P" nextLabel="N" options={OPTIONS} value="b" onChange={() => undefined} size={size} />);
    expect(container.querySelector(`.glass-arrows.is-${size}`)).toBeTruthy();
  });

  it('does nothing while it waits', () => {
    const onChange = vi.fn();
    render(<GlassArrows ariaLabel="A" previousLabel="P" nextLabel="N" options={OPTIONS} value="b" onChange={onChange} pending />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'A' }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'A' }).getAttribute('aria-busy')).toBe('true');
  });
});

describe('checkNumber', () => {
  it('reads a comma as a point and respects limits and step', () => {
    expect(checkNumber('1,5', { min: 1, max: 10, step: 0.5 })).toEqual({ value: 1.5 });
    expect(checkNumber('', {})).toEqual({ problem: 'not-a-number' });
    expect(checkNumber('abc', {})).toEqual({ problem: 'not-a-number' });
    expect(checkNumber('0.5', { min: 1 })).toEqual({ problem: 'too-low' });
    expect(checkNumber('11', { max: 10 })).toEqual({ problem: 'too-high' });
    expect(checkNumber('1.2', { min: 1, step: 0.5 })).toEqual({ problem: 'off-step' });
    expect(checkNumber('20.1', { min: 20, step: 0.1 })).toEqual({ value: 20.1 });
  });
});

describe('GlassNumberInput', () => {
  const field = (onValueChange = vi.fn()) => {
    render(<GlassNumberInput label="Potenza" value={3} min={1} max={10} step={0.5} unit="kW" hint="Da 1 a 10" describeProblem={(problem) => `sbagliato: ${problem}`} onValueChange={onValueChange} />);
    return { input: screen.getByRole('textbox', { name: 'Potenza' }), onValueChange };
  };

  it('confirms with Enter and on leaving', () => {
    const { input, onValueChange } = field();
    fireEvent.change(input, { target: { value: '4,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith(4.5);
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith(6);
  });

  it('explains a wrong number and never sends it', () => {
    const { input, onValueChange } = field();
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('sbagliato: too-high');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('sends nothing when nothing changed', () => {
    const { input, onValueChange } = field();
    fireEvent.blur(input);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByText('Da 1 a 10')).toBeTruthy();
  });

  it.each(FORMS)('has the form %s and blocks when disabled', (size) => {
    const { container } = render(<GlassNumberInput label="N" value={1} describeProblem={String} onValueChange={() => undefined} size={size} disabled />);
    expect(container.querySelector(`.glass-number.is-${size}`)).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('GlassLevels', () => {
  it('chooses by touch, marks what it reaches and says which is on', () => {
    const onChange = vi.fn();
    const { container } = render(<GlassLevels ariaLabel="Potenza" levels={LEVELS} value={3} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'P3' }).getAttribute('aria-checked')).toBe('true');
    expect(container.querySelectorAll('.is-reached')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: 'P5' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('walks with the keys and stops at the ends', () => {
    const onChange = vi.fn();
    render(<GlassLevels ariaLabel="Potenza" levels={LEVELS} value={5} onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Potenza' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('keeps one stop for the tab key', () => {
    render(<GlassLevels ariaLabel="Potenza" levels={LEVELS} value={2} onChange={() => undefined} />);
    expect(screen.getAllByRole('radio').map((node) => node.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);
  });

  it.each(FORMS)('has the form %s', (size) => {
    const { container } = render(<GlassLevels ariaLabel="L" levels={LEVELS} value={1} onChange={() => undefined} size={size} />);
    expect(container.querySelector(`.glass-levels.is-${size}`)).toBeTruthy();
  });

  it('does not change while it waits', () => {
    const onChange = vi.fn();
    render(<GlassLevels ariaLabel="L" levels={LEVELS} value={1} onChange={onChange} pending />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GlassRange', () => {
  const range = (onValueChange = vi.fn(), low = 20, high = 24) => {
    render(<GlassRange low={low} high={high} min={16} max={30} minGap={1} onValueChange={onValueChange} lowLabel="Minimo" highLabel="Massimo" format={(value) => `${value}°`} />);
    return { low: screen.getByRole('slider', { name: 'Minimo' }), high: screen.getByRole('slider', { name: 'Massimo' }), onValueChange };
  };

  it('moves each handle', () => {
    const { low, high, onValueChange } = range();
    fireEvent.change(low, { target: { value: '18' } });
    expect(onValueChange).toHaveBeenCalledWith(18, 24);
    fireEvent.change(high, { target: { value: '27' } });
    expect(onValueChange).toHaveBeenLastCalledWith(20, 27);
  });

  it('never lets them cross, and keeps their distance', () => {
    const { low, high, onValueChange } = range();
    fireEvent.change(low, { target: { value: '29' } });
    expect(onValueChange).toHaveBeenCalledWith(23, 24);
    fireEvent.change(high, { target: { value: '17' } });
    expect(onValueChange).toHaveBeenLastCalledWith(20, 21);
  });

  it('says both values in words', () => {
    const { low } = range();
    expect(low.getAttribute('aria-valuetext')).toBe('20°');
    expect(screen.getByText('20° – 24°')).toBeTruthy();
  });

  it.each(FORMS)('has the form %s', (size) => {
    const { container } = render(<GlassRange low={1} high={2} min={0} max={3} onValueChange={() => undefined} lowLabel="L" highLabel="H" size={size} />);
    expect(container.querySelector(`.glass-range.is-${size}`)).toBeTruthy();
  });

  it('blocks both handles while disabled', () => {
    render(<GlassRange low={1} high={2} min={0} max={3} onValueChange={() => undefined} lowLabel="L" highLabel="H" disabled />);
    expect(screen.getAllByRole('slider').every((node) => (node as HTMLInputElement).disabled)).toBe(true);
  });
});

describe('GlassRingSlider', () => {
  it('finds a point along the arc and takes the nearer end from the gap', () => {
    expect(shareOnArc(-1, 1)).toBeCloseTo(0);
    expect(shareOnArc(0, -1)).toBeCloseTo(0.5);
    expect(shareOnArc(1, 1)).toBeCloseTo(1);
    expect(shareOnArc(-0.2, 1)).toBe(0);
    expect(shareOnArc(0.2, 1)).toBe(1);
  });

  it('answers the keys one step at a time and stops at the limits', () => {
    const onValueChange = vi.fn();
    render(<GlassRingSlider label="Boiler" value={50} min={40} max={50} step={5} onValueChange={onValueChange} format={(value) => `${value}°`} />);
    const slider = screen.getByRole('slider', { name: 'Boiler' });
    expect(slider.getAttribute('aria-valuetext')).toBe('50°');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onValueChange).toHaveBeenCalledWith(45);
  });

  it.each(FORMS)('has the form %s', (size) => {
    const { container } = render(<GlassRingSlider label="R" value={1} min={0} max={2} onValueChange={() => undefined} size={size} />);
    expect(container.querySelector(`.glass-ring-slider.is-${size}`)).toBeTruthy();
  });

  it('leaves the tab order while disabled', () => {
    const onValueChange = vi.fn();
    render(<GlassRingSlider label="R" value={1} min={0} max={2} onValueChange={onValueChange} disabled />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('switches', () => {
  it('GlassCheckbox is one row that says its state', () => {
    const onChange = vi.fn();
    render(<GlassCheckbox checked={false} onChange={onChange} label="Lunedì" />);
    const box = screen.getByRole('checkbox', { name: 'Lunedì' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('GlassToggleCard turns on and off and blocks while waiting', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GlassToggleCard checked onChange={onChange} title="Blocca" status="Attivo" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
    rerender(<GlassToggleCard checked onChange={onChange} title="Blocca" status="Attivo" pending />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('GlassLedRow is to read without a command, and a switch with one', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(<GlassLedRow on title="Pompa" tone="warn" blink />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(container.querySelector('.glass-led-row-light.is-warn.is-blinking')).toBeTruthy();
    rerender(<GlassLedRow on={false} title="Pompa" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(container.querySelector('.glass-led-row-light.is-ok')).toBeNull();
  });

  it.each(['compact', 'group'] as const)('the three have the form %s', (size) => {
    const { container } = render(
      <>
        <GlassCheckbox checked onChange={() => undefined} label="C" size={size} />
        <GlassToggleCard checked onChange={() => undefined} title="T" status="S" size={size} />
        <GlassLedRow on title="L" size={size} />
      </>,
    );
    expect(container.querySelectorAll(`.is-${size}`)).toHaveLength(3);
  });
});
