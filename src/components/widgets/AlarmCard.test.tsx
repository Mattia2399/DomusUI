import React from 'react';
import { cleanup, fireEvent, render as renderUi } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { AlarmCard } from './AlarmCard';
import { createHomeAlarmMock } from './alarmMock';
import { I18nProvider } from '../../i18n/I18nProvider';

const render = (ui: React.ReactElement) => {
  window.localStorage.setItem('domusui.language.v1', 'it');
  return renderUi(<I18nProvider>{ui}</I18nProvider>);
};

const widget: Widget = {
  id: 'alarm.test',
  kind: 'alarm',
  title: 'Allarme Casa',
  entityId: 'alarm_control_panel.home_alarm',
  status: 'disarmed',
  isOn: false,
  layout: { i: 'alarm.test', x: 0, y: 0, w: 3, h: 3 },
};

describe('AlarmCard responsive safety compositions', () => {
  afterEach(cleanup);

  it('keeps the compact composition concise and actionable', () => {
    const { getByLabelText, getByRole } = render(
      <AlarmCard
        widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 2 } }}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        liveEntity={createHomeAlarmMock()}
      />,
    );

    expect(getByLabelText('Allarme Casa, Disinserito').getAttribute('data-alarm-variant')).toBe('compact');
    fireEvent.click(getByRole('button', { name: 'Inserisci' }));
    expect(getByRole('dialog', { name: 'Scegli modalità allarme' })).not.toBeNull();
    expect(getByRole('button', { name: 'Inserisci modalità Casa' })).not.toBeNull();
  });

  it('opens the supported-mode drawer before arming in the standard composition', () => {
    const onQuickArm = vi.fn();
    const { getByRole, queryByRole } = render(
      <AlarmCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onQuickArm={onQuickArm}
        liveEntity={createHomeAlarmMock()}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Inserisci' }));
    expect(getByRole('dialog', { name: 'Scegli modalità allarme' })).not.toBeNull();
    fireEvent.click(getByRole('button', { name: 'Inserisci modalità Notte' }));
    expect(onQuickArm).toHaveBeenCalledWith('night');
    expect(queryByRole('dialog', { name: 'Scegli modalità allarme' })).toBeNull();
  });

  it('offers only disarming as the primary action when triggered', () => {
    const onQuickDisarm = vi.fn();
    const { getByRole, queryByRole } = render(
      <AlarmCard
        widget={{ ...widget, layout: { ...widget.layout, w: 3, h: 4 } }}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onQuickDisarm={onQuickDisarm}
        liveEntity={{ ...createHomeAlarmMock(), state: 'triggered', stateLabel: 'triggered' }}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Disattiva' }));
    expect(onQuickDisarm).toHaveBeenCalledOnce();
    expect(queryByRole('radio', { name: 'Seleziona modalità Casa' })).toBeNull();
  });

  it('shows inline modes and details in the full composition', () => {
    const onQuickArm = vi.fn();
    const { getByRole, getByText } = render(
      <AlarmCard
        widget={{ ...widget, layout: { ...widget.layout, w: 3, h: 4 } }}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onQuickArm={onQuickArm}
        liveEntity={createHomeAlarmMock()}
      />,
    );

    expect(getByRole('radio', { name: 'Seleziona modalità Casa' })).not.toBeNull();
    expect(getByText('Dashboard Demo')).not.toBeNull();
    fireEvent.click(getByRole('radio', { name: 'Seleziona modalità Notte' }));
    fireEvent.click(getByRole('button', { name: 'Inserisci Notte' }));
    expect(onQuickArm).toHaveBeenCalledWith('night');
  });

  it('communicates mode changes through the full primary action', () => {
    const onQuickArm = vi.fn();
    const { getByRole } = render(
      <AlarmCard
        widget={{ ...widget, layout: { ...widget.layout, w: 3, h: 4 } }}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onQuickArm={onQuickArm}
        liveEntity={{ ...createHomeAlarmMock(), state: 'armed_home', stateLabel: 'armed_home' }}
      />,
    );

    fireEvent.click(getByRole('radio', { name: 'Seleziona modalità Notte' }));
    fireEvent.click(getByRole('button', { name: 'Passa a Notte' }));
    expect(onQuickArm).toHaveBeenCalledWith('night');
  });

  it('disarms an armed system through the primary action', () => {
    const onQuickDisarm = vi.fn();
    const { getByRole } = render(
      <AlarmCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onQuickDisarm={onQuickDisarm}
        liveEntity={{ ...createHomeAlarmMock(), state: 'armed_home', stateLabel: 'armed_home' }}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Disinserisci' }));
    expect(onQuickDisarm).toHaveBeenCalledOnce();
  });
});
