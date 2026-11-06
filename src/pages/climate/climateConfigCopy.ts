import { useI18n } from '../../i18n/I18nProvider';

const it = {
  configure: 'Configura Domus Climate', edit: 'Modifica configurazione', save: 'Salva configurazione', cancel: 'Annulla', retry: 'Riprova',
  loading: 'Caricamento della configurazione Clima…', unavailable: 'Connessione o store Clima non disponibile.',
  corrupt: 'Configurazione Clima danneggiata. I dati non vengono sostituiti automaticamente.',
  unsupported: 'Questa configurazione proviene da una versione più recente di Domus.',
  migration_failed: 'Migrazione della configurazione Clima non riuscita. I dati originali restano intatti.',
  conflict: 'La configurazione è cambiata su un altro dispositivo. Ricarica prima di salvare.',
  invalid_config: 'La configurazione non è valida. Controlla i campi indicati.',
  entity_missing: 'Una delle entità scelte non esiste più in Home Assistant.',
  entity_incompatible: 'Un’entità non supporta il ruolo o il setpoint scelto.',
  area_missing: 'Una delle aree scelte non esiste più.', access_denied: 'Solo un amministratore può modificare l’impianto.',
  network: 'Impossibile contattare Home Assistant. Riprova quando la connessione torna disponibile.',
  configured: 'Impianto climatico configurato', configuredDetail: 'Zone, sensori e dispositivi salvati per tutta la casa.',
  readonly: 'Puoi vedere la configurazione. Per modificarla serve un amministratore.',
  draft: 'Modifiche non salvate', leaveWarning: 'Le modifiche Clima non sono state salvate.', saved: 'Configurazione salvata.',
  zones: 'Zone climatiche', addZone: 'Aggiungi zona', removeZone: 'Rimuovi zona', zoneName: 'Nome zona', area: 'Stanza / area HA', noArea: 'Nessuna area',
  reference: 'Temperatura di riferimento', primary: 'Sensore principale', fallbacks: 'Fallback in ordine', addFallback: 'Aggiungi fallback', remove: 'Rimuovi', moveUp: 'Sposta su', moveDown: 'Sposta giù',
  endpoints: 'Dispositivi della zona', addEndpoint: 'Aggiungi dispositivo', endpointName: 'Nome dispositivo', entity: 'Entità HA', kind: 'Tipo',
  ac: 'Condizionatore', trv: 'Valvola radiatore', other: 'Altro', heat: 'Riscalda', cool: 'Raffresca', radiatorRole: 'Valvola circuito',
  related: 'Controlli collegati', addRelated: 'Aggiungi controllo', role: 'Ruolo', roleHint: 'Per esempio potenza, ventola, eco',
  circuits: 'Circuiti radiatori', addCircuit: 'Aggiungi circuito', circuitName: 'Nome circuito', controller: 'Termostato / controller', linkedValves: 'Valvole collegate', linkedGenerators: 'Generatori collegati',
  generators: 'Generatori', addGenerator: 'Aggiungi generatore', generatorName: 'Nome generatore', boiler: 'Caldaia', stove: 'Termostufa',
  spaceHeating: 'Riscaldamento ambienti', dhw: 'Acqua calda sanitaria', waterSetpoint: 'Setpoint acqua/generatore', noSetpoint: 'Nessun setpoint',
  noEntity: 'Nessuna entità', search: 'Cerca per nome o ID', choose: 'Scegli un’entità', results: 'Risultati limitati: affina la ricerca',
  capabilities: 'Modalità {modes} · funzioni {features} · range {range} · passo {step}',
  extraModes: 'Ventola {fan} · oscillazione {swing} · preset {preset}',
  stepZones: '1. Zone e sensori', stepDevices: '2. Dispositivi e ruoli', stepCircuits: '3. Circuiti e controller', stepGenerators: '4. Generatori',
  cannotSave: 'Completa sensore ed entità dei dispositivi prima di salvare.', reload: 'Ricarica configurazione', noZones: 'Aggiungi la prima zona per iniziare.',
  entitySecondary: 'ID tecnico', configuredZone: '{count} dispositivi · riferimento {entity}',
} as const;

