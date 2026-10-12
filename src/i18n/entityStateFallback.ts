import type { AppLocale } from './I18nProvider';

/*
 * Words for the most common Home Assistant states, used only when Home
 * Assistant's own translations cannot be loaded (an older panel bridge, a
 * failed request). Home Assistant's words always win when they are available.
 */

type StateWords = Record<string, string>;

const GENERIC: Record<AppLocale, StateWords> = {
  it: {
    on: 'Acceso', off: 'Spento', home: 'A casa', not_home: 'Fuori casa',
    locked: 'Bloccata', unlocked: 'Sbloccata', locking: 'Blocco in corso', unlocking: 'Sblocco in corso', jammed: 'Inceppata',
    open: 'Aperta', closed: 'Chiusa', opening: 'In apertura', closing: 'In chiusura',
    playing: 'In riproduzione', paused: 'In pausa', idle: 'Inattivo', standby: 'Standby', buffering: 'Caricamento',
    disarmed: 'Disinserito', armed_home: 'Inserito in casa', armed_away: 'Inserito fuori casa', armed_night: 'Inserito notte',
    armed_vacation: 'Inserito vacanza', armed_custom_bypass: 'Inserito personalizzato', arming: 'Inserimento', disarming: 'Disinserimento',
    pending: 'In attesa', triggered: 'Allarme scattato',
    above_horizon: 'Sopra l’orizzonte', below_horizon: 'Sotto l’orizzonte',
    cleaning: 'In pulizia', docked: 'Alla base', returning: 'Rientro alla base', error: 'Errore',
    heat: 'Riscaldamento', cool: 'Raffrescamento', auto: 'Automatico', heat_cool: 'Caldo/freddo', dry: 'Deumidificazione', fan_only: 'Solo ventola',
  },
  en: {
    on: 'On', off: 'Off', home: 'Home', not_home: 'Away',
    locked: 'Locked', unlocked: 'Unlocked', locking: 'Locking', unlocking: 'Unlocking', jammed: 'Jammed',
    open: 'Open', closed: 'Closed', opening: 'Opening', closing: 'Closing',
    playing: 'Playing', paused: 'Paused', idle: 'Idle', standby: 'Standby', buffering: 'Buffering',
    disarmed: 'Disarmed', armed_home: 'Armed home', armed_away: 'Armed away', armed_night: 'Armed night',
    armed_vacation: 'Armed vacation', armed_custom_bypass: 'Armed custom bypass', arming: 'Arming', disarming: 'Disarming',
    pending: 'Pending', triggered: 'Triggered',
    above_horizon: 'Above horizon', below_horizon: 'Below horizon',
    cleaning: 'Cleaning', docked: 'Docked', returning: 'Returning to dock', error: 'Error',
    heat: 'Heat', cool: 'Cool', auto: 'Auto', heat_cool: 'Heat/cool', dry: 'Dry', fan_only: 'Fan only',
  },
  fr: {
    on: 'Allumé', off: 'Éteint', home: 'À la maison', not_home: 'Absent',
    locked: 'Verrouillée', unlocked: 'Déverrouillée', locking: 'Verrouillage', unlocking: 'Déverrouillage', jammed: 'Bloquée',
    open: 'Ouvert', closed: 'Fermé', opening: 'Ouverture', closing: 'Fermeture',
    playing: 'Lecture', paused: 'En pause', idle: 'Inactif', standby: 'Veille', buffering: 'Mise en mémoire tampon',
    disarmed: 'Désarmé', armed_home: 'Activé (domicile)', armed_away: 'Activé (absence)', armed_night: 'Activé (nuit)',
    armed_vacation: 'Activé (vacances)', armed_custom_bypass: 'Activé (personnalisé)', arming: 'Activation', disarming: 'Désactivation',
    pending: 'En attente', triggered: 'Déclenché',
    above_horizon: 'Au-dessus de l’horizon', below_horizon: 'Sous l’horizon',
    cleaning: 'Nettoyage', docked: 'À la base', returning: 'Retour à la base', error: 'Erreur',
    heat: 'Chauffage', cool: 'Climatisation', auto: 'Automatique', heat_cool: 'Chaud/froid', dry: 'Déshumidification', fan_only: 'Ventilation seule',
  },
};

/** States whose meaning depends on the domain or the binary sensor class. */
const SPECIFIC: Record<AppLocale, Record<string, StateWords>> = {
  it: {
    update: { on: 'Aggiornamento disponibile', off: 'Aggiornato' },
    'binary_sensor.opening': { on: 'Aperta', off: 'Chiusa' },
    'binary_sensor.presence': { on: 'Presente', off: 'Assente' },
    binary_sensor: { on: 'Rilevato', off: 'Non rilevato' },
  },
  en: {
    update: { on: 'Update available', off: 'Up to date' },
    'binary_sensor.opening': { on: 'Open', off: 'Closed' },
    'binary_sensor.presence': { on: 'Home', off: 'Away' },
    binary_sensor: { on: 'Detected', off: 'Clear' },
  },
  fr: {
    update: { on: 'Mise à jour disponible', off: 'À jour' },
    'binary_sensor.opening': { on: 'Ouvert', off: 'Fermé' },
    'binary_sensor.presence': { on: 'Présent', off: 'Absent' },
    binary_sensor: { on: 'Détecté', off: 'Normal' },
  },
};

const OPENING_CLASSES = new Set(['door', 'window', 'garage_door', 'opening']);
const PRESENCE_CLASSES = new Set(['presence', 'occupancy']);

export function fallbackStateWord(
  locale: AppLocale,
  domain: string,
  state: string,
  deviceClass?: string,
): string | null {
  const specific = SPECIFIC[locale];
  if (domain === 'binary_sensor') {
    const group = deviceClass && OPENING_CLASSES.has(deviceClass)
      ? 'binary_sensor.opening'
      : deviceClass && PRESENCE_CLASSES.has(deviceClass)
        ? 'binary_sensor.presence'
        : 'binary_sensor';
    return specific[group]?.[state] ?? null;
  }
  return specific[domain]?.[state] ?? GENERIC[locale][state] ?? null;
}
