// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlarmCard, toAlarmModel } from './AlarmCard';
import { CalendarCard } from './CalendarCard';
import { MembersCard } from './MembersCard';
import { VacuumCard, toVacuumModel } from './VacuumCard';

/*
 * The cards the Home had and a room did not, in the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html): Mini U×2, Standard U×4, Expanded W×4.
 */

afterEach(cleanup);

const NOW = new Date(2026, 9, 28, 12, 0).getTime();

describe('the alarm card', () => {
  const disarmed = toAlarmModel('alarm_control_panel.casa', { state: 'disarmed', rawAttributes: { friendly_name: 'Allarme', supported_features: 7 } });

  it('shows its state, its main action and its modes', () => {
    const onArm = vi.fn();
    const onDisarm = vi.fn();
    const { rerender } = render(<AlarmCard model={disarmed} format="U×2" onArm={onArm} onDisarm={onDisarm} onOpen={vi.fn()} />);
    expect(screen.getByText('Disinserito')).toBeTruthy();
    rerender(<AlarmCard model={disarmed} format="U×4" onArm={onArm} onDisarm={onDisarm} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inserisci Fuori' }));
    expect(onArm).toHaveBeenCalledWith('away');
    rerender(<AlarmCard model={disarmed} format="W×4" onArm={onArm} onDisarm={onDisarm} onOpen={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    fireEvent.click(screen.getByRole('radio', { name: 'Notte' }));
    expect(onArm).toHaveBeenCalledWith('night');
  });

  it('turns green while armed and offers to disarm', () => {
    const onDisarm = vi.fn();
    const armed = { ...disarmed, state: 'armed_home' as const };
    const { container } = render(<AlarmCard model={armed} format="U×4" onArm={vi.fn()} onDisarm={onDisarm} onOpen={vi.fn()} />);
    expect(container.querySelector('.dv-alarm.is-armed')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Disinserisci' }));
    expect(onDisarm).toHaveBeenCalledTimes(1);
  });
});

describe('the vacuum card', () => {
  const cleaning = toVacuumModel('vacuum.robot', { state: 'cleaning', rawAttributes: { friendly_name: 'Aspirapolvere', battery_level: 72 } }, { area: 18, minutes: 24 });

  it('shows the figures of the run and its three commands', () => {
    const onStartPause = vi.fn();
    const onReturnToBase = vi.fn();
    const { rerender } = render(<VacuumCard model={cleaning} format="U×4" onStartPause={onStartPause} onReturnToBase={onReturnToBase} onOpen={vi.fn()} />);
    expect(screen.getByText('18 m²')).toBeTruthy();
    expect(screen.getByText('72%')).toBeTruthy();
    rerender(<VacuumCard model={cleaning} format="W×4" onStartPause={onStartPause} onReturnToBase={onReturnToBase} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByText('Alla base', { selector: 'button' }));
    expect(onReturnToBase).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Pausa', { selector: 'button' }));
    expect(onStartPause).toHaveBeenCalledTimes(1);
  });
});

describe('the calendar card', () => {
  const at = (hours: number, minutes = 0, days = 0) => new Date(new Date(NOW).setHours(hours, minutes) + days * 86_400_000);
  const events = [
    { uid: 'a', title: 'Dentista', start: at(15, 30), end: at(16, 15), allDay: false, location: 'Studio Rossi' },
    { uid: 'b', title: 'Calcetto', start: at(18), end: at(19), allDay: false },
    { uid: 'c', title: 'Yoga', start: at(19, 0, 1), end: at(20, 0, 1), allDay: false },
  ];

  it('shows the next event, the events of the day, then the week', () => {
    const { rerender } = render(<CalendarCard name="Famiglia" events={events} available format="U×2" now={NOW} onOpen={vi.fn()} />);
    expect(screen.getByText('Dentista')).toBeTruthy();
    rerender(<CalendarCard name="Famiglia" events={events} available format="U×4" now={NOW} onOpen={vi.fn()} />);
    expect(screen.getByText('2 eventi')).toBeTruthy();
    expect(screen.getByText('Calcetto')).toBeTruthy();
    rerender(<CalendarCard name="Famiglia" events={events} available format="W×4" now={NOW} onOpen={vi.fn()} />);
    expect(screen.getByText('Studio Rossi')).toBeTruthy();
    const days = screen.getAllByRole('button', { pressed: false }).filter((button) => button.closest('.dv-week'));
    fireEvent.click(days[0]);
    expect(screen.getByText('Yoga')).toBeTruthy();
  });
});

describe('the members card', () => {
  const members = [
    { id: 'm', name: 'Mattia', home: true },
    { id: 'g', name: 'Giulia', home: true },
    { id: 'l', name: 'Luca', home: false, place: 'Scuola' },
  ];

  it('says who is home when Home Assistant knows it', () => {
    const { rerender } = render(<MembersCard title="Casa" members={members} format="U×2" onOpen={vi.fn()} />);
    expect(screen.getByText('2 a casa · 1 fuori')).toBeTruthy();
    rerender(<MembersCard title="Casa" members={members} format="U×4" onOpen={vi.fn()} />);
    expect(screen.getByText('Scuola')).toBeTruthy();
    rerender(<MembersCard title="Casa" members={members} format="W×4" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Luca/ }));
    expect(screen.getByRole('button', { name: /Luca/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('counts the members when where they are is unknown', () => {
    render(<MembersCard title="Casa" members={[{ id: 'a', name: 'Anna', roleLabel: 'Admin' }]} format="U×2" onOpen={vi.fn()} />);
    expect(screen.getByText('1 membro')).toBeTruthy();
  });
});
