import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sprout } from 'lucide-react';
import IrrigationCalendarPage from './IrrigationCalendarPage';

afterEach(() => cleanup());

const zone = {
  id: 'north',
  name: 'Prato Nord',
  icon: Sprout,
  days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  startTimes: ['06:00', '20:30'],
  durationMin: 15,
  scheduleEnabled: true,
  available: true,
  running: false,
};

describe('IrrigationCalendarPage', () => {
  it('derives the weekly agenda from configured zone schedules', () => {
    const onOpenProgram = vi.fn();
    render(
      <IrrigationCalendarPage
        zones={[zone]}
        rainProtectionActive
        rainDetected={false}
        onOpenProgram={onOpenProgram}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Prato Nord')).toHaveLength(2);
    expect(screen.getAllByText('Programmato')).toHaveLength(2);
    const dayTabs = screen.getAllByRole('tab');
    expect(dayTabs).toHaveLength(7);
    expect(dayTabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    fireEvent.click(screen.getAllByText('Prato Nord')[0]);
    expect(onOpenProgram).toHaveBeenCalledWith('north');
  });

  it('communicates rain suspension without inventing execution history', () => {
    render(
      <IrrigationCalendarPage
        zones={[zone]}
        rainProtectionActive
        rainDetected
        onOpenProgram={vi.fn()}
      />,
    );

    expect(screen.getByText('Cicli sospesi per pioggia')).toBeTruthy();
    expect(screen.getAllByText('Sospeso per pioggia')).toHaveLength(2);
    expect(screen.queryByText('Completato')).toBeNull();
  });
});
