import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassButton } from './GlassButton';
import { GlassChips } from './GlassChips';
import { GlassColorPicker } from './GlassColorPicker';
import { GlassColorTemperature } from './GlassColorTemperature';
import { GlassConfirm } from './GlassConfirm';
import { GlassSegmented } from './GlassSegmented';
import { GlassSegmentSelect } from './GlassSegmentSelect';
import { GlassShortcut } from './GlassShortcut';
import { GlassSlider } from './GlassSlider';
import { GlassStepper } from './GlassStepper';
import { GlassSwatches } from './GlassSwatches';
import { GlassSwitch } from './GlassSwitch';
import { GlassTiles } from './GlassTiles';
import { GlassToggle } from './GlassToggle';
import { GlassToggleRow } from './GlassToggleRow';
import { GlassVerticalSlider } from './GlassVerticalSlider';
import { choiceFromKey } from './glassChoice';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const icon = <svg data-testid="icon" />;

describe('choiceFromKey', () => {
  it('moves with the arrows, goes round, and ignores any other key', () => {
    expect(choiceFromKey('ArrowRight', ['a', 'b'], 'a')).toBe('b');
    expect(choiceFromKey('ArrowRight', ['a', 'b'], 'b')).toBe('a');
    expect(choiceFromKey('ArrowLeft', ['a', 'b'], 'a')).toBe('b');
    expect(choiceFromKey('Home', ['a', 'b'], 'b')).toBe('a');
    expect(choiceFromKey('End', ['a', 'b'], 'a')).toBe('b');
    expect(choiceFromKey('ArrowDown', ['a', 'b'], null)).toBe('a');
    expect(choiceFromKey('Enter', ['a', 'b'], 'a')).toBeUndefined();
    expect(choiceFromKey('ArrowRight', [], null)).toBeUndefined();
  });
});

