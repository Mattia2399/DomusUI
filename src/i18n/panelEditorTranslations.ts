import { useCallback } from 'react';
import { useI18n } from './I18nProvider';

/* The words of the three tabs of the edit mode: they arrive with it. */

const it = {
  tabs: 'Modifica della card',
  tabAppearance: 'Aspetto',
  tabDevice: 'Dispositivo',
  tabControls: 'Controlli',
  edit: 'Modifica',
  editTitle: 'Modifica {name}',
  editing: '{name} è in modifica nel riquadro.',
  reopen: 'Apri la modifica',
  done: 'Fine',
  cancel: 'Annulla',
  clear: 'Svuota',
  cardPreview: 'Anteprima della card',
  size: 'Misura',
  sizeMini: 'Mini',
  sizeStandard: 'Standard',
  sizeExpanded: 'Espansa',
  name: 'Nome',
  nameTooLong: 'Al massimo 60 caratteri',
  lightGrowth: 'Quando è accesa',
  lightGrows: 'Cresce',
  lightStays: 'Resta Mini',
  lightGrowsNote: 'Accesa, la card si allunga per mostrare la luminosità.',
  lightCannotGrow: 'Questa luce si accende e si spegne soltanto: la card resta della sua misura.',
  typeRule: 'Misura uguale per tutte le card {kind}',
  typeRuleOwn: 'Usa una misura solo per questa card',
  typeRuleRemove: 'Togli la regola per tutte',
  typeRuleRemoveConfirm: 'Le card {kind} tornano alla loro misura. Questa e le altre restano nella Home.',
  removeCard: 'Togli la card dalla Home',
  removeCardConfirm: 'La card esce dalla Home. Il dispositivo resta in Home Assistant.',
  comingNext: 'Questa scheda arriva nella prossima fase.',
  kind_light: 'Luce',
  kind_switch: 'Presa',
  kind_fan: 'Ventola',
  kind_humidifier: 'Umidificatore',
  kind_climate: 'Clima',
  kind_cover: 'Tapparella',
  kind_camera: 'Telecamera',
  kind_sensor: 'Sensore',
  kind_lock: 'Serratura',
  kind_alarm: 'Allarme',
  kind_media: 'Media',
  kind_vacuum: 'Robot',
  kind_calendar: 'Calendario',
  kind_members: 'Membri',
  kind_weather: 'Meteo',
};

type Words = typeof it;

const en: Words = {
  tabs: 'Edit the card',
  tabAppearance: 'Appearance',
  tabDevice: 'Device',
  tabControls: 'Controls',
  edit: 'Edit',
  editTitle: 'Edit {name}',
  editing: '{name} is being edited in the dialog.',
  reopen: 'Open the editor',
  done: 'Done',
  cancel: 'Cancel',
  clear: 'Clear',
  cardPreview: 'Preview of the card',
  size: 'Size',
  sizeMini: 'Mini',
  sizeStandard: 'Standard',
  sizeExpanded: 'Expanded',
  name: 'Name',
  nameTooLong: 'At most 60 characters',
  lightGrowth: 'When it is on',
  lightGrows: 'Grows',
  lightStays: 'Stays Mini',
  lightGrowsNote: 'When on, the card grows to show the brightness.',
  lightCannotGrow: 'This light only turns on and off: the card keeps its size.',
  typeRule: 'Same size for every {kind} card',
  typeRuleOwn: 'Use a size only for this card',
  typeRuleRemove: 'Remove the rule for all',
  typeRuleRemoveConfirm: 'The {kind} cards go back to their own size. This one and the others stay in the Home.',
  removeCard: 'Remove the card from the Home',
  removeCardConfirm: 'The card leaves the Home. The device stays in Home Assistant.',
  comingNext: 'This tab arrives in the next phase.',
  kind_light: 'Light',
  kind_switch: 'Plug',
  kind_fan: 'Fan',
  kind_humidifier: 'Humidifier',
  kind_climate: 'Climate',
  kind_cover: 'Cover',
  kind_camera: 'Camera',
  kind_sensor: 'Sensor',
  kind_lock: 'Lock',
  kind_alarm: 'Alarm',
  kind_media: 'Media',
  kind_vacuum: 'Vacuum',
  kind_calendar: 'Calendar',
  kind_members: 'Members',
  kind_weather: 'Weather',
};

const WORDS: Record<string, Words> = { it, en };

export type PanelEditorWordKey = keyof Words;

export function usePanelEditorWords() {
  const { locale } = useI18n();
  return useCallback(
    (key: PanelEditorWordKey, values?: Record<string, string | number>) => {
      const words = WORDS[locale.slice(0, 2)] ?? it;
      return Object.entries(values ?? {}).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), words[key] ?? it[key] ?? key);
    },
    [locale],
  );
}
