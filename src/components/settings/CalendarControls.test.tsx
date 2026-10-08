import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import { CALENDAR_FEATURE_CREATE_EVENT, CALENDAR_FEATURE_UPDATE_EVENT } from '../../services/calendarClient';
import CalendarControls from './CalendarControls';

function agenda(events: CalendarAgendaController['events']): CalendarAgendaController {
  return {
    entityId: 'calendar.domus_ui',
    status: 'ready',
    events,
    error: null,
    busy: false,
    createEvent: vi.fn(async () => true),
    updateEvent: vi.fn(async () => true),
    deleteEvent: vi.fn(async () => true),
  };
}

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-08T09:00:00') });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('CalendarControls', () => {
  it('shows the next seven days as a week strip with every event of the chosen day', () => {
    render(
      <I18nProvider>
        <CalendarControls
          name="Domus UI"
          supportedFeatures={CALENDAR_FEATURE_CREATE_EVENT | CALENDAR_FEATURE_UPDATE_EVENT}
          agenda={agenda([
            { uid: 'domus-ui-waste:glass:2026-10-08', summary: 'Vetro', start: '2026-10-08', end: '2026-10-09', allDay: true },
            { uid: 'dentist', summary: 'Dentista', start: '2026-10-08T15:00:00+02:00', end: '2026-10-08T16:00:00+02:00', allDay: false },
            { uid: 'dinner', summary: 'Cena', start: '2026-10-10T20:00:00+02:00', end: '2026-10-10T22:00:00+02:00', allDay: false },
          ])}
          wasteTypes={{ glass: { name: 'Vetro', icon: 'mdi:bottle-soda', color: '#14b8a6' } }}
        />
      </I18nProvider>,
    );

    const week = screen.getByRole('group', { name: 'Prossimi 7 giorni' });
    const days = within(week).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[0].getAttribute('aria-label')).toBe('Oggi: Vetro, Dentista');
    expect(days[0].getAttribute('aria-pressed')).toBe('true');
    expect(days[1].getAttribute('aria-label')).toBe('Domani: Nessun evento');

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem').map((item) => item.querySelector('.truncate')?.textContent)).toEqual(['Vetro', 'Dentista']);
    expect(within(list).getByText('Raccolta rifiuti · sola lettura')).toBeTruthy();
    expect(list.querySelector('.lucide-wine')).toBeTruthy();

    fireEvent.click(days[2]);
    expect(screen.getByText('Cena')).toBeTruthy();
    expect(screen.queryByText('Dentista')).toBeNull();

    fireEvent.click(days[1]);
    expect(screen.getByText('Nessun evento in questo giorno.')).toBeTruthy();
  });

  it('groups new event and waste configuration actions under the agenda', () => {
    const onConfigureWaste = vi.fn();
    render(
      <I18nProvider>
        <CalendarControls
          name="Domus UI"
          supportedFeatures={CALENDAR_FEATURE_CREATE_EVENT}
          agenda={agenda([])}
          wasteTypes={{ glass: { name: 'Vetro', icon: 'mdi:bottle-soda', color: '#14b8a6' } }}
          onConfigureWaste={onConfigureWaste}
        />
      </I18nProvider>,
    );

    const newEvent = screen.getByRole('button', { name: 'Nuovo evento' });
    const configure = screen.getByRole('button', { name: 'Configura raccolta' });
    expect(newEvent.parentElement).toBe(configure.parentElement);
    fireEvent.click(configure);
    expect(onConfigureWaste).toHaveBeenCalledTimes(1);
  });

  it('opens the edit form for regular events but keeps waste rows read-only', () => {
    render(
      <I18nProvider>
        <CalendarControls
          name="Domus UI"
          supportedFeatures={CALENDAR_FEATURE_UPDATE_EVENT}
          agenda={agenda([
            { uid: 'domus-ui-waste:glass:2026-10-08', summary: 'Vetro', start: '2026-10-08', end: '2026-10-09', allDay: true },
            { uid: 'dentist', summary: 'Dentista', start: '2026-10-08T15:00:00+02:00', end: '2026-10-08T16:00:00+02:00', allDay: false },
          ])}
        />
      </I18nProvider>,
    );

    const [wasteRow, dentistRow] = within(screen.getByRole('list')).getAllByRole('button');
    expect((wasteRow as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dentistRow);
    expect(screen.getByDisplayValue('Dentista')).toBeTruthy();
  });
});
