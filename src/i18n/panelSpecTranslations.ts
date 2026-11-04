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
  dirNormal: 'Normale',
  dirReverse: 'Inversa',
  dirNote: 'Inversa: d’inverno spinge giù l’aria calda',
  oscillationNote: 'La ventola ruota a destra e a sinistra',
  inRoom: 'In stanza',
  target: 'Obiettivo',
  closeNow: 'Chiudi {name}',
  openNow: 'Apri {name}',
  swingNote: 'Le alette si muovono su e giù',
  alignTo: 'Allinea a {value}',
  alignNote: 'Porta l’obiettivo alla temperatura che c’è adesso in stanza: il clima smette di scaldare o raffrescare',
  rangeOf: 'Intervallo · ora {value}',
  humidityRoom: 'Ora in stanza {value}%',
  week: 'Settimana',
  parts: 'Ricambi',
  map: 'Mappa',
  mediaPausedOn: 'In pausa su',
  mediaChoose: 'Scegli cosa ascoltare da Sorgente',
  mediaSpeakers: 'Casse',
  mediaSpeakersNote: 'Tocca per far suonare anche le altre',
  mediaSourceNote: 'Cosa suona su {name}',
  mediaAudioNote: 'Modalità del suono di {name}',
  mediaOffTitle: 'Il lettore è spento',
  mediaOffNote: 'Tocca l’accensione in alto per riaccenderlo',
  mediaMuteIt: 'Togli l’audio',
  mediaUnmute: 'Riattiva l’audio',
  mediaMuted: 'Muto',
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
  dirNormal: 'Normal',
  dirReverse: 'Reverse',
  dirNote: 'Reverse: in winter it pushes warm air down',
  oscillationNote: 'The fan turns left and right',
  inRoom: 'In the room',
  target: 'Target',
  closeNow: 'Close {name}',
  openNow: 'Open {name}',
  swingNote: 'The vanes move up and down',
  alignTo: 'Match {value}',
  alignNote: 'Brings the target to the temperature in the room now: the climate stops heating or cooling',
  rangeOf: 'Range · now {value}',
  humidityRoom: 'Now in the room {value}%',
  week: 'Week',
  parts: 'Parts',
  map: 'Map',
  mediaPausedOn: 'Paused on',
  mediaChoose: 'Choose what to listen to from Source',
  mediaSpeakers: 'Speakers',
  mediaSpeakersNote: 'Tap to play on the others too',
  mediaSourceNote: 'What plays on {name}',
  mediaAudioNote: 'Sound mode of {name}',
  mediaOffTitle: 'The player is off',
  mediaOffNote: 'Tap the power button above to turn it back on',
  mediaMuteIt: 'Mute',
  mediaUnmute: 'Unmute',
  mediaMuted: 'Muted',
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
  dirNormal: 'Normal',
  dirReverse: 'Inversé',
  dirNote: 'Inversé : en hiver il pousse l’air chaud vers le bas',
  oscillationNote: 'Le ventilateur tourne à gauche et à droite',
  inRoom: 'Dans la pièce',
  target: 'Objectif',
  closeNow: 'Fermer {name}',
  openNow: 'Ouvrir {name}',
  swingNote: 'Les ailettes bougent de haut en bas',
  alignTo: 'Aligner sur {value}',
  alignNote: 'Amène l’objectif à la température actuelle de la pièce : le climat cesse de chauffer ou de refroidir',
  rangeOf: 'Plage · actuel {value}',
  humidityRoom: 'Actuellement dans la pièce {value} %',
  week: 'Semaine',
  parts: 'Pièces',
  map: 'Carte',
  mediaPausedOn: 'En pause sur',
  mediaChoose: 'Choisissez quoi écouter depuis Source',
  mediaSpeakers: 'Enceintes',
  mediaSpeakersNote: 'Touchez pour jouer aussi sur les autres',
  mediaSourceNote: 'Ce qui joue sur {name}',
  mediaAudioNote: 'Mode audio de {name}',
  mediaOffTitle: 'Le lecteur est éteint',
  mediaOffNote: 'Touchez le bouton d’alimentation en haut pour le rallumer',
  mediaMuteIt: 'Couper le son',
  mediaUnmute: 'Rétablir le son',
  mediaMuted: 'Muet',
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
