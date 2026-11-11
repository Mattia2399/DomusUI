import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import PanelEditor from './PanelEditor';
import type { PanelEditorProps } from './panelEditorTypes';
import { copyRuleToCard, removeRule, typeRuleBreakpoints } from './typeRule';
import { PanelServicesProvider, type PanelServices } from '../devices/panels/panelServicesContext';

afterEach(cleanup);

const LAMP: Widget = { id: 'lamp', kind: 'light', title: 'Lampada', entityId: 'light.lamp', dataSource: 'ha', status: 'on', isOn: true, layout: { i: 'lamp', x: 4, y: 6, w: 2, h: 4 } };

function setup(extra: Partial<PanelEditorProps> = {}, services?: PanelServices) {
  const calls = {
    pick: vi.fn(),
    setGrowth: vi.fn(),
    setForCard: vi.fn(),
    setForType: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    done: vi.fn(),
  };
  let widget = LAMP;
  const props: PanelEditorProps = {
    widget,
    compact: true,
    breakpoint: 'xl',
    cardPreview: <div>card</div>,
    size: {
      options: [
        { id: 'mini', label: 'Mini', w: 2, h: 2 },
        { id: 'standard', label: 'Standard', w: 2, h: 4 },
        { id: 'expanded', label: 'Espansa', w: 4, h: 4 },
      ],
      active: 'standard',
      current: { w: 2, h: 4 },
      pick: calls.pick,
    },
    lightGrowth: { on: true, available: true, set: calls.setGrowth },
    overrides: { byType: undefined, byCard: undefined, setForCard: calls.setForCard, setForType: calls.setForType },
    haStates: {},
    onUpdateWidget: (id, update) => {
      widget = update(widget);
      calls.update(id, widget);
    },
    onRemove: calls.remove,
    onDone: calls.done,
    ...extra,
  };
  render(services ? <PanelServicesProvider value={services}><PanelEditor {...props} /></PanelServicesProvider> : <PanelEditor {...props} />);
  return calls;
}

