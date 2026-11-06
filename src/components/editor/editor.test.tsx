import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { relatedChoiceOf } from '../devices/panels/related/relatedControlRegistry';
import { relatedModelOf } from '../devices/panels/related/relatedModel';
import { EntityPicker, entityRoleOf, groupEntities, type PickerEntity } from './EntityPicker';
import { FoldRow, useOneOpen } from './FoldRow';
import { IconPicker } from './IconPicker';
import { EDITOR_ICONS } from './editorIcons';
import { LookPicker } from './LookPicker';
import { moveItem, placeAmong, ReorderList } from './ReorderList';
import { SizePicker } from './SizePicker';

afterEach(cleanup);

const ENTITIES: PickerEntity[] = [
  { entityId: 'sensor.stufa_fumi', name: 'Fumi', areaId: 'living', areaName: 'Soggiorno', deviceId: 'stove' },
  { entityId: 'number.stufa_potenza', name: 'Potenza fiamma', areaId: 'living', areaName: 'Soggiorno', deviceId: 'stove' },
  { entityId: 'sensor.soggiorno_umidita', name: 'Umidità', areaId: 'living', areaName: 'Soggiorno' },
  { entityId: 'sensor.boiler', name: 'Boiler ACS', areaId: 'laundry', areaName: 'Lavanderia' },
  { entityId: 'switch.priorita', name: 'Priorità ACS', areaId: 'laundry', areaName: 'Lavanderia' },
  { entityId: 'light.garden', name: 'Giardino' },
];
const NEAR = { deviceId: 'stove', areaId: 'living' };
const ids = (list: PickerEntity[]) => list.map((entity) => entity.entityId);

describe('EntityPicker', () => {
  it('puts the nearest first: the same device, the same room, the others', () => {
    const groups = groupEntities(ENTITIES, { near: NEAR });
    expect(ids(groups.sameDevice)).toEqual(['sensor.stufa_fumi', 'number.stufa_potenza']);
    expect(ids(groups.sameRoom)).toEqual(['sensor.soggiorno_umidita']);
    expect(ids(groups.others)).toEqual(['sensor.boiler', 'light.garden', 'switch.priorita']);
  });

  it('finds by name, room or id, without minding accents and capitals', () => {
    expect(ids(groupEntities(ENTITIES, { query: 'umidita' }).others)).toEqual(['sensor.soggiorno_umidita']);
    expect(ids(groupEntities(ENTITIES, { query: 'lavanderia' }).others)).toEqual(['sensor.boiler', 'switch.priorita']);
    expect(ids(groupEntities(ENTITIES, { query: 'number.stufa' }).others)).toEqual(['number.stufa_potenza']);
    expect(ids(groupEntities(ENTITIES, { query: 'acs lavand' }).others)).toEqual(['sensor.boiler', 'switch.priorita']);
  });

  it('filters what can be commanded and what can only be read', () => {
    expect(entityRoleOf('sensor.a')).toBe('read');
    expect(entityRoleOf('binary_sensor.a')).toBe('read');
    expect(entityRoleOf('switch.a')).toBe('control');
    expect(ids(groupEntities(ENTITIES, { filter: 'control' }).others)).toEqual(['light.garden', 'number.stufa_potenza', 'switch.priorita']);
    expect(ids(groupEntities(ENTITIES, { filter: 'read' }).others)).toEqual(['sensor.boiler', 'sensor.stufa_fumi', 'sensor.soggiorno_umidita']);
  });

  it('keeps only the types that fit', () => {
    expect(ids(groupEntities(ENTITIES, { compatible: (entityId) => entityId.startsWith('light.') }).others)).toEqual(['light.garden']);
  });

  it('shows what is already used, but does not let it be chosen', () => {
    const onPick = vi.fn();
    render(<EntityPicker entities={ENTITIES} near={NEAR} used={new Set(['sensor.boiler'])} onPick={onPick} />);
    const used = screen.getByRole('button', { name: /Boiler ACS/ });
    expect(used.textContent).toContain('Già nel pannello');
    expect((used as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Potenza fiamma/ }));
    expect(onPick).toHaveBeenCalledWith('number.stufa_potenza');
  });

  it('searches and filters on screen, with its groups', () => {
    render(<EntityPicker entities={ENTITIES} near={NEAR} onPick={() => undefined} />);
    expect(screen.getByText('Dello stesso dispositivo')).toBeTruthy();
    expect(screen.getByText('Nella stessa stanza')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Da leggere' }));
    expect(screen.queryByRole('button', { name: /Giardino/ })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nessuna entità trovata')).toBeTruthy();
  });
});

describe('FoldRow', () => {
  function Rows() {
    const fold = useOneOpen<'name' | 'icon'>();
    return (
      <>
        <FoldRow label="Nome" value="Termostufa" open={fold.isOpen('name')} onToggle={() => fold.toggle('name')}>
          <span>campo del nome</span>
        </FoldRow>
        <FoldRow label="Icona" value="Fiamma" open={fold.isOpen('icon')} onToggle={() => fold.toggle('icon')}>
          <span>scelta dell’icona</span>
        </FoldRow>
      </>
    );
  }

  it('opens on its control, one at a time', () => {
    render(<Rows />);
    const name = screen.getByRole('button', { name: /Nome/ });
    expect(name.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(name);
    expect(screen.getByText('campo del nome')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Icona/ }));
    expect(screen.queryByText('campo del nome')).toBeNull();
    expect(screen.getByText('scelta dell’icona')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Icona/ }));
    expect(screen.queryByText('scelta dell’icona')).toBeNull();
  });
});

