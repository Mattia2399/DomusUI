import { useCallback } from 'react';
import { useI18n, type AppLocale, type TranslationParameters } from './I18nProvider';

/** The words of Settings › This device › Screensaver; they load with the page. */
const it = {
  group: 'Screensaver',
  toggle: 'Screensaver',
  offBody: 'Mostra automaticamente lo screensaver dopo un periodo di inattività.',
  onBody: 'Attivo: compare dopo {duration} senza tocchi e sparisce al primo tocco.',
  activationGroup: 'Attivazione',
  startAfter: 'Avvia dopo',
  startAfterHint: 'Tempo senza tocchi, tasti o movimenti del mouse. Gli aggiornamenti della casa non contano.',
  minuteOne: '{count} minuto',
  minuteMany: '{count} minuti',
  appearanceGroup: 'Aspetto',
  mode: 'Modalità',
  minimal: 'Minimal',
  ambient: 'Ambient',
  minimalHint: 'Ora su nero profondo: ideale di notte e sugli schermi OLED.',
  ambientHint: 'Ora sullo sfondo di Domus, attenuato.',
  showDate: 'Mostra data',
  previewGroup: 'Anteprima',
  preview: 'Avvia anteprima',
  previewHint: 'Mostra subito lo screensaver così come è impostato. Tocca lo schermo per uscire.',
  deviceNote:
    'Vale solo per questo dispositivo. Lo screensaver non spegne lo schermo e non lo tiene acceso: se ne occupano le impostazioni del tablet o del computer.',
  storageUnavailable: 'Questo browser non conserva dati locali: la scelta vale solo finché la pagina resta aperta.',
};

type ScreensaverCopyKey = keyof typeof it;

const en: Record<ScreensaverCopyKey, string> = {
  group: 'Screensaver',
  toggle: 'Screensaver',
  offBody: 'Shows the screensaver automatically after a while without use.',
  onBody: 'On: appears after {duration} without a touch and goes at the first one.',
  activationGroup: 'Activation',
  startAfter: 'Start after',
  startAfterHint: 'Time without touches, keys or mouse movement. Updates from the home do not count.',
  minuteOne: '{count} minute',
  minuteMany: '{count} minutes',
  appearanceGroup: 'Appearance',
  mode: 'Style',
  minimal: 'Minimal',
  ambient: 'Ambient',
  minimalHint: 'The time on deep black: best at night and on OLED screens.',
  ambientHint: 'The time on the Domus background, dimmed.',
  showDate: 'Show date',
  previewGroup: 'Preview',
  preview: 'Start preview',
  previewHint: 'Shows the screensaver now, as it is set. Touch the screen to leave.',
  deviceNote:
    'Applies to this device only. The screensaver does not turn the screen off or keep it on: the tablet or computer settings do that.',
  storageUnavailable: 'This browser keeps no local data: the choice lasts only while the page stays open.',
};

const fr: Record<ScreensaverCopyKey, string> = {
  group: 'Économiseur d’écran',
  toggle: 'Économiseur d’écran',
  offBody: 'Affiche automatiquement l’économiseur d’écran après un moment d’inactivité.',
  onBody: 'Activé : apparaît après {duration} sans toucher l’écran et disparaît au premier contact.',
  activationGroup: 'Activation',
  startAfter: 'Démarrer après',
  startAfterHint: 'Temps sans toucher, sans touche ni mouvement de souris. Les mises à jour de la maison ne comptent pas.',
  minuteOne: '{count} minute',
  minuteMany: '{count} minutes',
  appearanceGroup: 'Apparence',
  mode: 'Style',
  minimal: 'Minimal',
  ambient: 'Ambiance',
  minimalHint: 'L’heure sur un noir profond : idéal la nuit et sur les écrans OLED.',
  ambientHint: 'L’heure sur le fond de Domus, atténué.',
  showDate: 'Afficher la date',
  previewGroup: 'Aperçu',
  preview: 'Lancer l’aperçu',
  previewHint: 'Affiche tout de suite l’économiseur tel qu’il est réglé. Touchez l’écran pour quitter.',
  deviceNote:
    'S’applique à cet appareil uniquement. L’économiseur n’éteint pas l’écran et ne le garde pas allumé : ce sont les réglages de la tablette ou de l’ordinateur qui s’en chargent.',
  storageUnavailable: 'Ce navigateur ne conserve aucune donnée locale : le choix ne vaut que tant que la page reste ouverte.',
};

const hu: Record<ScreensaverCopyKey, string> = {
  group: 'Képernyővédő',
  toggle: 'Képernyővédő',
  offBody: 'Egy ideig tartó használaton kívüli állapot után automatikusan megjeleníti a képernyővédőt.',
  onBody: 'Be: {duration} érintés nélküli idő után jelenik meg, és az első érintésre eltűnik.',
  activationGroup: 'Aktiválás',
  startAfter: 'Indítás ennyi idő után',
  startAfterHint: 'Érintés, billentyű vagy egérmozgás nélküli idő. Az otthonból érkező frissítések nem számítanak.',
  minuteOne: '{count} perc',
  minuteMany: '{count} perc',
  appearanceGroup: 'Megjelenés',
  mode: 'Stílus',
  minimal: 'Minimál',
  ambient: 'Hangulatos',
  minimalHint: 'Az idő mélyfekete háttéren: éjszaka és OLED kijelzőn a legjobb.',
  ambientHint: 'Az idő a Domus háttéren, elhalványítva.',
  showDate: 'Dátum megjelenítése',
  previewGroup: 'Előnézet',
  preview: 'Előnézet indítása',
  previewHint: 'Most megjeleníti a képernyővédőt a beállítás szerint. Érintsd meg a képernyőt a kilépéshez.',
  deviceNote:
    'Csak erre az eszközre vonatkozik. A képernyővédő nem kapcsolja ki és nem tartja ébren a képernyőt: azt a tablet vagy a számítógép beállításai végzik.',
  storageUnavailable: 'Ez a böngésző nem őriz helyi adatot: a választás csak addig él, amíg az oldal nyitva van.',
};

const COPY: Record<AppLocale, Record<ScreensaverCopyKey, string>> = { it, en, fr, hu };

export type { ScreensaverCopyKey };

export function useScreensaverCopy() {
  const { locale } = useI18n();
  return useCallback(
    (key: ScreensaverCopyKey, parameters?: TranslationParameters) => {
      const template = COPY[locale]?.[key] ?? it[key];
      if (!parameters) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in parameters ? String(parameters[name]) : match,
      );
    },
    [locale],
  );
}