describe('GlassSegmented', () => {
  const options = [
    { value: 'heat', label: 'Caldo', icon },
    { value: 'cool', label: 'Freddo', icon },
  ] as const;

  it('keeps the old name as the same component', () => {
    expect(GlassSegmentSelect).toBe(GlassSegmented);
  });

  it('draws the look it has today when nothing new is asked', () => {
    const { container } = render(<GlassSegmented ariaLabel="Modo" options={[{ value: 'a', label: 'A' }]} value="a" onChange={vi.fn()} />);
    expect(container.firstElementChild?.className).toBe('liquid-segmented-control min-w-0');
    expect(screen.getByRole('radio', { name: 'A' }).textContent).toBe('A');
  });

  it('shows the icon alone and keeps the name for screen readers', () => {
    render(<GlassSegmented ariaLabel="Modo" layout="icon" options={options} value="heat" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Caldo' }).textContent).toBe('');
    expect(screen.getAllByTestId('icon')).toHaveLength(2);
  });

  it('lights up with the colour of the device when asked', () => {
    const { container } = render(<GlassSegmented ariaLabel="Modo" tone="device" options={options} value="heat" onChange={vi.fn()} />);
    expect(container.querySelector('.glass-segmented-device')).toBeTruthy();
  });

  it('moves with the arrows, and not while a command waits', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GlassSegmented ariaLabel="Modo" options={options} value="heat" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('cool');
    onChange.mockClear();
    rerender(<GlassSegmented ariaLabel="Modo" options={options} value="heat" onChange={onChange} pending />);
    expect(screen.getByRole('radiogroup').getAttribute('aria-busy')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GlassChips', () => {
  const options = [
    { value: 'a', label: 'Uno' },
    { value: 'b', label: 'Due' },
    { value: 'c', label: 'Tre', disabled: true },
  ] as const;

  it('makes one choice, with the arrows too', () => {
    const onChange = vi.fn();
    render(<GlassChips ariaLabel="Effetti" options={options} value="a" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Uno' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Due' }));
    expect(onChange).toHaveBeenCalledWith('b');
    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('skips what is not available', () => {
    const onChange = vi.fn();
    render(<GlassChips ariaLabel="Effetti" options={options} value="b" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('adds and removes in a multiple choice', () => {
    function Host() {
      const [value, setValue] = useState<Array<'a' | 'b' | 'c'>>(['a']);
      return <GlassChips multiple ariaLabel="Stanze" options={options} value={value} onChange={setValue} />;
    }
    render(<Host />);
    const due = screen.getByRole('button', { name: 'Due' });
    expect(due.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(due);
    expect(due.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Uno' }));
    expect(screen.getByRole('button', { name: 'Uno' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('cannot be pressed when disabled or while a command waits', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GlassChips ariaLabel="Effetti" options={options} value="a" onChange={onChange} disabled />);
    expect((screen.getByRole('radio', { name: 'Due' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassChips ariaLabel="Effetti" options={options} value="a" onChange={onChange} pending />);
    expect((screen.getByRole('radio', { name: 'Due' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('radiogroup').getAttribute('aria-busy')).toBe('true');
  });
});

describe('GlassSlider, the bar', () => {
  const change = (value: number) => fireEvent.change(screen.getByRole('slider'), { target: { value: String(value) } });

  it('sends while it is dragged by default', () => {
    const onValueChange = vi.fn();
    render(<GlassSlider variant="bar" label="Volume" value={10} onValueChange={onValueChange} />);
    change(30);
    expect(onValueChange).toHaveBeenCalledWith(30);
  });

  it('sends once, when let go, if asked', () => {
    const onValueChange = vi.fn();
    render(<GlassSlider variant="bar" label="Volume" value={10} commit="release" onValueChange={onValueChange} />);
    change(30);
    change(40);
    expect(onValueChange).not.toHaveBeenCalled();
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('40');
    fireEvent.pointerUp(screen.getByRole('slider'));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(40);
  });

  it('fills the whole bar from its start, and is empty when off', () => {
    const { container, rerender } = render(<GlassSlider variant="bar" label="Volume" value={50} onValueChange={vi.fn()} />);
    const fill = () => container.querySelector<HTMLElement>('.glass-bar-fill')!;
    expect(fill().style.width).toBe('max(32px, 50%)');
    rerender(<GlassSlider variant="bar" label="Volume" value={50} off onValueChange={vi.fn()} />);
    expect(fill().style.width).toBe('0px');
  });

  it('writes the value inside the fill, or next to it when the fill is short', () => {
    const { container, rerender } = render(<GlassSlider variant="bar" label="Volume" value={50} valueInFill="50%" onValueChange={vi.fn()} />);
    expect(container.querySelector('.glass-bar-fill .glass-bar-value')?.textContent).toBe('50%');
    rerender(<GlassSlider variant="bar" label="Volume" value={5} valueInFill="5%" onValueChange={vi.fn()} />);
    expect(container.querySelector('.glass-bar-fill .glass-bar-value')).toBeNull();
    expect(container.querySelector('.glass-bar-value.is-outside')?.textContent).toBe('5%');
  });

  it('has names of its steps that can be touched', () => {
    const onValueChange = vi.fn();
    render(<GlassSlider variant="bar" label="Velocità" value={25} step={25} marks={[{ value: 25, label: 'Bassa' }, { value: 50, label: 'Media' }]} onValueChange={onValueChange} />);
    expect(screen.getByRole('button', { name: 'Bassa' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    expect(onValueChange).toHaveBeenCalledWith(50);
  });

  it('is a real range input for the keyboard, with its limits, and blocks when asked', () => {
    const { rerender } = render(<GlassSlider variant="bar" label="Volume" value={10} min={5} max={20} step={5} onValueChange={vi.fn()} />);
    const input = screen.getByRole('slider') as HTMLInputElement;
    expect([input.type, input.min, input.max, input.step]).toEqual(['range', '5', '20', '5']);
    rerender(<GlassSlider variant="bar" label="Volume" value={10} pending onValueChange={vi.fn()} />);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  });

  it('leaves the old slider as it was', () => {
    const { container } = render(<GlassSlider min={0} max={100} value={50} aria-label="Volume" onChange={vi.fn()} />);
    expect(container.querySelector('.liquid-glass-control')).toBeTruthy();
    expect(container.querySelector('.glass-bar')).toBeNull();
  });
});

describe('GlassVerticalSlider', () => {
  it('sends its value, and draws what it is given', () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <GlassVerticalSlider label="Obiettivo" value={22} min={10} max={30} step={0.5} display="22°" subtitle="riscalda a" current={{ value: 20, label: 'ora 20°' }} onValueChange={onValueChange} />,
    );
    const input = screen.getByRole('slider');
    expect(input.getAttribute('aria-orientation')).toBe('vertical');
    expect(screen.getByText('22°')).toBeTruthy();
    expect(screen.getByText('riscalda a')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('.glass-vslider-fill')!.style.height).toBe('60%');
    expect(container.querySelector<HTMLElement>('.glass-vslider-now')!.style.bottom).toBe('50%');
    fireEvent.change(input, { target: { value: '23' } });
    expect(onValueChange).toHaveBeenCalledWith(23);
  });

  it('is compact or the protagonist, and empty when off', () => {
    const { container, rerender } = render(<GlassVerticalSlider label="L" value={50} size="compact" off onValueChange={vi.fn()} />);
    expect(container.querySelector('.glass-vslider.is-compact')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('.glass-vslider-fill')!.style.height).toBe('0%');
    rerender(<GlassVerticalSlider label="L" value={50} onValueChange={vi.fn()} />);
    expect(container.querySelector('.glass-vslider.is-hero')).toBeTruthy();
  });

  it('cannot be moved when disabled or while a command waits', () => {
    const { rerender } = render(<GlassVerticalSlider label="L" value={50} disabled onValueChange={vi.fn()} />);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
    rerender(<GlassVerticalSlider label="L" value={50} pending onValueChange={vi.fn()} />);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('GlassStepper', () => {
  function Host({ start = 20, ...rest }: { start?: number; disabled?: boolean; pending?: boolean; onChange?: (value: number) => void }) {
    const [value, setValue] = useState(start);
    return (
      <GlassStepper
        label="Acqua"
        decreaseLabel="Meno"
        increaseLabel="Più"
        value={value}
        min={18}
        max={22}
        step={0.5}
        showLimits
        format={(entry) => `${entry}°`}
        onValueChange={(next) => {
          rest.onChange?.(next);
          setValue(next);
        }}
        disabled={rest.disabled}
        pending={rest.pending}
      />
    );
  }

  it('moves with − and +, from the keyboard too', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Più' }));
    expect(screen.getByRole('spinbutton').getAttribute('aria-valuenow')).toBe('20.5');
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowDown' });
    expect(screen.getByRole('spinbutton').getAttribute('aria-valuenow')).toBe('19.5');
  });

  it('moves once for a press of the finger, and repeats while held', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const plus = screen.getByRole('button', { name: 'Più' });
    fireEvent.pointerDown(plus);
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(420 + 110 * 2);
    });
    expect(onChange.mock.calls.length).toBeGreaterThan(1);
    fireEvent.pointerUp(plus);
    const afterLift = onChange.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).toHaveBeenCalledTimes(afterLift);
    // The click that follows a finger's press does not move it twice.
    fireEvent.click(plus, { detail: 1 });
    expect(onChange).toHaveBeenCalledTimes(afterLift);
  });

  it('stops at its limit, and shows it', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Host start={21.5} onChange={onChange} />);
    const plus = screen.getByRole('button', { name: 'Più' }) as HTMLButtonElement;
    fireEvent.pointerDown(plus);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(22);
    expect(plus.disabled).toBe(true);
    expect(screen.getByText('22°', { selector: '.is-reached' })).toBeTruthy();
  });

  it('keeps tenths exact', () => {
    const seen: number[] = [];
    render(<GlassStepper label="T" decreaseLabel="M" increaseLabel="P" value={20.1} min={0} max={30} step={0.1} onValueChange={(next) => seen.push(next)} />);
    fireEvent.click(screen.getByRole('button', { name: 'P' }));
    expect(seen).toEqual([20.2]);
  });

  it('cannot be moved when disabled or while a command waits', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Host disabled onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowUp' });
    expect((screen.getByRole('button', { name: 'Più' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Host pending onChange={onChange} />);
    expect((screen.getByRole('button', { name: 'Più' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GlassSwitch', () => {
  it('keeps the old name as the same component', () => {
    expect(GlassToggle).toBe(GlassSwitch);
  });

  it('has the small size and the same behaviour', () => {
    const onChange = vi.fn();
    render(<GlassSwitch label="Programma" size="mini" checked={false} onChange={onChange} />);
    const control = screen.getByRole('switch', { name: 'Programma' });
    expect(control.className).toContain('w-[42px]');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('cannot be pressed while a command waits, under either name of the state', () => {
    const { rerender } = render(<GlassSwitch label="A" checked onChange={vi.fn()} pending />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassSwitch label="A" checked onChange={vi.fn()} busy />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('switch').getAttribute('aria-busy')).toBe('true');
  });
});

describe('GlassToggleRow', () => {
  it('is one control as a whole, named by its title', () => {
    const onChange = vi.fn();
    render(<GlassToggleRow title="Protetta" description="Chiede conferma" icon={icon} checked={false} onChange={onChange} />);
    const row = screen.getByRole('switch');
    expect(row.getAttribute('aria-checked')).toBe('false');
    expect(row.textContent).toContain('Protetta');
    fireEvent.click(screen.getByText('Chiede conferma'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('cannot be pressed when disabled or while a command waits', () => {
    const { rerender } = render(<GlassToggleRow title="A" checked onChange={vi.fn()} disabled />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassToggleRow title="A" checked onChange={vi.fn()} pending />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GlassShortcut', () => {
  it('says whether its controls are open, when it opens them', () => {
    const onPress = vi.fn();
    render(<GlassShortcut kind="opens" label="Timer" icon={icon} on onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Timer' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBeNull();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('says whether it is on, when it acts at once, in the colour of the device', () => {
    render(<GlassShortcut kind="acts" label="Protetta" icon={icon} on onPress={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Protetta' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBeNull();
    expect(button.className).toContain('is-device');
  });

  it('cannot be pressed when disabled or while a command waits', () => {
    const { rerender } = render(<GlassShortcut kind="acts" label="A" icon={icon} onPress={vi.fn()} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassShortcut kind="acts" label="A" icon={icon} onPress={vi.fn()} pending />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GlassButton', () => {
  it('keeps the old variants as they were', () => {
    render(<GlassButton variant="primary">Salva</GlassButton>);
    expect(screen.getByRole('button').className).toBe('glass-button glass-button-primary min-h-11');
  });

  it('has the variants of the panels', () => {
    (['filled', 'soft', 'destructive', 'text'] as const).forEach((variant) => {
      render(<GlassButton variant={variant} size="lg">{variant}</GlassButton>);
      expect(screen.getByRole('button', { name: variant }).className).toContain(`glass-btn-${variant}`);
    });
  });

  it('has round buttons with an icon alone', () => {
    render(<GlassButton variant="soft" size="icon-56" aria-label="Trova" on tone="device">{icon}</GlassButton>);
    const button = screen.getByRole('button', { name: 'Trova' });
    expect(button.className).toContain('glass-btn-icon-56');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('cannot be pressed while a command waits', () => {
    const onClick = vi.fn();
    render(<GlassButton pending onClick={onClick}>Avvia</GlassButton>);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('GlassConfirm', () => {
  const setup = () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<GlassConfirm label="Spegni" confirmLabel="Spegni la presa" cancelLabel="Annulla" onConfirm={onConfirm} onCancel={onCancel} />);
    return { onConfirm, onCancel };
  };

  it('asks in the same place at the first touch, and acts at the second', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annulla' }));
    const action = screen.getByRole('button', { name: 'Spegni la presa' });
    expect(action.className).toContain('glass-btn-destructive');
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Spegni' })).toBeTruthy();
  });

  it('goes back with Cancel, and with Escape', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Spegni' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Annulla' }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not start when disabled or while a command waits', () => {
    const { rerender } = render(<GlassConfirm label="A" confirmLabel="B" cancelLabel="C" onConfirm={vi.fn()} disabled />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassConfirm label="A" confirmLabel="B" cancelLabel="C" onConfirm={vi.fn()} pending />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GlassColorPicker, its states', () => {
  it('cannot be moved while a command waits, and says so', () => {
    const onChange = vi.fn();
    render(<GlassColorPicker label="Colore" value={{ hue: 90, saturation: 50 }} onChange={onChange} pending />);
    const disc = screen.getByRole('slider', { name: 'Colore' });
    expect(disc.getAttribute('aria-busy')).toBe('true');
    fireEvent.keyDown(disc, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a white handle: the note wins over the gallery', () => {
    const { container } = render(<GlassColorPicker label="Colore" value={{ hue: 90, saturation: 50 }} onChange={vi.fn()} />);
    expect(container.querySelector<HTMLElement>('.glass-color-picker-handle')!.style.background).toBe('');
  });
});

describe('GlassColorTemperature', () => {
  const presets = [
    { kelvin: 2700, label: 'Calda' },
    { kelvin: 4000, label: 'Neutra' },
    { kelvin: 6500, label: 'Fredda' },
  ];

  it('moves by 100 K within its limits, as a real range input', () => {
    const onValueChange = vi.fn();
    render(<GlassColorTemperature label="Bianco" value={4000} min={2000} max={6000} onValueChange={onValueChange} />);
    const input = screen.getByRole('slider') as HTMLInputElement;
    expect([input.min, input.max, input.step]).toEqual(['2000', '6000', '100']);
    expect(input.getAttribute('aria-valuetext')).toBe('4000 K');
    fireEvent.change(input, { target: { value: '4100' } });
    expect(onValueChange).toHaveBeenCalledWith(4100);
  });

  it('has quick choices, with the one in use marked', () => {
    const onValueChange = vi.fn();
    render(<GlassColorTemperature label="Bianco" value={4000} presets={presets} onValueChange={onValueChange} />);
    expect(screen.getByRole('button', { name: 'Neutra' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Calda' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Calda' }));
    expect(onValueChange).toHaveBeenCalledWith(2700);
  });

  it('cannot be moved when disabled or while a command waits', () => {
    const { rerender } = render(<GlassColorTemperature label="B" value={4000} presets={presets} disabled onValueChange={vi.fn()} />);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
    rerender(<GlassColorTemperature label="B" value={4000} presets={presets} pending onValueChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Calda' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GlassSwatches', () => {
  const swatches = [
    { value: 'r', color: '#ff0000', label: 'Rosso' },
    { value: 'g', color: '#00ff00', label: 'Verde' },
  ];

  it('makes one choice, with the arrows too', () => {
    const onChange = vi.fn();
    render(<GlassSwatches ariaLabel="Colori" swatches={swatches} value="r" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Rosso' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Rosso' }).className).toContain('is-on');
    fireEvent.click(screen.getByRole('radio', { name: 'Verde' }));
    expect(onChange).toHaveBeenCalledWith('g');
    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('g');
  });

  it('offers the + only where something saves the colour', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<GlassSwatches ariaLabel="Colori" swatches={swatches} value="r" onChange={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<GlassSwatches ariaLabel="Colori" swatches={swatches} value="r" onChange={vi.fn()} onAdd={onAdd} addLabel="Salva" />);
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('cannot be pressed when disabled or while a command waits', () => {
    const { rerender } = render(<GlassSwatches ariaLabel="C" swatches={swatches} value="r" onChange={vi.fn()} disabled />);
    expect((screen.getByRole('radio', { name: 'Verde' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassSwatches ariaLabel="C" swatches={swatches} value="r" onChange={vi.fn()} pending />);
    expect((screen.getByRole('radio', { name: 'Verde' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GlassTiles', () => {
  const options = [
    { value: 'comfort', label: 'Comfort', icon },
    { value: 'eco', label: 'Eco', icon },
    { value: 'boost', label: 'Boost', icon, disabled: true },
  ] as const;

  it('makes one choice, skipping what is not available', () => {
    const onChange = vi.fn();
    render(<GlassTiles ariaLabel="Profilo" options={options} value="eco" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Eco' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('comfort');
    onChange.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Comfort' }));
    expect(onChange).toHaveBeenCalledWith('comfort');
  });

  it('cannot be pressed when disabled or while a command waits', () => {
    const { rerender } = render(<GlassTiles ariaLabel="P" options={options} value="eco" onChange={vi.fn()} disabled />);
    expect((screen.getByRole('radio', { name: 'Comfort' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<GlassTiles ariaLabel="P" options={options} value="eco" onChange={vi.fn()} pending />);
    expect((screen.getByRole('radio', { name: 'Comfort' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