describe('IconPicker and SizePicker', () => {
  it('chooses an icon by key, and Automatica goes back to the one of the device', () => {
    const onChange = vi.fn();
    render(<IconPicker label="Icona" value="flame" onChange={onChange} icons={EDITOR_ICONS} />);
    expect(screen.getByRole('radio', { name: 'Fiamma' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Stufa' }));
    expect(onChange).toHaveBeenCalledWith('heater');
    fireEvent.click(screen.getByRole('radio', { name: 'Automatica' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  const SIZES = [
    { id: 'mini', label: 'Mini', w: 2, h: 2 },
    { id: 'standard', label: 'Standard', w: 2, h: 4 },
    { id: 'expanded', label: 'Espansa', w: 4, h: 4 },
    { id: 'wide', label: 'Larga', w: 6, h: 4, available: false },
  ];

  it('shows an older size as it is until another is chosen', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SizePicker label="Misura" options={SIZES} value={null} current={{ w: 3, h: 4 }} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Attuale · 3×4/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Espansa, 4×4' }));
    expect(onChange).toHaveBeenCalledWith(SIZES[2]);
    rerender(<SizePicker label="Misura" options={SIZES} value="mini" onChange={onChange} />);
    expect(screen.queryByText(/Attuale/)).toBeNull();
    expect(screen.getByRole('radio', { name: 'Mini, 2×2' }).getAttribute('aria-checked')).toBe('true');
  });

  it('a size this card cannot take is shown but not chosen', () => {
    render(<SizePicker label="Misura" options={SIZES} value="mini" onChange={() => undefined} />);
    expect((screen.getByRole('radio', { name: 'Larga, 6×4' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ReorderList', () => {
  it('moves one place at a time within the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'a', 5)).toEqual(['b', 'c', 'a']);
    expect(placeAmong([10, 30, 50], 5)).toBe(0);
    expect(placeAmong([10, 30, 50], 35)).toBe(2);
    expect(placeAmong([10, 30, 50], 90)).toBe(2);
  });

  function List({ onReorder }: { onReorder: (ids: string[]) => void }) {
    const [items, setItems] = useState([{ id: 'a', name: 'Modalità' }, { id: 'b', name: 'Potenza' }, { id: 'c', name: 'Acqua' }]);
    return (
      <ReorderList
        label="Ordine"
        items={items}
        renderItem={(item) => <span>{item.name}</span>}
        onReorder={(next) => {
          onReorder(next);
          setItems(next.map((id) => items.find((item) => item.id === id)!));
        }}
      />
    );
  }

  it('moves with the arrow keys on the handle and says where', () => {
    const onReorder = vi.fn();
    render(<List onReorder={onReorder} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Trascina Acqua' }), { key: 'ArrowUp' });
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
    expect(screen.getByText('Acqua in posizione 2')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Trascina Modalità' }), { key: 'ArrowUp' });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it('a drag that ends where it started changes nothing', () => {
    const onReorder = vi.fn();
    render(<List onReorder={onReorder} />);
    const handle = screen.getByRole('button', { name: 'Trascina Potenza' });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe('LookPicker', () => {
  const choiceOf = (entityId: string, state: Parameters<typeof relatedModelOf>[1]) => relatedChoiceOf(entityId, relatedModelOf(entityId, state));

  it('offers what the registry offers, in plain words, the recommended one marked', () => {
    const choice = choiceOf('number.potenza', { state: '3', rawAttributes: { min: 1, max: 5, step: 1 } });
    render(<LookPicker label="Aspetto" looks={choice.looks} recommended={choice.recommended} value={choice.recommended} onChange={() => undefined} />);
    const rows = within(screen.getByRole('radiogroup', { name: 'Aspetto' })).getAllByRole('radio');
    expect(rows[0].textContent).toBe('LivelliConsigliato');
    expect(rows.map((row) => row.textContent?.replace('Consigliato', ''))).toEqual(choice.looks.map((look) => ({ levels: 'Livelli', stepper: 'Pulsanti + e −', bar: 'Barra', arrows: 'Frecce', 'bar-value': 'Barra con il numero', 'number-input': 'Campo numerico', 'ring-slider': 'Anello', keypad: 'Tastierino' })[look]));
  });

  it('for a select with few options the side by side buttons, with more a menu', () => {
    expect(choiceOf('select.modo', { state: 'a', rawAttributes: { options: ['a', 'b', 'c'] } }).recommended).toBe('segmented');
    expect(choiceOf('select.modo', { state: 'a', rawAttributes: { options: ['a', 'b', 'c', 'd', 'e'] } }).recommended).toBe('menu');
  });

  it('a temperature is a value with its scale', () => {
    const choice = choiceOf('sensor.boiler', { state: '48', rawAttributes: { device_class: 'temperature', unit_of_measurement: '°C' } });
    render(<LookPicker label="Aspetto" looks={choice.looks} recommended={choice.recommended} value="value" onChange={() => undefined} />);
    expect(screen.getByRole('radio', { name: /Valore con scala/ }).textContent).toContain('Consigliato');
    expect(screen.getByRole('radio', { name: /^Valore$/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('never offers the looks of several entities', () => {
    render(<LookPicker label="Aspetto" looks={['value', 'checkbox', 'curve']} value="value" onChange={() => undefined} />);
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('shows the real control, compact and large, and changes it', () => {
    const onChange = vi.fn();
    render(<LookPicker label="Aspetto" looks={['levels', 'stepper']} value="levels" onChange={onChange} preview={(look, form) => <span>{`${look} ${form}`}</span>} />);
    expect(screen.getByText('levels compact')).toBeTruthy();
    expect(screen.getByText('levels hero')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Pulsanti + e −' }));
    expect(onChange).toHaveBeenCalledWith('stepper');
  });
});
