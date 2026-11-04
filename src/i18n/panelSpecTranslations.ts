import { useMemo } from 'react';
import { useI18n, type AppLocale } from './I18nProvider';

/* What only the entries of the registry say, loaded with them. */

const it = {
  ledWhite: 'LED bianco',
  ledWhiteNote: 'Aggiunge il led bianco al colore, senza cambiarlo',
  discNote: 'Trascina sul disco: il colore cambia subito',
  flashNow: 'Lampeggia',
  flashing: 'Lampeggia…',
  flashNote: 'La fa lampeggiare per qualche secondo, per trovarla',
  protectedTitle: '{name} è protetta',
  protectedAsk: 'Vuoi spegnerla davvero?',
  protectedNote: 'Chiede conferma prima di spegnerla, dalla card e dal pannello',
  effect_colorloop: 'Ciclo colori',
  effect_pulse: 'Pulsazione',
  effect_candle: 'Candela',
  effect_fireplace: 'Camino',
  effect_rainbow: 'Arcobaleno',
  effect_breathe: 'Respiro',
  effect_strobe: 'Lampi',
};

type Catalog = Record<keyof typeof it, string>;
export type PanelSpecKey = keyof typeof it;

const en: Catalog = {
  ledWhite: 'White LED',
  ledWhiteNote: 'Adds the white LED to the colour, without changing it',
  discNote: 'Drag on the disc: the colour changes at once',
  flashNow: 'Flash',
  flashing: 'Flashing…',
  flashNote: 'Makes it flash for a few seconds, to find it',
  protectedTitle: '{name} is protected',
  protectedAsk: 'Do you really want to turn it off?',
  protectedNote: 'Asks before turning it off, from the card and from the panel',
  effect_colorloop: 'Colour loop',
  effect_pulse: 'Pulse',
  effect_candle: 'Candle',
  effect_fireplace: 'Fireplace',
  effect_rainbow: 'Rainbow',
  effect_breathe: 'Breathe',
  effect_strobe: 'Strobe',
};

const fr: Catalog = {
  ledWhite: 'LED blanche',
  ledWhiteNote: 'Ajoute la LED blanche à la couleur, sans la changer',
  discNote: 'Glissez sur le disque : la couleur change aussitôt',
  flashNow: 'Clignoter',
  flashing: 'Clignote…',
  flashNote: 'La fait clignoter quelques secondes, pour la trouver',
  protectedTitle: '{name} est protégée',
  protectedAsk: 'Voulez-vous vraiment l’éteindre ?',
  protectedNote: 'Demande confirmation avant de l’éteindre, depuis la carte et le panneau',
  effect_colorloop: 'Cycle de couleurs',
  effect_pulse: 'Pulsation',
  effect_candle: 'Bougie',
  effect_fireplace: 'Cheminée',
  effect_rainbow: 'Arc-en-ciel',
  effect_breathe: 'Respiration',
  effect_strobe: 'Stroboscope',
};

const CATALOGS: Record<AppLocale, Catalog> = { it, en, fr };

export function usePanelSpecTranslations() {
  const { locale } = useI18n();
  return useMemo(() => {
    const catalog = CATALOGS[locale] ?? it;
    const t = (key: PanelSpecKey, params?: Record<string, string | number>) => {
      const text = catalog[key];
      return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text;
    };
    return {
      t,
      /** The name of an effect a light may list, or nothing for one it made up. */
      effect: (key: string) => {
        const name = `effect_${key}` as PanelSpecKey;
        return name in catalog ? catalog[name] : undefined;
      },
    };
  }, [locale]);
}
