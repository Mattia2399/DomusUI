import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassDatePicker, isoDate, monthGrid } from './GlassDatePicker';
import { GlassDateTimePicker } from './GlassDateTimePicker';
import { GlassKeypad } from './GlassKeypad';
import { GlassPasswordInput } from './GlassPasswordInput';
import { GlassTextArea } from './GlassTextArea';
import { checkText, GlassTextInput } from './GlassTextInput';
import { GlassTimePicker, readTime, shiftTime } from './GlassTimePicker';
import { bandParts, GlassTimeRange } from './GlassTimeRange';

afterEach(cleanup);

const TIME_LABELS = { hoursLabel: 'Ore', minutesLabel: 'Minuti', moreLabel: 'Più', lessLabel: 'Meno' };
const DATE_LABELS = { previousLabel: 'Mese prima', nextLabel: 'Mese dopo' };

describe('text', () => {
  it('checkText follows the limits of the entity, and leaves alone a pattern that does not compile', () => {
    expect(checkText('ab', { minLength: 3 })).toBe('too-short');
    expect(checkText('abcd', { maxLength: 3 })).toBe('too-long');
    expect(checkText('abc', { pattern: '[0-9]+' })).toBe('pattern');
    expect(checkText('123', { pattern: '[0-9]+' })).toBeNull();
    expect(checkText('abc', { pattern: '(' })).toBeNull();
  });

  const field = (onCommit = vi.fn()) => {
    render(<GlassTextInput label="Messaggio" value="Ciao" maxLength={6} clearLabel="Svuota" describeProblem={(problem) => `sbagliato: ${problem}`} onCommit={onCommit} />);
    return { input: screen.getByRole('textbox', { name: 'Messaggio' }), onCommit };
  };

  it('Enter saves; nothing changed, nothing sent', () => {
    const { input, onCommit } = field();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Ciao!' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Ciao!');
    expect(screen.getByText('5/6')).toBeTruthy();
  });

  it('a wrong text is explained and never sent', () => {
    const { input, onCommit } = field();
    fireEvent.change(input, { target: { value: 'Troppo lungo' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('sbagliato: too-long');
  });

  it('the cross empties the field', () => {
    const { input } = field();
    fireEvent.click(screen.getByRole('button', { name: 'Svuota' }));
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: 'Svuota' })).toBeNull();
  });

  it('the password is covered until the eye is touched', () => {
    render(<GlassPasswordInput label="Wi-Fi" value="segreta" clearLabel="Svuota" showLabel="Mostra" hideLabel="Nascondi" describeProblem={String} onCommit={() => undefined} />);
    const input = screen.getByLabelText('Wi-Fi') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostra' }));
    expect(input.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Nascondi' }));
    expect(input.type).toBe('password');
  });

  it('the area saves on leaving and has its limit', () => {
    const onCommit = vi.fn();
    render(<GlassTextArea label="Nota" value="" onCommit={onCommit} />);
    const area = screen.getByRole('textbox', { name: 'Nota' }) as HTMLTextAreaElement;
    expect(area.maxLength).toBe(255);
    fireEvent.change(area, { target: { value: 'Ciao' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(area);
    expect(onCommit).toHaveBeenCalledWith('Ciao');
    expect(screen.getByText('4/255')).toBeTruthy();
  });
});

describe('GlassKeypad', () => {
  const keypad = (onSubmit = vi.fn(), extra = {}) => {
    render(<GlassKeypad label="Soglia" maxLength={3} deleteLabel="Cancella" confirmLabel="OK" onSubmit={onSubmit} {...extra} />);
    return onSubmit;
  };

  it('types, deletes and confirms', () => {
    const onSubmit = keypad();
    expect((screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancella' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith('10');
  });

  it('stops at its length and works from the keyboard', () => {
    const onSubmit = keypad();
    const group = screen.getByRole('group', { name: 'Soglia' });
    ['1', '2', '3', '4'].forEach((key) => fireEvent.keyDown(group, { key }));
    fireEvent.keyDown(group, { key: 'Backspace' });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith('12');
  });

  it('covers a code', () => {
    keypad(vi.fn(), { masked: true, value: '42' });
    expect(screen.getByText('••')).toBeTruthy();
    expect(screen.queryByText('42')).toBeNull();
  });
});

describe('dates', () => {
  it('monthGrid starts from Monday and closes the last week', () => {
    const november = monthGrid(2026, 10);
    expect(november.slice(0, 7)).toEqual([null, null, null, null, null, null, 1]);
    expect(november.filter((day) => day !== null)).toHaveLength(30);
    expect(november.length % 7).toBe(0);
    expect(monthGrid(2024, 1).filter((day) => day !== null)).toHaveLength(29);
    expect(isoDate(2026, 0, 5)).toBe('2026-01-05');
  });

  const picker = (onChange = vi.fn()) => {
    const view = render(<GlassDatePicker label="Rientro" value="2026-11-14" min="2026-11-10" max="2026-12-05" today="2026-11-05" onChange={onChange} {...DATE_LABELS} />);
    return { ...view, onChange };
  };

  it('chooses a day, marks today and the chosen one', () => {
    const { container, onChange } = picker();
    expect(container.querySelector('.is-on')?.textContent).toBe('14');
    expect(container.querySelector('.is-today')?.textContent).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: '20 novembre 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-20');
  });

  it('turns off the days out of bounds', () => {
    picker();
    expect((screen.getByRole('button', { name: '9 novembre 2026' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '10 novembre 2026' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('walks through the months, over the year too', () => {
    render(<GlassDatePicker label="R" value="2026-12-14" onChange={() => undefined} {...DATE_LABELS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mese dopo' }));
    expect(screen.getByText('gennaio 2027')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mese prima' }));
    expect(screen.getByText('dicembre 2026')).toBeTruthy();
  });
});

describe('times', () => {
  it('shiftTime goes round the clock', () => {
    expect(shiftTime('23:55', 10)).toBe('00:05');
    expect(shiftTime('00:05', -10)).toBe('23:55');
    expect(shiftTime('06:30', 60)).toBe('07:30');
    expect(shiftTime(null, 5)).toBe('00:05');
    expect(readTime('99:99')).toEqual({ hours: 0, minutes: 0 });
  });

  it('the picker moves hours and minutes by the step, from the arrows and the keys', () => {
    const onChange = vi.fn();
    render(<GlassTimePicker label="Accendi" value="06:30" stepMinutes={15} onChange={onChange} {...TIME_LABELS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Più: Minuti' }));
    expect(onChange).toHaveBeenLastCalledWith('06:45');
    fireEvent.click(screen.getByRole('button', { name: 'Meno: Ore' }));
    expect(onChange).toHaveBeenLastCalledWith('05:30');
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Ore' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('07:30');
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Minuti' }), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('06:15');
  });

  it('does nothing while it waits', () => {
    const onChange = vi.fn();
    render(<GlassTimePicker label="A" value="06:30" onChange={onChange} pending {...TIME_LABELS} />);
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Ore' }), { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('date and time: one picker open at a time, and both values kept', () => {
    const onChange = vi.fn();
    const { container } = render(<GlassDateTimePicker label="Fine" dateLabel="Data" timeLabel="Ora" date="2026-11-14" time="18:00" dateText="14 novembre" onChange={onChange} {...DATE_LABELS} {...TIME_LABELS} stepMinutes={5} />);
    expect(container.querySelector('.glass-date')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Data/ }));
    expect(container.querySelector('.glass-date')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '20 novembre 2026' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-20', '18:00');
    fireEvent.click(screen.getByRole('button', { name: /^Ora/ }));
    expect(container.querySelector('.glass-date')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Più: Minuti' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-14', '18:05');
  });

  it('a band that goes past midnight has two parts', () => {
    expect(bandParts('08:00', '12:00')).toEqual([[480, 720]]);
    expect(bandParts('23:00', '06:30')).toEqual([[0, 390], [1380, 1440]]);
  });

  it('the band moves each end', () => {
    const onChange = vi.fn();
    const { container } = render(<GlassTimeRange fromLabel="Inizio" toLabel="Fine" from="23:00" to="06:30" onChange={onChange} />);
    expect(container.querySelectorAll('.glass-time-range-track > i')).toHaveLength(2);
    fireEvent.change(screen.getByRole('slider', { name: 'Inizio' }), { target: { value: '1320' } });
    expect(onChange).toHaveBeenLastCalledWith('22:00', '06:30');
    fireEvent.change(screen.getByRole('slider', { name: 'Fine' }), { target: { value: '420' } });
    expect(onChange).toHaveBeenLastCalledWith('23:00', '07:00');
  });
});

describe('every one has the three forms', () => {
  it.each(['compact', 'group', 'hero'] as const)('%s', (size) => {
    const { container } = render(
      <>
        <GlassTextInput label="T" value="" clearLabel="C" describeProblem={String} onCommit={() => undefined} size={size} />
        <GlassTextArea label="A" value="" onCommit={() => undefined} size={size} />
        <GlassKeypad label="K" deleteLabel="D" confirmLabel="O" onSubmit={() => undefined} size={size} />
        <GlassTimeRange fromLabel="F" toLabel="E" from="01:00" to="02:00" onChange={() => undefined} size={size} />
        <GlassTimePicker label="P" value="01:00" onChange={() => undefined} size={size} {...TIME_LABELS} />
        <GlassDatePicker label="D" value="2026-11-05" onChange={() => undefined} size={size} {...DATE_LABELS} />
      </>,
    );
    expect(container.querySelectorAll(`.is-${size}`)).toHaveLength(6);
  });
});
