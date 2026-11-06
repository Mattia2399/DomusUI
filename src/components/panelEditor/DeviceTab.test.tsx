import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityStateMap } from '../../types/ha';
import { DeviceTab } from './DeviceTab';
import { cardEntityIdsOf, fitsRole, pickerEntitiesOf, sameDeviceEntity } from './deviceEntities';

const security = vi.hoisted(() => ({ can: true, unlocked: false, authorize: vi.fn() }));
vi.mock('../../security/dashboardAccess', () => ({ useDashboardSecurity: () => ({ can: () => security.can }) }));
vi.mock('../../security/SensitiveActionGate', () => ({ useSensitiveActionGate: () => ({ isUnlocked: security.unlocked, authorize: security.authorize }) }));

afterEach(cleanup);
beforeEach(() => {
  security.can = true;
  security.unlocked = false;
  security.authorize.mockReset();
  localStorage.clear();
});

const STATES: MockEntityStateMap = {
  'light.sala': { state: 'on', rawAttributes: { friendly_name: 'Luce sala' } },
  'light.cucina': { state: 'off', rawAttributes: { friendly_name: 'Luce cucina' } },
  'switch.tv': { state: 'on', rawAttributes: { friendly_name: 'Presa TV' } },
  'sensor.tv_power': { state: '80', rawAttributes: { friendly_name: 'Potenza TV', device_class: 'power', unit_of_measurement: 'W' } },
  'sensor.tv_battery': { state: '50', rawAttributes: { friendly_name: 'Batteria TV', device_class: 'battery' } },
  'lock.porta': { state: 'locked', rawAttributes: { friendly_name: 'Porta' } },
  'sensor.porta_battery': { state: '80', rawAttributes: { friendly_name: 'Batteria porta', device_class: 'battery', unit_of_measurement: '%' } },
  'sensor.temperatura': { state: '21', rawAttributes: { friendly_name: 'Temperatura', device_class: 'temperature', battery_level: 90 } },
  'sensor.contatore': { state: '1.2', rawAttributes: { friendly_name: 'Contatore', device_class: 'power', unit_of_measurement: 'kW' } },
};
const REGISTRY = [
  { entityId: 'switch.tv', deviceId: 'tv', areaId: 'sala' },
  { entityId: 'sensor.tv_power', deviceId: 'tv', areaId: 'sala' },
  { entityId: 'lock.porta', deviceId: 'porta' },
  { entityId: 'sensor.porta_battery', deviceId: 'porta' },
];
const AREAS = [{ area_id: 'sala', name: 'Sala' }];
const card = (extra: Partial<Widget>): Widget => ({ id: 'c', kind: 'light', title: 'Card', entityId: 'light.sala', dataSource: 'ha', status: 'on', isOn: true, layout: { i: 'c', x: 3, y: 5, w: 2, h: 4 }, ...extra });

function setup(widget: Widget) {
  let current = widget;
  const onUpdateWidget = vi.fn((_: string, change: (widget: Widget) => Widget) => {
    current = change(current);
  });
  render(<DeviceTab widget={widget} haStates={STATES} entityRegistry={REGISTRY} areas={AREAS} haEntityIds={Object.keys(STATES)} entityOptions={{} as never} onUpdateWidget={onUpdateWidget} />);
  return { saved: () => current, onUpdateWidget };
}

describe('the entities it can choose from', () => {
  it('by name, with their room and device', () => {
    const entities = pickerEntitiesOf(['switch.tv', 'sensor.x'], STATES, REGISTRY, AREAS);
    expect(entities[0]).toEqual({ entityId: 'switch.tv', name: 'Presa TV', areaId: 'sala', areaName: 'Sala', deviceId: 'tv' });
    expect(entities[1].name).toBe('sensor.x');
  });

  it('only those the kind can command', () => {
    expect(cardEntityIdsOf('light', Object.keys(STATES))).toEqual(['light.sala', 'light.cucina']);
    expect(cardEntityIdsOf('light', [], ['light.demo'])).toEqual(['light.demo']);
  });

  it('what fits a part, and one of the same device first', () => {
    expect(fitsRole('consumption', 'sensor.tv_power', STATES)).toBe(true);
    expect(fitsRole('consumption', 'sensor.tv_battery', STATES)).toBe(false);
    expect(fitsRole('battery', 'sensor.tv_battery', STATES)).toBe(true);
    expect(sameDeviceEntity('consumption', 'switch.tv', STATES, REGISTRY)).toBe('sensor.tv_power');
    expect(sameDeviceEntity('consumption', 'switch.tv', STATES, [])).toBeUndefined();
  });
});

