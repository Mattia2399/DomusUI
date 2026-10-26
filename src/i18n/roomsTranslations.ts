import { useCallback } from 'react';
import { useI18n, type AppLocale } from './I18nProvider';

const it = {
  rooms: 'Stanze',
  selectedOne: '{count} dispositivo selezionato',
  selectedMany: '{count} dispositivi selezionati',
  unavailable: 'Non disponibile',
  unknown: 'Sconosciuto',
  roomNameRequired: 'Inserisci un nome per la stanza.',
  haUnavailable: 'Home Assistant non è disponibile in questo momento.',
  security: 'Sicurezza',
  noRoom: 'Nessuna stanza',
  move: 'Sposta',
  remove: 'Rimuovi',
  cancel: 'Annulla',
  save: 'Salva',
  add: 'Aggiungi',
  emptySection: 'Nessun dispositivo in questa sezione',
  editRoom: 'Modifica stanza',
  newRoom: 'Nuova stanza',
  floor: 'Piano',
  loadingRooms: 'Carico stanze',
  noRooms: 'Nessuna stanza configurata',
  noRoomsDescription: 'Domus UI mostrerà qui soltanto le aree realmente disponibili nella tua casa Home Assistant.',
  floors: 'Piani',
  view: 'Vista',
  deleting: 'Elimino…',
  delete: 'Elimina',
  close: 'Chiudi',
  roomExample: 'Esempio: Studio',
  noFloor: 'Nessun piano',
  icon: 'Icona',
  aliases: 'Alias',
  aliasesDescription: 'Gli alias sono nomi alternativi usati negli assistenti vocali per fare riferimento a quest’area.',
  image: 'Immagine',
  temperatureEntity: 'Entità temperatura',
  humidityEntity: 'Entità umidità',
  roomSavedToHa: 'La nuova stanza verrà salvata come area Home Assistant.',
  roomSavedOffline: 'Offline: la stanza resta salvata solo in questo browser.',
  deleteRoom: 'Elimina stanza',
  moving: 'Sposto…',
  edit: 'Modifica',
  done: 'Fine',
  local: 'Locale',
  saving: 'Salvo…',
  create: 'Crea',
  paused: 'In pausa',
  nameLabel: 'Nome',
  manageFloors: 'Gestisci piani',
  sensorNone: 'Nessuno',
  iconSofa: 'Divano',
  iconKitchen: 'Cucina',
  iconBed: 'Letto',
  iconBath: 'Bagno',
  iconDesk: 'Scrivania',
  iconGarage: 'Garage',
  iconGarden: 'Giardino',
  iconRoom: 'Porta',
  deleteRoomTitle: 'Eliminare {name}?',
  pause: 'Pausa',
  play: 'Riproduci',
  brightness: 'Luminosità',
  turnOff: 'Spegni {name}',
  turnOn: 'Accendi {name}',
  climate: 'Clima',
  sensors: 'Sensori',
  lights: 'Luci',
  switches: 'Interruttori',
  accessories: 'Accessori', domainSensor: 'Sensore', domainSwitch: 'Interruttore', domainLight: 'Luce', domainClimate: 'Clima', domainFan: 'Ventola', domainLock: 'Serratura', domainCamera: 'Videocamera', domainCover: 'Tapparella', domainWeather: 'Meteo', domainScene: 'Scena', stateOffFeminine: 'Spenta', stateOnMasculine: 'Acceso', stateOffMasculine: 'Spento', stateOpen: 'Aperta', stateClosed: 'Chiusa', stateOpening: 'In apertura', stateClosing: 'In chiusura', stateLocked: 'Bloccata', stateUnlocked: 'Sbloccata', stateActive: 'Attivo', stateInactive: 'Inattivo', stateHeating: 'Riscaldamento', stateCooling: 'Raffrescamento', stateDrying: 'Deumidificazione', stateFanOnly: 'Ventilazione', stateAutomatic: 'Automatico', statePlaying: 'In riproduzione', statePaused: 'In pausa', stateBuffering: 'Caricamento', stateStandby: 'Standby', guideTitle: 'Tieni premuto per organizzare', guideDescription: 'Tieni premuta una card, poi tocca le altre per selezionarle. Su desktop puoi anche usare il clic destro.', guideAdd: 'Aggiungi', guideNew: 'nuovi', guideMove: 'Sposta', guideRoom: 'stanza', guideRemove: 'Rimuovi', guideFromRoom: 'dalla stanza',
  areaCreateFailed: 'Non sono riuscito a creare l’area su Home Assistant.', areaSaveFailed: 'Non sono riuscito a salvare l’area su Home Assistant.', areaDeleteConfirm: 'Vuoi eliminare l’area "{name}" da Home Assistant?', areaDeleteFailed: 'Non sono riuscito a eliminare l’area su Home Assistant.', light: 'Luce', lightOn: 'Luce accesa', lightPercentage: 'Luce {value}%', climateSummary: 'Clima {value}°', sceneSummary: 'Scena {name}', climateActive: 'Clima attivo', areaDetails: 'Dettagli area', haAreaShort: 'Area HA', demo: 'Demo', defaultRoom: 'Predefinita', browserEditStorage: 'Le modifiche resteranno salvate solo in questo browser.', currentHaArea: 'Area Home Assistant corrente.', television: 'Televisione', monitoring: 'Monitoraggio', ready: 'Pronto',
} as const;

