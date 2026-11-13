import { useCallback } from 'react';
import { useI18n } from './I18nProvider';

/* The words of the edit mode of a panel: they arrive with it. */

const it = {
  search: 'Cerca per nome, stanza o id',
  filterAll: 'Tutto',
  filterControl: 'Da comandare',
  filterRead: 'Da leggere',
  sameDevice: 'Dello stesso dispositivo',
  sameRoom: 'Nella stessa stanza',
  otherRooms: 'Altre stanze',
  noRoom: 'Senza stanza',
  used: 'Già nel pannello',
  nothingFound: 'Nessuna entità trovata',
  moreToSearch: 'Altre {n}: scrivi per cercarle',
  recommended: 'Consigliato',
  formCompact: 'Compatta',
  formHero: 'Grande',
  sizeMini: 'Mini',
  sizeStandard: 'Standard',
  sizeExpanded: 'Espansa',
  sizeCurrent: 'Attuale · {size}',
  iconAuto: 'Automatica',
  dragHandle: 'Trascina {name}',
  moveUp: 'Sposta su',
  moveDown: 'Sposta giù',
  moved: '{name} in posizione {n}',
};

type Words = typeof it;

const en: Words = {
  search: 'Search by name, room or id',
  filterAll: 'All',
  filterControl: 'To command',
  filterRead: 'To read',
  sameDevice: 'Of the same device',
  sameRoom: 'In the same room',
  otherRooms: 'Other rooms',
  noRoom: 'No room',
  used: 'Already in the panel',
  nothingFound: 'No entity found',
  moreToSearch: '{n} more: type to find them',
  recommended: 'Recommended',
  formCompact: 'Compact',
  formHero: 'Large',
  sizeMini: 'Mini',
  sizeStandard: 'Standard',
  sizeExpanded: 'Expanded',
  sizeCurrent: 'Current · {size}',
  iconAuto: 'Automatic',
  dragHandle: 'Drag {name}',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moved: '{name} in position {n}',
};

const fr: Words = {
  search: 'Chercher par nom, pièce ou id',
  filterAll: 'Tout',
  filterControl: 'À commander',
  filterRead: 'À lire',
  sameDevice: 'Du même appareil',
  sameRoom: 'Dans la même pièce',
  otherRooms: 'Autres pièces',
  noRoom: 'Sans pièce',
  used: 'Déjà dans le panneau',
  nothingFound: 'Aucune entité trouvée',
  moreToSearch: 'Encore {n} : tapez pour les trouver',
  recommended: 'Conseillé',
  formCompact: 'Compacte',
  formHero: 'Grande',
  sizeMini: 'Mini',
  sizeStandard: 'Standard',
  sizeExpanded: 'Étendue',
  sizeCurrent: 'Actuelle · {size}',
  iconAuto: 'Automatique',
  dragHandle: 'Déplacer {name}',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  moved: '{name} en position {n}',
};

const hu: Words = {
  search: 'Keresés név, szoba vagy azonosító szerint',
  filterAll: 'Mind',
  filterControl: 'Vezérléshez',
  filterRead: 'Olvasáshoz',
  sameDevice: 'Ugyanabból az eszközből',
  sameRoom: 'Ugyanabban a szobában',
  otherRooms: 'Más szobák',
  noRoom: 'Nincs szoba',
  used: 'Már a panelen',
  nothingFound: 'Nem található entitás',
  moreToSearch: 'Még {n}: gépelj a kereséshez',
  recommended: 'Ajánlott',
  formCompact: 'Kompakt',
  formHero: 'Nagy',
  sizeMini: 'Mini',
  sizeStandard: 'Normál',
  sizeExpanded: 'Bővített',
  sizeCurrent: 'Jelenlegi · {size}',
  iconAuto: 'Automatikus',
  dragHandle: '{name} húzása',
  moveUp: 'Fel',
  moveDown: 'Le',
  moved: '{name} a(z) {n}. helyen',
};

const WORDS: Record<string, Words> = { it, en, fr, hu };

export type EditorWordKey = keyof Words;
export type EditorWords = (key: EditorWordKey, values?: Record<string, string | number>) => string;

export function editorWordsOf(locale: string): EditorWords {
  const words = WORDS[locale.slice(0, 2)] ?? it;
  return (key, values) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), words[key]);
}

export function useEditorWords(): EditorWords {
  const { locale } = useI18n();
  return useCallback<EditorWords>((key, values) => editorWordsOf(locale)(key, values), [locale]);
}

/* The looks said in plain words, as on the board: what the user sees, not what the code calls them. */
const LOOK_NAMES_IT: Record<string, string> = {
  segmented: 'Pulsanti affiancati',
  menu: 'Menu a tendina',
  list: 'Elenco',
  radio: 'Elenco con spiegazioni',
  arrows: 'Frecce',
  tiles: 'Tessere',
  bar: 'Barra',
  'bar-value': 'Barra con il numero',
  stepper: 'Pulsanti + e −',
  'number-input': 'Campo numerico',
  levels: 'Livelli',
  'ring-slider': 'Anello',
  keypad: 'Tastierino',
  'toggle-row': 'Riga con interruttore',
  'icon-toggle': 'Pulsante rotondo',
  'toggle-card': 'Riquadro',
  'led-row': 'Riga con spia',
  push: 'Pulsante',
  momentary: 'Premi e tieni',
  hold: 'Tieni premuto per confermare',
  running: 'Pulsante con avanzamento',
  result: 'Pulsante con esito',
  pill: 'Pillola',
  page: 'Pulsante pagina',
  value: 'Valore',
  'value-pill': 'Valore in pillola',
  badge: 'Etichetta di stato',
  led: 'Spia',
  glow: 'Riquadro luminoso',
  gauge: 'Anello pieno',
  radial: 'Arco con zone',
  'mini-ring': 'Anello piccolo',
  progress: 'Barra di avanzamento',
  'progress-vertical': 'Barra verticale',
  battery: 'Batteria',
  temperature: 'Valore con scala',
  humidity: 'Goccia con zona ideale',
  level: 'Serbatoio',
  connection: 'Tacche del segnale',
  trend: 'Tendenza',
  'icon-status': 'Icona di stato',
  sparkline: 'Linea piccola',
  'chart-line': 'Grafico a linea',
  'chart-area': 'Grafico ad area',
  'chart-bar': 'Grafico a barre',
  'chart-stats': 'Minimo, massimo e media',
  text: 'Campo di testo',
  textarea: 'Testo su più righe',
  password: 'Campo coperto',
  date: 'Calendario',
  time: 'Ora',
  datetime: 'Data e ora',
  countdown: 'Conto alla rovescia',
  // The looks of the controls of a device.
  action: 'Azione',
  slider: 'Barra verticale',
  whites: 'Bianchi',
  color: 'Disco dei colori',
  timer: 'Timer',
  chart: 'Grafico',
  rows: 'Righe',
  image: 'Immagine',
  pad: 'Comando direzionale',
};

/** The name of a look in Italian; the other languages fall back to it until they are written. */
export const lookNameOf = (look: string) => LOOK_NAMES_IT[look] ?? look;
