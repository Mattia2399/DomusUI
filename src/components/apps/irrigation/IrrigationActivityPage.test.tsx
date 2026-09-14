import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IrrigationActivityPage, { IrrigationActivitySnapshotCard } from './IrrigationActivityPage';

afterEach(() => cleanup());

const events = [
  {
    id: 'restart-1',
    zoneName: 'Prato Nord',
    state: 'interrupted',
    reason: 'home_assistant_restart',
    source: 'manual',
    occurredAt: new Date('2026-09-10T08:30:00Z').getTime(),
  },
  {
    id: 'complete-1',
    zoneName: 'Aiuole',
    state: 'completed',
    reason: 'deadline_reached',
    source: 'schedule',
    occurredAt: new Date('2026-09-09T06:00:00Z').getTime(),
  },
];

describe('Irrigation activity', () => {
  it('summarizes recent events and opens the complete log', () => {
    const onOpen = vi.fn();
    render(<IrrigationActivitySnapshotCard items={events} onOpen={onOpen} />);

    expect(screen.getByText('Prato Nord')).toBeTruthy();
    expect(screen.getByText(/Home Assistant riavviato/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /registro attività irrigazione/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the server history and a truthful empty state', () => {
    const { rerender } = render(<IrrigationActivityPage items={events} />);
    expect(screen.getByText('Registro Domus Core')).toBeTruthy();
    expect(screen.getByText('Aiuole')).toBeTruthy();

    rerender(<IrrigationActivityPage items={[]} />);
    expect(screen.getByText('Nessuna attività registrata')).toBeTruthy();
  });
});