export type RoomsTranslationKey = keyof typeof it;
type RoomsCatalog = Record<RoomsTranslationKey, string>;

const en: RoomsCatalog = { television: 'Television', monitoring: 'Monitoring', ready: 'Ready',
  areaCreateFailed: 'Could not create the area in Home Assistant.', areaSaveFailed: 'Could not save the area in Home Assistant.', areaDeleteConfirm: 'Delete the area "{name}" from Home Assistant?', areaDeleteFailed: 'Could not delete the area from Home Assistant.', light: 'Light', lightOn: 'Light on', lightPercentage: 'Light {value}%', climateSummary: 'Climate {value}°', sceneSummary: 'Scene {name}', climateActive: 'Climate active', areaDetails: 'Area details', haAreaShort: 'HA area', demo: 'Demo', defaultRoom: 'Default', browserEditStorage: 'Changes will only be saved in this browser.', currentHaArea: 'Current Home Assistant area.', rooms: 'Rooms',  selectedOne: '{count} device selected', selectedMany: '{count} devices selected', unavailable: 'Unavailable', unknown: 'Unknown',  roomNameRequired: 'Enter a room name.',  haUnavailable: 'Home Assistant is currently unavailable.',  security: 'Security',  noRoom: 'No room', move: 'Move', remove: 'Remove', cancel: 'Cancel', save: 'Save', add: 'Add',  emptySection: 'No devices in this section',  editRoom: 'Edit room', newRoom: 'New room', floor: 'Floor',  loadingRooms: 'Loading rooms',  noRooms: 'No rooms configured', noRoomsDescription: 'Domus UI will only display areas that are actually available in your Home Assistant home.',  floors: 'Floors',  view: 'View',  deleting: 'Deleting…', delete: 'Delete',  close: 'Close',  roomExample: 'Example: Office', noFloor: 'No floor', icon: 'Icon', aliases: 'Aliases', aliasesDescription: 'Aliases are alternative names used by voice assistants to refer to this area.', image: 'Image', temperatureEntity: 'Temperature entity', humidityEntity: 'Humidity entity',  roomSavedToHa: 'The new room will be saved as a Home Assistant area.', roomSavedOffline: 'Offline: this room will only be saved in this browser.',  deleteRoom: 'Delete room',  moving: 'Moving…',  edit: 'Edit', done: 'Done',  local: 'Local', saving: 'Saving…',  create: 'Create',  paused: 'Paused',  nameLabel: 'Name', manageFloors: 'Manage floors', sensorNone: 'None', iconSofa: 'Sofa', iconKitchen: 'Kitchen', iconBed: 'Bed', iconBath: 'Bath', iconDesk: 'Desk', iconGarage: 'Garage', iconGarden: 'Garden', iconRoom: 'Door', deleteRoomTitle: 'Delete {name}?',  pause: 'Pause', play: 'Play',  brightness: 'Brightness',  turnOff: 'Turn off {name}', turnOn: 'Turn on {name}', climate: 'Climate', sensors: 'Sensors', lights: 'Lights', switches: 'Switches', accessories: 'Accessories',  domainSensor: 'Sensor', domainSwitch: 'Switch', domainLight: 'Light', domainClimate: 'Climate', domainFan: 'Fan', domainLock: 'Lock', domainCamera: 'Camera', domainCover: 'Cover', domainWeather: 'Weather', domainScene: 'Scene',  stateOffFeminine: 'Off', stateOnMasculine: 'On', stateOffMasculine: 'Off', stateOpen: 'Open', stateClosed: 'Closed', stateOpening: 'Opening', stateClosing: 'Closing', stateLocked: 'Locked', stateUnlocked: 'Unlocked', stateActive: 'Active', stateInactive: 'Inactive', stateHeating: 'Heating', stateCooling: 'Cooling', stateDrying: 'Drying', stateFanOnly: 'Fan only', stateAutomatic: 'Automatic', statePlaying: 'Playing', statePaused: 'Paused', stateBuffering: 'Buffering', stateStandby: 'Standby',  guideTitle: 'Press and hold to organize', guideDescription: 'Press and hold a card, then tap the others to select them. On desktop, you can also right-click.', guideAdd: 'Add', guideNew: 'new', guideMove: 'Move', guideRoom: 'room', guideRemove: 'Remove', guideFromRoom: 'from room',
};

