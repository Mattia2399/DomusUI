import { useCallback } from 'react';
import { useI18n, type AppLocale } from './I18nProvider';

/* What the states shared by every panel say, on their own so that Rooms carries only these. */
const it = {
  spanMin: '{n} min',
  spanHour: '{n} h',
  spanDay: '{n} g',
  lvAway: 'Non risponde.',
  lvAwayFor: 'Non risponde da {time}.',
  lvLastKnown: 'Ultimo stato noto: {state}, alle {time}.',
  lvAwayTip: 'Controlla che sia acceso e collegato.',
  lvRetry: 'Riprova',
  lvOpenHa: 'Apri in Home Assistant',
  lvSent: 'Comando inviato',
  lvWaiting: 'Attendo la conferma dal dispositivo',
  lvNoAnswer: 'Il dispositivo non ha risposto. Riprova',
  lvStale: 'Non invia dati da {time}.',
  lvStaleAt: 'Ultimo valore alle {time}.',
  lvStaleBattery: 'La batteria è al {pct}%: probabilmente va cambiata.',
  lvStaleTip: 'Controlla che sia alimentato e raggiungibile.',
};

type PanelLiveCatalog = Record<keyof typeof it, string>;
export type PanelLiveTranslationKey = keyof typeof it;

const en: PanelLiveCatalog = {
  spanMin: '{n} min',
  spanHour: '{n} h',
  spanDay: '{n} d',
  lvAway: 'Not answering.',
  lvAwayFor: 'Not answering for {time}.',
  lvLastKnown: 'Last known state: {state}, at {time}.',
  lvAwayTip: 'Check that it is on and connected.',
  lvRetry: 'Try again',
  lvOpenHa: 'Open in Home Assistant',
  lvSent: 'Command sent',
  lvWaiting: 'Waiting for the device to confirm',
  lvNoAnswer: 'The device did not answer. Try again',
  lvStale: 'No data for {time}.',
  lvStaleAt: 'Last value at {time}.',
  lvStaleBattery: 'The battery is at {pct}%: it probably needs changing.',
  lvStaleTip: 'Check that it is powered and reachable.',
};

const fr: PanelLiveCatalog = {
  spanMin: '{n} min',
  spanHour: '{n} h',
  spanDay: '{n} j',
  lvAway: 'Ne répond pas.',
  lvAwayFor: 'Ne répond plus depuis {time}.',
  lvLastKnown: 'Dernier état connu : {state}, à {time}.',
  lvAwayTip: 'Vérifiez qu’il est allumé et connecté.',
  lvRetry: 'Réessayer',
  lvOpenHa: 'Ouvrir dans Home Assistant',
  lvSent: 'Commande envoyée',
  lvWaiting: 'En attente de la confirmation de l’appareil',
  lvNoAnswer: 'L’appareil n’a pas répondu. Réessayez',
  lvStale: 'Aucune donnée depuis {time}.',
  lvStaleAt: 'Dernière valeur à {time}.',
  lvStaleBattery: 'La batterie est à {pct} % : elle est probablement à changer.',
  lvStaleTip: 'Vérifiez qu’il est alimenté et joignable.',
};

const catalogs: Record<AppLocale, PanelLiveCatalog> = { it, en, fr };

export function usePanelLiveTranslations() {
  const { locale } = useI18n();
  return useCallback(
    (key: PanelLiveTranslationKey, parameters?: Record<string, string | number>) => {
      const message = catalogs[locale][key];
      if (!parameters) return message;
      return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : match,
      );
    },
    [locale],
  );
}
