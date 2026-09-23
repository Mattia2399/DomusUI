import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarCard, buildCalendarCardEvent } from './CalendarCard';
import type { Widget } from '../../types/dashboardModels';
import { CALENDAR_UPCOMING_EVENTS_ATTRIBUTE } from '../../services/calendarClient';

const widget: Widget = {
  id: 'calendar-card',
  kind: 'calendar',
  title: 'Famiglia',
  entityId: 'calendar.domus_ui',
  status: 'off',
  isOn: false,
  layout: { i: 'calendar-card', x: 0, y: 0, w: 2, h: 2 },
};

afterEach(cleanup);

describe('CalendarCard', () => {
  it('reads the native calendar entity attributes', () => {
    expect(buildCalendarCardEvent(widget, {
      state: 'off',
      rawAttributes: {
        message: 'Dentista',
        start_time: '2026-09-24T10:00:00+02:00',
        end_time: '2026-09-24T11:00:00+02:00',
        location: 'Roma',
      },
    }, 'Empty')).toMatchObject({ title: 'Dentista', location: 'Roma', allDay: false });
  });

  it('shows month, compact week and the next event in standard mode', () => {
    render(
      <CalendarCard
        widget={widget}
        entity={{ state: 'off', rawAttributes: { message: 'Dentista', start_time: '2026-09-24T10:00:00+02:00', end_time: '2026-09-24T11:00:00+02:00' } }}
        displayVariant="standard"
        isSelected={false}
        isEditMode={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/settembre/i)).toBeTruthy();
    expect(screen.getByText('Dentista')).toBeTruthy();
  });

  it('keeps mini focused on the nearest event', () => {
    const { container } = render(
      <CalendarCard
        widget={widget}
        entity={{ state: 'off', rawAttributes: { message: 'Dentista', start_time: '2026-09-24T10:00:00+02:00', end_time: '2026-09-24T11:00:00+02:00' } }}
        displayVariant="mini"
        isSelected={false}
        isEditMode={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Dentista')).toBeTruthy();
    expect(screen.queryByText(/settembre/i)).toBeNull();
    expect(container.firstElementChild?.className).toContain('rounded-[1.2rem]');
  });

  it('exposes the agenda affordance in expanded mode', () => {
    render(
      <CalendarCard
        widget={widget}
        entity={{ state: 'off', rawAttributes: { message: 'Dentista', start_time: '2026-09-24T10:00:00+02:00', end_time: '2026-09-24T11:00:00+02:00' } }}
        displayVariant="full"
        isSelected={false}
        isEditMode={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Agenda')).toBeTruthy();
  });

  it('does not render a fake event surface when the agenda is empty', () => {
    const { container } = render(
      <CalendarCard
        widget={widget}
        entity={{ state: 'off', rawAttributes: {} }}
        displayVariant="standard"
        isSelected={false}
        isEditMode={false}
        onClick={vi.fn()}
      />,
    );
    const row = container.querySelector('.calendar-card__event-row');
    expect(row?.className).toContain('calendar-card__event-row--empty');
    expect(row?.className).not.toContain('bg-[color:var(--ui-fill-tertiary)]');
    expect(container.querySelector('.calendar-card__event-icon')).toBeNull();
    expect(screen.getByText('Agenda libera')).toBeTruthy();
  });

  it('uses the extra manual rows to reveal more real events', () => {
    const events = [
      { uid: 'one', summary: 'Dentista', start: '2026-09-24T10:00:00+02:00', end: '2026-09-24T11:00:00+02:00' },
      { uid: 'two', summary: 'Cena', start: '2026-09-24T20:00:00+02:00', end: '2026-09-24T21:00:00+02:00' },
    ];
    const entity = { state: 'off', rawAttributes: { [CALENDAR_UPCOMING_EVENTS_ATTRIBUTE]: events } };
    const { rerender } = render(
      <CalendarCard widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 3 } }} entity={entity} gridBreakpoint="sm" displayVariant="standard" isSelected={false} isEditMode={false} onClick={vi.fn()} />,
    );
    expect(screen.getByText('Dentista')).toBeTruthy();
    expect(screen.queryByText('Cena')).toBeNull();

    rerender(
      <CalendarCard widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 4 } }} entity={entity} gridBreakpoint="sm" displayVariant="standard" isSelected={false} isEditMode={false} onClick={vi.fn()} />,
    );
    expect(screen.getByText('Cena')).toBeTruthy();
  });

  it.each(['sm', 'md', 'lg', 'xl', '2xl'] as const)('uses the event bar instead of the icon for the %s mini card', (gridBreakpoint) => {
    const { container } = render(
      <CalendarCard widget={{ ...widget, layout: { ...widget.layout, w: 1, h: 1 } }} entity={{ state: 'off', rawAttributes: { message: 'Dentista', start_time: '2026-09-24T10:00:00+02:00', end_time: '2026-09-24T11:00:00+02:00' } }} gridBreakpoint={gridBreakpoint} displayVariant="mini" isSelected={false} isEditMode={false} onClick={vi.fn()} />,
    );
    expect(container.querySelector('.calendar-card__mini--bar')).toBeTruthy();
    expect(container.querySelector('.calendar-card__mini-accent')).toBeTruthy();
    expect(container.querySelector('.lucide-calendar-days')).toBeNull();
  });
});
