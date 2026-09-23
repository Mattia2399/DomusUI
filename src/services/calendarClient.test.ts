import { describe, expect, it } from 'vitest';
import {
  buildCalendarCreateMessage,
  buildCalendarSubscribeMessage,
  parseCalendarAgendaPayload,
} from './calendarClient';

describe('calendarClient', () => {
  it('parses and orders Home Assistant calendar subscription events', () => {
    const events = parseCalendarAgendaPayload({
      events: [
        { uid: 'later', summary: 'Later', start: '2026-09-25T10:00:00+02:00', end: '2026-09-25T11:00:00+02:00' },
        { uid: 'day', summary: 'All day', start: '2026-09-24', end: '2026-09-25', all_day: true, location: 'Home' },
      ],
    });
    expect(events.map((event) => event.uid)).toEqual(['day', 'later']);
    expect(events[0]).toMatchObject({ allDay: true, location: 'Home' });
  });

  it('builds bounded subscription and create messages', () => {
    const subscription = buildCalendarSubscribeMessage(
      'calendar.domus_ui',
      new Date('2026-09-23T12:00:00+02:00'),
    );
    expect(subscription.type).toBe('calendar/event/subscribe');
    expect(subscription.entity_id).toBe('calendar.domus_ui');
    expect(Date.parse(subscription.end) - Date.parse(subscription.start)).toBe(7 * 24 * 60 * 60 * 1000);

    expect(buildCalendarCreateMessage('calendar.domus_ui', {
      summary: ' Test ',
      start: '2026-09-24',
      end: '2026-09-25',
      allDay: true,
      description: ' Notes ',
    })).toEqual({
      type: 'calendar/event/create',
      entity_id: 'calendar.domus_ui',
      event: {
        start: '2026-09-24',
        end: '2026-09-25',
        summary: 'Test',
        description: 'Notes',
      },
    });
  });
});
