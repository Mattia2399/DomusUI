import type { AppLocale } from './I18nProvider';

type StateLabels = Record<string, readonly [string, string]>;

export const binarySensorStateLabels: Record<AppLocale, StateLabels> = {
  it: {
    battery: ['Batteria scarica', 'Batteria normale'], battery_charging: ['In carica', 'Non in carica'],
    carbon_monoxide: ['Monossido rilevato', 'Nessun monossido'], cold: ['Freddo', 'Normale'],
    connectivity: ['Connesso', 'Disconnesso'], door: ['Aperta', 'Chiusa'], garage_door: ['Aperta', 'Chiusa'],
    gas: ['Gas rilevato', 'Nessun gas'], heat: ['Caldo', 'Normale'], light: ['Luce rilevata', 'Nessuna luce'],
    lock: ['Sbloccata', 'Bloccata'], moisture: ['Bagnato', 'Asciutto'], motion: ['Movimento rilevato', 'Nessun movimento'],
    moving: ['In movimento', 'Fermo'], occupancy: ['Occupato', 'Libero'], opening: ['Aperto', 'Chiuso'],
    plug: ['Collegato', 'Scollegato'], power: ['Alimentato', 'Non alimentato'], presence: ['A casa', 'Fuori casa'],
    problem: ['Problema rilevato', 'Nessun problema'], running: ['In funzione', 'Fermo'],
    safety: ['Non sicuro', 'Sicuro'], smoke: ['Fumo rilevato', 'Nessun fumo'], sound: ['Suono rilevato', 'Nessun suono'],
    tamper: ['Manomissione rilevata', 'Nessuna manomissione'], update: ['Aggiornamento disponibile', 'Aggiornato'],
    vibration: ['Vibrazione rilevata', 'Nessuna vibrazione'], window: ['Aperta', 'Chiusa'],
  },
  en: {
    battery: ['Battery low', 'Battery normal'], battery_charging: ['Charging', 'Not charging'],
    carbon_monoxide: ['Carbon monoxide detected', 'No carbon monoxide'], cold: ['Cold', 'Normal'],
    connectivity: ['Connected', 'Disconnected'], door: ['Open', 'Closed'], garage_door: ['Open', 'Closed'],
    gas: ['Gas detected', 'No gas'], heat: ['Hot', 'Normal'], light: ['Light detected', 'No light'],
    lock: ['Unlocked', 'Locked'], moisture: ['Wet', 'Dry'], motion: ['Motion detected', 'No motion'],
    moving: ['Moving', 'Stopped'], occupancy: ['Occupied', 'Clear'], opening: ['Open', 'Closed'],
    plug: ['Plugged in', 'Unplugged'], power: ['Powered', 'Not powered'], presence: ['Home', 'Away'],
    problem: ['Problem detected', 'No problem'], running: ['Running', 'Stopped'],
    safety: ['Unsafe', 'Safe'], smoke: ['Smoke detected', 'No smoke'], sound: ['Sound detected', 'No sound'],
    tamper: ['Tampering detected', 'No tampering'], update: ['Update available', 'Up to date'],
    vibration: ['Vibration detected', 'No vibration'], window: ['Open', 'Closed'],
  },
  fr: {
    battery: ['Batterie faible', 'Batterie normale'], battery_charging: ['En charge', 'Pas en charge'],
    carbon_monoxide: ['Monoxyde détecté', 'Aucun monoxyde'], cold: ['Froid', 'Normal'],
    connectivity: ['Connecté', 'Déconnecté'], door: ['Ouverte', 'Fermée'], garage_door: ['Ouverte', 'Fermée'],
    gas: ['Gaz détecté', 'Aucun gaz'], heat: ['Chaud', 'Normal'], light: ['Lumière détectée', 'Aucune lumière'],
    lock: ['Déverrouillée', 'Verrouillée'], moisture: ['Humide', 'Sec'], motion: ['Mouvement détecté', 'Aucun mouvement'],
    moving: ['En mouvement', 'À l’arrêt'], occupancy: ['Occupé', 'Libre'], opening: ['Ouvert', 'Fermé'],
    plug: ['Branché', 'Débranché'], power: ['Alimenté', 'Non alimenté'], presence: ['À la maison', 'Absent'],
    problem: ['Problème détecté', 'Aucun problème'], running: ['En marche', 'À l’arrêt'],
    safety: ['Dangereux', 'Sûr'], smoke: ['Fumée détectée', 'Aucune fumée'], sound: ['Son détecté', 'Aucun son'],
    tamper: ['Sabotage détecté', 'Aucun sabotage'], update: ['Mise à jour disponible', 'À jour'],
    vibration: ['Vibration détectée', 'Aucune vibration'], window: ['Ouverte', 'Fermée'],
  },
};

export const binarySensorCopy = {
  it: {
    fallback: ['Attivo', 'Inattivo'], unavailable: 'Non disponibile', unknown: 'Stato sconosciuto',
    battery: 'Batteria', title: 'Sensore binario', reported: 'Stato rilevato da Home Assistant',
    noReading: 'Nessuna lettura affidabile disponibile',
  },
  en: {
    fallback: ['Active', 'Inactive'], unavailable: 'Unavailable', unknown: 'Unknown state',
    battery: 'Battery', title: 'Binary sensor', reported: 'State reported by Home Assistant',
    noReading: 'No reliable reading available',
  },
  fr: {
    fallback: ['Actif', 'Inactif'], unavailable: 'Indisponible', unknown: 'État inconnu',
    battery: 'Batterie', title: 'Capteur binaire', reported: 'État indiqué par Home Assistant',
    noReading: 'Aucune lecture fiable disponible',
  },
} as const;