const fr: RoomsCatalog = { television: 'Télévision', monitoring: 'Surveillance', ready: 'Prêt',
  areaCreateFailed: 'Impossible de créer la zone dans Home Assistant.', areaSaveFailed: 'Impossible d’enregistrer la zone dans Home Assistant.', areaDeleteConfirm: 'Supprimer la zone « {name} » de Home Assistant ?', areaDeleteFailed: 'Impossible de supprimer la zone de Home Assistant.', light: 'Lumière', lightOn: 'Lumière allumée', lightPercentage: 'Lumière {value} %', climateSummary: 'Climat {value}°', sceneSummary: 'Scène {name}', climateActive: 'Climatisation active', areaDetails: 'Détails de la zone', haAreaShort: 'Zone HA', demo: 'Démo', defaultRoom: 'Prédéfinie', browserEditStorage: 'Les modifications seront uniquement enregistrées dans ce navigateur.', currentHaArea: 'Zone Home Assistant actuelle.', domainSensor: 'Capteur', domainSwitch: 'Interrupteur', domainLight: 'Lumière', domainClimate: 'Climatisation', domainFan: 'Ventilateur', domainLock: 'Serrure', domainCamera: 'Caméra', domainCover: 'Volet', domainWeather: 'Météo', domainScene: 'Scène',  stateOffFeminine: 'Éteinte', stateOnMasculine: 'Allumé', stateOffMasculine: 'Éteint', stateOpen: 'Ouverte', stateClosed: 'Fermée', stateOpening: 'Ouverture', stateClosing: 'Fermeture', stateLocked: 'Verrouillée', stateUnlocked: 'Déverrouillée', stateActive: 'Actif', stateInactive: 'Inactif', stateHeating: 'Chauffage', stateCooling: 'Refroidissement', stateDrying: 'Déshumidification', stateFanOnly: 'Ventilation', stateAutomatic: 'Automatique', statePlaying: 'Lecture', statePaused: 'En pause', stateBuffering: 'Chargement', stateStandby: 'Veille',  guideTitle: 'Maintenez appuyé pour organiser', guideDescription: 'Maintenez une carte appuyée, puis touchez les autres pour les sélectionner. Sur ordinateur, vous pouvez aussi utiliser le clic droit.', guideAdd: 'Ajouter', guideNew: 'nouveaux', guideMove: 'Déplacer', guideRoom: 'pièce', guideRemove: 'Retirer', guideFromRoom: 'de la pièce', rooms: 'Pièces',  selectedOne: '{count} appareil sélectionné', selectedMany: '{count} appareils sélectionnés', unavailable: 'Indisponible', unknown: 'Inconnu',  roomNameRequired: 'Saisissez un nom de pièce.',  haUnavailable: 'Home Assistant est actuellement indisponible.',  security: 'Sécurité',  noRoom: 'Aucune pièce', move: 'Déplacer', remove: 'Supprimer', cancel: 'Annuler', save: 'Enregistrer', add: 'Ajouter',  emptySection: 'Aucun appareil dans cette section',  editRoom: 'Modifier la pièce', newRoom: 'Nouvelle pièce', floor: 'Étage',  loadingRooms: 'Chargement des pièces',  noRooms: 'Aucune pièce configurée', noRoomsDescription: 'Domus UI affichera uniquement les zones réellement disponibles dans votre domicile Home Assistant.',  floors: 'Étages',  view: 'Vue',  deleting: 'Suppression…', delete: 'Supprimer',  close: 'Fermer',  roomExample: 'Exemple : Bureau', noFloor: 'Aucun étage', icon: 'Icône', aliases: 'Alias', aliasesDescription: 'Les alias sont des noms alternatifs utilisés par les assistants vocaux pour désigner cette zone.', image: 'Image', temperatureEntity: 'Entité de température', humidityEntity: 'Entité d’humidité',  roomSavedToHa: 'La nouvelle pièce sera enregistrée comme zone Home Assistant.', roomSavedOffline: 'Hors ligne : cette pièce sera uniquement enregistrée dans ce navigateur.',  deleteRoom: 'Supprimer la pièce',  moving: 'Déplacement…',  edit: 'Modifier', done: 'Terminé',  local: 'Local', saving: 'Enregistrement…',  create: 'Créer',  paused: 'En pause',  nameLabel: 'Nom', manageFloors: 'Gérer les étages', sensorNone: 'Aucun', iconSofa: 'Canapé', iconKitchen: 'Cuisine', iconBed: 'Lit', iconBath: 'Salle de bain', iconDesk: 'Bureau', iconGarage: 'Garage', iconGarden: 'Jardin', iconRoom: 'Porte', deleteRoomTitle: 'Supprimer {name} ?',  pause: 'Pause', play: 'Lire',  brightness: 'Luminosité',  turnOff: 'Éteindre {name}', turnOn: 'Allumer {name}', climate: 'Climat', sensors: 'Capteurs', lights: 'Lumières', switches: 'Interrupteurs', accessories: 'Accessoires', 
};

const catalogs: Record<AppLocale, RoomsCatalog> = { it, en, fr };

function interpolate(message: string, parameters?: Record<string, string | number>) {
  if (!parameters) return message;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(parameters, key) ? String(parameters[key]) : match,
  );
}

export function useRoomsTranslations() {
  const { locale } = useI18n();
  return useCallback(
    (key: RoomsTranslationKey, parameters?: Record<string, string | number>) =>
      interpolate(catalogs[locale][key], parameters),
    [locale],
  );
}

export type RoomsTranslator = ReturnType<typeof useRoomsTranslations>;
