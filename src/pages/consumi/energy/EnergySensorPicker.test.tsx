import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnergySensorPicker } from './EnergySensorPicker';
import type { SensorOption } from './energySensorCatalog';

afterEach(cleanup);

const OPTIONS: SensorOption[] = [
  { id: 'sensor.inv1', name: 'Inverter Tetto', unit: 'W', device: 'Tetto', problem: null },
  { id: 'sensor.inv2', name: 'Inverter Pergola', unit: 'W', device: null, problem: null },
  { id: 'sensor.inv3', name: 'Inverter Garage', unit: 'W', device: null, problem: null },
  { id: 'sensor.pv_kwh', name: 'Energia prodotta', unit: 'kWh', device: null, problem: 'È un contatore di energia (kWh), non una potenza' },
];

function renderPicker(value = '', taken: Record<string, string> = {}) {
  const onChange = vi.fn();
  render(
    <div onKeyDown={(event) => { if (event.key === 'Escape') onChange('closed-dialog'); }}>
      <label htmlFor="pick">Produzione</label>
      <EnergySensorPicker id="pick" value={value} options={OPTIONS} taken={taken} onChange={onChange} />
    </div>,
  );
  return { onChange, input: screen.getByRole('combobox', { name: 'Produzione' }) };
}

describe('Energy sensor picker', () => {
  it('hides incompatible sensors until asked, and never lets them be chosen', () => {
    const { onChange, input } = renderPicker();
    fireEvent.focus(input);
    const list = screen.getByRole('listbox', { name: 'Sensori disponibili' });
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    fireEvent.click(screen.getByLabelText('Mostra anche i 1 sensori non compatibili'));
    const incompatible = within(list).getByRole('option', { name: /Energia prodotta/ });
    expect(incompatible.getAttribute('aria-disabled')).toBe('true');
    expect(within(incompatible).getByText(/non una potenza/)).not.toBeNull();
    fireEvent.mouseDown(incompatible);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters by name or id, skips sensors used elsewhere and works from the keyboard', () => {
    const { onChange, input } = renderPicker('', { 'sensor.inv2': 'Inverter 2' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'inverter' } });
    expect(onChange).toHaveBeenLastCalledWith('inverter');
    const list = screen.getByRole('listbox');
    expect(within(list).getByText('Già usato da Inverter 2')).not.toBeNull();
    // Down from the first option skips the one already used.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('pick-options-2');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('sensor.inv3');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'tetto' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'nessuno' } });
    expect(screen.getByText(/Puoi scrivere l’identificativo per intero/)).not.toBeNull();
  });

  it('accepts an id Home Assistant does not list, and closes only its list on Escape', () => {
    const { onChange, input } = renderPicker();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: ' opower:grid_export ' } });
    expect(onChange).toHaveBeenLastCalledWith('opower:grid_export');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalledWith('closed-dialog');
  });
});
