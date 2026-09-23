import type { MockEntityStateMap } from '../../types/ha';

export const DEMO_CALENDAR_ENTITY_ID = 'calendar.domus_ui';

export function createCalendarStateMocks(): MockEntityStateMap {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(18, 30, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    [DEMO_CALENDAR_ENTITY_ID]: {
      state: 'off',
      stateLabel: 'Domani, 18:30',
      supportedFeatures: 7,
      rawAttributes: {
        friendly_name: 'Domus UI',
        message: 'Controllo settimanale della casa',
        description: 'Rivedi consumi, sicurezza e programmazioni.',
        location: 'Casa',
        all_day: false,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      },
    },
  };
}