describe('Dispositivo', () => {
  it('chooses the entity by name, never by typing it, and saves it with its source', () => {
    const { saved } = setup(card({}));
    fireEvent.click(screen.getByRole('button', { name: /Entità/ }));
    expect(screen.queryByRole('button', { name: /Presa TV/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Luce cucina/ }));
    expect(saved()).toMatchObject({ entityId: 'light.cucina', dataSource: 'ha', layout: { x: 3, y: 5, w: 2, h: 4 } });
  });

  it('a lock finds its battery by itself, and it can be changed and given back', () => {
    const { saved } = setup(card({ kind: 'lock', entityId: 'lock.porta' }));
    expect(screen.getByRole('button', { name: /Batteria/ }).textContent).toContain('Batteria porta · Trovata da sola');
    fireEvent.click(screen.getByRole('button', { name: /Batteria/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Batteria TV/ }));
    expect(saved().lockBatteryEntityId).toBe('sensor.tv_battery');
    cleanup();
    const again = setup(card({ kind: 'lock', entityId: 'lock.porta', lockBatteryEntityId: 'sensor.tv_battery' }));
    fireEvent.click(screen.getByRole('button', { name: /Batteria/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Torna automatica' }));
    expect(again.saved().lockBatteryEntityId).toBeUndefined();
  });

  it('a plug is offered the meter of its own device', () => {
    const { saved } = setup(card({ kind: 'switch', entityId: 'switch.tv' }));
    fireEvent.click(screen.getByRole('button', { name: /Consumo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Usa Potenza TV' }));
    expect(saved().switchConsumptionEntityId).toBe('sensor.tv_power');
  });

  it('a sensor says when it reads its own attributes', () => {
    setup(card({ kind: 'sensor', entityId: 'sensor.temperatura' }));
    expect(screen.getByRole('button', { name: /Batteria/ }).textContent).toContain('Dagli attributi del sensore');
  });

  it('a sensor has its decimals in words, and a power meter its limit', () => {
    const { saved } = setup(card({ kind: 'sensor', entityId: 'sensor.contatore' }));
    expect(screen.getByRole('button', { name: /Decimali/ }).textContent).toContain('Automatici');
    expect(screen.getByRole('button', { name: /Potenza del contatore/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Decimali/ }));
    fireEvent.click(screen.getByRole('radio', { name: '2 decimali' }));
    expect(saved().sensorDisplayPrecision).toBe(2);
  });

  it('the codes stay locked until the security is unlocked', () => {
    setup(card({ kind: 'alarm', entityId: 'alarm_control_panel.casa' }));
    expect(screen.queryByLabelText('PIN di Home Assistant')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sblocca la sicurezza' }));
    expect(security.authorize).toHaveBeenCalledWith(expect.objectContaining({ action: 'view_security_codes', capability: 'manage_security_config' }));
  });

  it('once unlocked, the codes go to their own place, never into the card', () => {
    security.unlocked = true;
    const { saved } = setup(card({ kind: 'lock', entityId: 'lock.porta' }));
    const field = screen.getByLabelText('Codice della serratura');
    fireEvent.change(field, { target: { value: '2580' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(JSON.stringify(saved())).not.toContain('2580');
    fireEvent.click(screen.getByRole('switch', { name: /Conferma con il dispositivo/ }));
    expect(saved().lockRequireAuthToUnlock).toBe(true);
  });

  it('without the right to manage security there is no section', () => {
    security.can = false;
    setup(card({ kind: 'alarm', entityId: 'alarm_control_panel.casa' }));
    expect(screen.queryByText('Sicurezza')).toBeNull();
  });

  it('the history of an alarm or a lock, in words', () => {
    setup(card({ kind: 'alarm', entityId: 'alarm_control_panel.casa', activityLogHours: 48 }));
    expect(screen.getByRole('button', { name: /Ore di storico/ }).textContent).toContain('48 ore');
    expect(screen.getByRole('button', { name: /Eventi visibili/ }).textContent).toContain('6');
  });
});

void React;
