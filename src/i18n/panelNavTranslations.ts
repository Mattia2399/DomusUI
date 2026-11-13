import { useCallback } from 'react';
import { useI18n } from './I18nProvider';

/* The few words of the structure of a panel: they load with it, without the words of each device. */

const it = {
  more: 'Altro',
  moreCount: '{n} controlli',
  lookAction: 'Azione',
  lookTiles: 'Scelta',
  lookList: 'Elenco',
  lookLevels: 'Livelli',
  lookSlider: 'Livello',
  lookWhites: 'Bianchi',
  lookColor: 'Colore',
  lookTimer: 'Timer',
  lookChart: 'Grafico',
  lookRows: 'Valori',
  lookImage: 'Immagine',
  lookPad: 'Direzioni',
};

const en: typeof it = {
  more: 'More',
  moreCount: '{n} controls',
  lookAction: 'Action',
  lookTiles: 'Choice',
  lookList: 'List',
  lookLevels: 'Levels',
  lookSlider: 'Level',
  lookWhites: 'Whites',
  lookColor: 'Colour',
  lookTimer: 'Timer',
  lookChart: 'Chart',
  lookRows: 'Values',
  lookImage: 'Picture',
  lookPad: 'Directions',
};

const fr: typeof it = {
  more: 'Plus',
  moreCount: '{n} commandes',
  lookAction: 'Action',
  lookTiles: 'Choix',
  lookList: 'Liste',
  lookLevels: 'Niveaux',
  lookSlider: 'Niveau',
  lookWhites: 'Blancs',
  lookColor: 'Couleur',
  lookTimer: 'Minuteur',
  lookChart: 'Graphique',
  lookRows: 'Valeurs',
  lookImage: 'Image',
  lookPad: 'Directions',
};

const hu: typeof it = {
  more: 'Továbbiak',
  moreCount: '{n} vezérlő',
  lookAction: 'Művelet',
  lookTiles: 'Választás',
  lookList: 'Lista',
  lookLevels: 'Szintek',
  lookSlider: 'Szint',
  lookWhites: 'Fehérek',
  lookColor: 'Szín',
  lookTimer: 'Időzítő',
  lookChart: 'Diagram',
  lookRows: 'Értékek',
  lookImage: 'Kép',
  lookPad: 'Irányok',
};

const WORDS = { it, en, fr, hu };

export function usePanelNavWords() {
  const { locale } = useI18n();
  return useCallback(
    (key: keyof typeof it, values?: { n: number }) => {
      const word = (WORDS[locale] ?? it)[key];
      return values ? word.replace('{n}', String(values.n)) : word;
    },
    [locale],
  );
}