type Key = keyof typeof it;
const en: Record<Key, string> = {
  configure: 'Configure Domus Climate', edit: 'Edit configuration', save: 'Save configuration', cancel: 'Cancel', retry: 'Retry',
  loading: 'Loading Climate configuration…', unavailable: 'Climate connection or store unavailable.',
  corrupt: 'Climate configuration is damaged. Data is not replaced automatically.', unsupported: 'This configuration was written by a newer Domus version.',
  migration_failed: 'Climate configuration migration failed. The original data is intact.', conflict: 'Configuration changed on another device. Reload before saving.',
  invalid_config: 'Configuration is invalid. Check the marked fields.', entity_missing: 'A selected entity no longer exists in Home Assistant.',
  entity_incompatible: 'An entity does not support the selected role or setpoint.', area_missing: 'A selected area no longer exists.', access_denied: 'Only an administrator can edit the installation.',
  network: 'Home Assistant could not be reached. Retry when connected.', configured: 'Climate installation configured',
  configuredDetail: 'Zones, sensors and devices saved for the whole house.', readonly: 'You can view the configuration. An administrator is needed to edit it.',
  draft: 'Unsaved changes', leaveWarning: 'Climate changes have not been saved.', saved: 'Configuration saved.',
  zones: 'Climate zones', addZone: 'Add zone', removeZone: 'Remove zone', zoneName: 'Zone name', area: 'HA room / area', noArea: 'No area',
  reference: 'Reference temperature', primary: 'Primary sensor', fallbacks: 'Fallbacks in order', addFallback: 'Add fallback', remove: 'Remove', moveUp: 'Move up', moveDown: 'Move down',
  endpoints: 'Zone devices', addEndpoint: 'Add device', endpointName: 'Device name', entity: 'HA entity', kind: 'Type', ac: 'Air conditioner', trv: 'Radiator valve', other: 'Other', heat: 'Heating', cool: 'Cooling', radiatorRole: 'Circuit valve',
  related: 'Related controls', addRelated: 'Add control', role: 'Role', roleHint: 'For example power, fan, eco', circuits: 'Radiator circuits', addCircuit: 'Add circuit', circuitName: 'Circuit name', controller: 'Thermostat / controller', linkedValves: 'Linked valves', linkedGenerators: 'Linked generators',
  generators: 'Generators', addGenerator: 'Add generator', generatorName: 'Generator name', boiler: 'Boiler', stove: 'Hydronic stove', spaceHeating: 'Space heating', dhw: 'Domestic hot water', waterSetpoint: 'Water/generator setpoint', noSetpoint: 'No setpoint',
  noEntity: 'No entity', search: 'Search name or ID', choose: 'Choose an entity', results: 'Results limited: refine the search', capabilities: 'Modes {modes} · features {features} · range {range} · step {step}',
  extraModes: 'Fan {fan} · swing {swing} · presets {preset}',
  stepZones: '1. Zones and sensors', stepDevices: '2. Devices and roles', stepCircuits: '3. Circuits and controller', stepGenerators: '4. Generators',
  cannotSave: 'Complete sensors and device entities before saving.', reload: 'Reload configuration', noZones: 'Add the first zone to begin.', entitySecondary: 'Technical ID', configuredZone: '{count} devices · reference {entity}',
};
const fr: Record<Key, string> = {
  configure: 'Configurer Domus Climate', edit: 'Modifier la configuration', save: 'Enregistrer', cancel: 'Annuler', retry: 'Réessayer',
  loading: 'Chargement de la configuration Climat…', unavailable: 'Connexion ou stockage Climat indisponible.',
  corrupt: 'La configuration Climat est endommagée. Les données ne sont pas remplacées automatiquement.', unsupported: 'Cette configuration vient d’une version plus récente de Domus.',
  migration_failed: 'La migration Climat a échoué. Les données d’origine restent intactes.', conflict: 'La configuration a changé sur un autre appareil. Rechargez avant d’enregistrer.',
  invalid_config: 'Configuration invalide. Vérifiez les champs indiqués.', entity_missing: 'Une entité choisie n’existe plus dans Home Assistant.',
  entity_incompatible: 'Une entité ne prend pas en charge le rôle ou la consigne choisis.', area_missing: 'Une zone choisie n’existe plus.', access_denied: 'Seul un administrateur peut modifier l’installation.',
  network: 'Home Assistant est inaccessible. Réessayez une fois connecté.', configured: 'Installation climatique configurée',
  configuredDetail: 'Zones, capteurs et appareils enregistrés pour toute la maison.', readonly: 'Vous pouvez voir la configuration. Un administrateur est requis pour la modifier.',
  draft: 'Modifications non enregistrées', leaveWarning: 'Les modifications Climat ne sont pas enregistrées.', saved: 'Configuration enregistrée.',
  zones: 'Zones climatiques', addZone: 'Ajouter une zone', removeZone: 'Supprimer la zone', zoneName: 'Nom de la zone', area: 'Pièce / zone HA', noArea: 'Sans zone',
  reference: 'Température de référence', primary: 'Capteur principal', fallbacks: 'Sources de secours ordonnées', addFallback: 'Ajouter une source', remove: 'Supprimer', moveUp: 'Monter', moveDown: 'Descendre',
  endpoints: 'Appareils de la zone', addEndpoint: 'Ajouter un appareil', endpointName: 'Nom de l’appareil', entity: 'Entité HA', kind: 'Type', ac: 'Climatiseur', trv: 'Vanne de radiateur', other: 'Autre', heat: 'Chauffage', cool: 'Rafraîchissement', radiatorRole: 'Vanne du circuit',
  related: 'Commandes liées', addRelated: 'Ajouter une commande', role: 'Rôle', roleHint: 'Par exemple puissance, ventilateur, éco', circuits: 'Circuits radiateurs', addCircuit: 'Ajouter un circuit', circuitName: 'Nom du circuit', controller: 'Thermostat / contrôleur', linkedValves: 'Vannes liées', linkedGenerators: 'Générateurs liés',
  generators: 'Générateurs', addGenerator: 'Ajouter un générateur', generatorName: 'Nom du générateur', boiler: 'Chaudière', stove: 'Poêle hydro', spaceHeating: 'Chauffage des pièces', dhw: 'Eau chaude sanitaire', waterSetpoint: 'Consigne eau/générateur', noSetpoint: 'Aucune consigne',
  noEntity: 'Aucune entité', search: 'Chercher nom ou ID', choose: 'Choisir une entité', results: 'Résultats limités : affinez la recherche', capabilities: 'Modes {modes} · fonctions {features} · plage {range} · pas {step}',
  extraModes: 'Ventilation {fan} · oscillation {swing} · préréglages {preset}',
  stepZones: '1. Zones et capteurs', stepDevices: '2. Appareils et rôles', stepCircuits: '3. Circuits et contrôleur', stepGenerators: '4. Générateurs',
  cannotSave: 'Complétez les capteurs et entités avant d’enregistrer.', reload: 'Recharger la configuration', noZones: 'Ajoutez une première zone pour commencer.', entitySecondary: 'ID technique', configuredZone: '{count} appareils · référence {entity}',
};

const catalogs = { it, en, fr };
export function useClimateConfigCopy() {
  const { locale } = useI18n();
  const catalog: Record<Key, string> = catalogs[locale];
  const t = (key: Key, values?: Record<string, string | number>) => catalog[key].replace(/\{(\w+)\}/g, (match, name: string) => String(values?.[name] ?? match));
  return { t };
}