describe('the three tabs', () => {
  it('keeps demo room suggestions while real offline room suggestions remain unavailable', () => {
    const props: Partial<PanelEditorProps> = {
      haStates: { 'light.lamp': { state: 'on' }, 'light.other': { state: 'on' } },
      haEntityIds: ['light.lamp', 'light.other'],
      entityRegistry: [{ entityId: 'light.lamp', areaId: 'a' }, { entityId: 'light.other', areaId: 'a' }],
      areas: [{ area_id: 'a', name: 'Sala' }],
    };
    const services: PanelServices = { callApi: vi.fn(), callService: vi.fn(), houseConnected: false, houseContext: null, houseDemo: true };
    setup(props, services);
    fireEvent.click(screen.getByRole('radio', { name: 'Dispositivo' }));
    fireEvent.click(screen.getByRole('button', { name: /Entit/ }));
    expect(screen.getByText('Nella stessa stanza')).toBeTruthy();
    cleanup();
    setup(props, { ...services, houseDemo: false });
    fireEvent.click(screen.getByRole('radio', { name: 'Dispositivo' }));
    fireEvent.click(screen.getByRole('button', { name: /Entit/ }));
    expect(screen.queryByText('Nella stessa stanza')).toBeNull();
  });
  it('opens on Aspetto, with Dispositivo and Controlli beside it', () => {
    setup();
    const tabs = screen.getByRole('radiogroup', { name: 'Modifica della card' });
    expect(within(tabs).getAllByRole('radio').map((tab) => tab.textContent)).toEqual(['Aspetto', 'Dispositivo', 'Controlli']);
    expect(within(tabs).getByRole('radio', { name: 'Aspetto' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Aspetto', () => {
  it('applies a size as soon as it is touched, with the function of today', () => {
    const calls = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Espansa, 4×4' }));
    expect(calls.pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'expanded', w: 4, h: 4 }));
  });

  it('shows an older size as it is', () => {
    setup({ size: { options: [{ id: 'mini', label: 'Mini', w: 2, h: 2 }], active: null, current: { w: 3, h: 4 }, pick: vi.fn() } });
    expect(screen.getByRole('radio', { name: /Attuale · 3×4/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('a light grows, or stays Mini', () => {
    const calls = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Resta Mini' }));
    expect(calls.setGrowth).toHaveBeenCalledWith(false);
  });

  it('only a light has that choice', () => {
    setup({ lightGrowth: undefined });
    expect(screen.queryByRole('radio', { name: 'Resta Mini' })).toBeNull();
  });

  it('the name opens as a row and saves on the card, and there is no row for the icon', () => {
    const calls = setup();
    expect(screen.queryByRole('button', { name: /Icona/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nome/ }));
    const field = screen.getByRole('textbox', { name: 'Nome' });
    fireEvent.change(field, { target: { value: 'Lampada sala' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(calls.update).toHaveBeenCalledWith('lamp', expect.objectContaining({ title: 'Lampada sala', layout: LAMP.layout }));
  });

  it('takes the card away from the Home only after asking', () => {
    const calls = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Togli la card dalla Home' }));
    expect(calls.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/Il dispositivo resta in Home Assistant/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Togli la card dalla Home' }));
    expect(calls.remove).toHaveBeenCalledTimes(1);
  });
});

describe('the size rule of a kind', () => {
  const RULE = { xl: { w: 2, h: 2 }, md: { w: 2, h: 2 } };

  it('is the size of the card where the card has none of its own', () => {
    expect(typeRuleBreakpoints(RULE, undefined)).toEqual(['xl', 'md']);
    expect(typeRuleBreakpoints(RULE, { xl: { w: 4, h: 4 } })).toEqual(['md']);
    expect(typeRuleBreakpoints(undefined, undefined)).toEqual([]);
  });

  it('copies to the card, or goes away for all', () => {
    const setForCard = vi.fn();
    copyRuleToCard(RULE, ['xl', 'md'], setForCard);
    expect(setForCard.mock.calls).toEqual([['xl', { w: 2, h: 2 }], ['md', { w: 2, h: 2 }]]);
    const setForType = vi.fn();
    removeRule(RULE, setForType);
    expect(setForType.mock.calls).toEqual([['xl', null], ['md', null]]);
  });

  it('without a rule there is no notice', () => {
    setup();
    expect(screen.queryByText(/Misura uguale/)).toBeNull();
  });

  it('with one, the notice and its two actions', () => {
    setup({ overrides: { byType: RULE, byCard: undefined, setForCard: vi.fn(), setForType: vi.fn() } });
    expect(screen.getByText('Misura uguale per tutte le card Luce')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Usa una misura solo per questa card' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Togli la regola per tutte' })).toBeTruthy();
  });

  it('a card with its own size at this width has no notice', () => {
    setup({ overrides: { byType: { xl: { w: 2, h: 2 } }, byCard: { xl: { w: 4, h: 4 } }, setForCard: vi.fn(), setForType: vi.fn() } });
    expect(screen.queryByText(/Misura uguale/)).toBeNull();
  });

  it('the card takes the rule as its own', () => {
    const setForCard = vi.fn();
    setup({ overrides: { byType: RULE, byCard: undefined, setForCard, setForType: vi.fn() } });
    fireEvent.click(screen.getByRole('button', { name: 'Usa una misura solo per questa card' }));
    expect(setForCard).toHaveBeenCalledWith('xl', { w: 2, h: 2 });
    expect(setForCard).toHaveBeenCalledWith('md', { w: 2, h: 2 });
  });

  it('the rule goes away only after asking', () => {
    const setForType = vi.fn();
    setup({ overrides: { byType: RULE, byCard: undefined, setForCard: vi.fn(), setForType } });
    fireEvent.click(screen.getByRole('button', { name: 'Togli la regola per tutte' }));
    expect(setForType).not.toHaveBeenCalled();
    expect(screen.getByText(/Le card Luce tornano alla loro misura/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Togli la regola per tutte' }));
    expect(setForType.mock.calls).toEqual([['xl', null], ['md', null]]);
  });
});

describe('where it opens', () => {
  it('on a tablet or a desktop: the same single column, in the place of the panels, with no dialog', () => {
    setup({ compact: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('panel-editor').className).toContain('is-column');
    expect(screen.getByRole('radiogroup', { name: 'Modifica della card' })).toBeTruthy();
  });

  it('the head has the name of the card and Fine, which leaves it', () => {
    for (const compact of [false, true]) {
      const calls = setup({ compact });
      expect(screen.getByRole('banner').textContent).toContain('Lampada');
      fireEvent.click(screen.getByRole('button', { name: 'Fine' }));
      expect(calls.done).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });
});

void React;
