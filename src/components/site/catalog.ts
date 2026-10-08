import { SECTION_CATALOG, WIDGET_CATALOG } from '../../types/dashboardModels';

/** Counts follow the builder catalog, excluding containers from the card total. */
export const SITE_CATALOG = {
  devices: WIDGET_CATALOG,
  content: SECTION_CATALOG.filter(({ kind }) => !kind.startsWith('stack-')),
  stacks: SECTION_CATALOG.filter(({ kind }) => kind.startsWith('stack-')),
};
export const SITE_CARD_COUNT = SITE_CATALOG.devices.length + SITE_CATALOG.content.length;
