import { useMemo } from 'react';
import { useI18n, type AppLocale } from './I18nProvider';

/* The words of the player: they load with it, without the words of the panels of each device. */

const it = {
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
};

type MediaKey = keyof typeof it;

const en: Record<MediaKey, string> = {
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
};

const fr: Record<MediaKey, string> = {
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
};

const hu: Record<MediaKey, string> = {
  mediaPausedOn: 'Szüneteltetve itt:',
  mediaChoose: 'Válaszd ki a Forrás menüben, mit hallgatnál',
  mediaSpeakers: 'Hangszórók',
  mediaSpeakersNote: 'Koppints, hogy a többin is szóljon',
  mediaSourceNote: 'Mi szól itt: {name}',
  mediaAudioNote: '{name} hangzásmódja',
  mediaOffTitle: 'A lejátszó ki van kapcsolva',
  mediaOffNote: 'Koppints a fenti bekapcsológombra a visszakapcsoláshoz',
  mediaMuteIt: 'Némítás',
  mediaUnmute: 'Némítás feloldása',
  mediaMuted: 'Némítva',
};

const CATALOGS: Record<AppLocale, Record<MediaKey, string>> = { it, en, fr, hu };

export function useMediaPlayerWords() {
  const { locale } = useI18n();
  return useMemo(() => {
    const catalog = CATALOGS[locale] ?? it;
    return (key: MediaKey, params?: Record<string, string | number>) => {
      const text = catalog[key];
      return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text;
    };
  }, [locale]);
}
