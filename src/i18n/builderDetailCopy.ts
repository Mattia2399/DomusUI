import type { AppLocale } from "./I18nProvider";

const copy = {
  en: {
    "Meteo nella card": "Weather in the card",
    "Mostra il widget meteo dentro la card saluto.": "Show the weather widget inside the greeting card.",
    "Mostra il meteo nella card saluto": "Show weather in the greeting card",
    "In questa card unificata il meteo usa chip su xs/sm e card previsioni su md/lg.": "In this unified card, weather uses chips on xs/sm and forecast cards on md/lg.",
    Giornaliero: "Daily",
    Orario: "Hourly",
    Servizio: "Service",
    Automatico: "Automatic",
    "1 decimale": "1 decimal",
    decimali: "decimals",
    ore: "hours",
    giorni: "days",
    colonne: "columns",
    righe: "rows",
    Pioggia: "Rain",
    Vento: "Wind",
    Umidita: "Humidity",
    Pressione: "Pressure",
    Visibilita: "Visibility",
    Nuvolosita: "Cloud cover",
    Condizione: "Condition",
    "2 colonne": "2 columns",
    "2 righe": "2 rows",
    "4 colonne": "4 columns",
    "4 righe": "4 rows",
    "Stack verticale con una sola colonna.": "Vertical stack with one column.",
    "Stack orizzontale: usa la griglia derivata dal canvas.":
      "Horizontal stack: uses the grid inherited from the canvas.",
    "Stack a griglia: larghezza automatica derivata dalle card interne.":
      "Grid stack: automatic width based on its cards.",
    "Stack a griglia: larghezza manuale impostata dal pannello.":
      "Grid stack: manual width set in the panel.",
    "Automatico usa la precisione suggerita da Home Assistant o il default del device class.":
      "Automatic uses the precision suggested by Home Assistant or the device-class default.",
    "Entita opzionali per metadati sensore. Se lasci vuoto, il pannello contestuale prova a leggere batteria, stato e connessione dagli attributi dell'entita principale.":
      "Optional entities for sensor metadata. When empty, the context panel reads battery, status, and connection from the primary entity attributes.",
    "Di base la dashboard usa il PIN Home Assistant. Se aggiungi un codice extra locale, nel popup inserirai PIN HA + codice extra: ad Home Assistant verra inviato solo il PIN HA. L'autenticazione dispositivo, se attiva, viene provata per prima.":
      "By default, the dashboard uses the Home Assistant PIN. With an extra local code, the dialog asks for both, while only the Home Assistant PIN is sent to the server. Device confirmation is attempted first when enabled.",
    "Conservato solo fino al refresh. Puoi scegliere sotto se ricordarlo su questo dispositivo.":
      "Kept only until refresh. You can choose below to remember it on this device.",
    "Usa Windows Hello, Face ID, impronta o passkey come metodo rapido prima del PIN allarme.":
      "Uses Windows Hello, Face ID, fingerprint, or a passkey before the alarm PIN.",
    "Viene inviato ad Home Assistant solo quando richiesto. Per default si cancella al refresh.":
      "Sent to Home Assistant only when required. It is cleared on refresh by default.",
    "Prova prima Face ID, impronta, PIN dispositivo o passkey; se non riesce, richiede il codice serratura configurato.":
      "Tries Face ID, fingerprint, device PIN, or passkey first; if unsuccessful, it asks for the configured lock code.",
    "Automatico (Home Assistant)": "Automatic (Home Assistant)",
    "Auto responsive": "Responsive auto",
    "Passa automaticamente tra chip e card in base allo spazio disponibile.":
      "Automatically switches between chip and card based on available space.",
    "Chip fisso 2x2": "Fixed 2x2 chip",
    "Formato compatto: temperatura, icona animata e seconda info.":
      "Compact format: temperature, animated icon, and secondary info.",
    "Card fissa 4x4": "Fixed 4x4 card",
    "Formato esteso: header meteo completo con previsioni sottostanti.":
      "Expanded format: complete weather header with forecast below.",
    "Scelta automatica in base ai dati disponibili.":
      "Automatic choice based on available data.",
    "Probabilita di precipitazione.": "Precipitation probability.",
    "Velocita del vento.": "Wind speed.",
    "Percentuale umidita relativa.": "Relative humidity percentage.",
    "Pressione atmosferica.": "Atmospheric pressure.",
    "Distanza di visibilita.": "Visibility distance.",
    "Indice UV": "UV index",
    "Indice UV attuale.": "Current UV index.",
    "Copertura nuvolosa.": "Cloud coverage.",
    "Punto di rugiada.": "Dew point.",
    "Descrizione meteo sintetica.": "Short weather description.",
    "Temperatura minima e massima.": "Minimum and maximum temperature.",
    "Valore principale con label secondaria.":
      "Primary value with secondary label.",
    "Indicatore stato con glow dinamico.":
      "Status indicator with dynamic glow.",
    "Ring compatto con progress circolare.":
      "Compact ring with circular progress.",
    "Interruttore mini con stato on/off.": "Mini switch with on/off status.",
    "Pulsante con azione push, switch o pagina.":
      "Button with push, switch, or page action.",
    "Controllo numerico per entita input_number/number.":
      "Numeric control for input_number/number entities.",
    "Controllo orizzontale con incremento/decremento su + e -.":
      "Horizontal control with plus and minus adjustment.",
    "Grafico mini live con scelta tipo line/area/bar.":
      "Live mini chart with line, area, or bar style.",
    "Auto (da contenuto)": "Auto (from content)",
    "Manca servizio": "Service missing",
    "JSON non valido": "Invalid JSON",
    "Manca script": "Script missing",
    "Titolo e info": "Title and info",
    "Nome utente": "User name",
    "Con Home Assistant connesso, il saluto usa automaticamente l utente autenticato.":
      "When Home Assistant is connected, the greeting automatically uses the signed-in user.",
    "Usato nei saluti automatici.": "Used in automatic greetings.",
    Titolo: "Title",
    Sottotitolo: "Subtitle",
    "Layout meteo responsive": "Responsive weather layout",
    Unita: "Unit",
    "Entita meteo": "Weather entity",
    "Seconda info": "Secondary info",
    Forecast: "Forecast",
    Layout: "Layout",
    "Suggerimenti live dalle entita weather.* di Home Assistant.":
      "Live suggestions from Home Assistant weather.* entities.",
    "Inserisci manualmente l'entity id weather.* da usare per questa card.":
      "Enter the weather.* entity ID to use for this card.",
    "Consiglio provider": "Provider recommendation",
    Anteprima: "Preview",
    "Scene visibili": "Visible scenes",
    Scene: "Scenes",
    "Nascondi scena": "Hide scene",
    "Mostra scena": "Show scene",
    "Nome scena": "Scene name",
    Icona: "Icon",
    "Tipo azione": "Action type",
    "Entity ID": "Entity ID",
    "Payload JSON": "JSON payload",
    Colonne: "Columns",
    "Auto: la larghezza viene calcolata dalle card interne.":
      "Auto: width is calculated from the cards inside.",
    "Manuale: imposta quante colonne canvas deve occupare lo stack.":
      "Manual: set how many canvas columns the stack occupies.",
    "Questa sezione non e configurabile.": "This section cannot be configured.",
    "Preview live": "Live preview",
    Dimensione: "Size",
    "Espansione automatica": "Automatic expansion",
    "Espansione automatica luce": "Automatic light expansion",
    "Applica a": "Apply to",
    "Questa card": "This card",
    Tutte: "All",
    "Applica solo alla card selezionata": "Apply only to the selected card",
    "Applica a tutte le card dello stesso tipo":
      "Apply to all cards of the same type",
    Avanzato: "Advanced",
    "Controllo manuale colonne × righe": "Manual column × row control",
    Righe: "Rows",
    Entita: "Entity",
    "Suggerimenti live dalle entita disponibili in Home Assistant.":
      "Live suggestions from entities available in Home Assistant.",
    "Entita dimostrative disponibili esclusivamente nella Demo.":
      "Demo entities are available only in Demo mode.",
    "Digita un entity ID oppure verifica la connessione a Home Assistant.":
      "Enter an entity ID or check the Home Assistant connection.",
    "Entita consumo": "Consumption entity",
    "Decimali visualizzati": "Displayed decimals",
    "Entita batteria": "Battery entity",
    "Entita stato": "Status entity",
    "Entita connessione": "Connection entity",
    "Override batteria": "Battery override",
    "Override connessione": "Connection override",
    "Sbloccare i codici di sicurezza?": "Unlock security codes?",
    "I codici resteranno accessibili soltanto fino al refresh o alla chiusura della pagina.":
      "Codes will remain accessible only until refresh or page close.",
    "Sblocca configurazione sicurezza": "Unlock security configuration",
    "Come funziona": "How it works",
    "PIN Home Assistant": "Home Assistant PIN",
    "Codice extra locale": "Extra local code",
    "Codice Home Assistant serratura": "Home Assistant lock code",
    "Ricorda su questo dispositivo": "Remember on this device",
    "Ricorda i codici di questa card sul dispositivo":
      "Remember this card’s codes on the device",
    "Attivita recente": "Recent activity",
    "Elementi visibili": "Visible items",
    "Finestra storico (ore)": "History window (hours)",
    "Dispositivi correlati": "Related devices",
    "Anteprima pannello live": "Live panel preview",
    "Configurazione widget selezionato": "Selected widget configuration",
    Funzione: "Function",
    "Invio segnale": "Signal sending",
    "Pagina destinazione": "Destination page",
    "Invio valore": "Value sending",
    "Tipo grafico": "Chart type",
    "Entita da associare": "Entity to link",
  },
  fr: {
    "Meteo nella card": "Météo dans la carte",
    "Mostra il widget meteo dentro la card saluto.": "Afficher le widget météo dans la carte d’accueil.",
    "Mostra il meteo nella card saluto": "Afficher la météo dans la carte d’accueil",
    "In questa card unificata il meteo usa chip su xs/sm e card previsioni su md/lg.": "Dans cette carte unifiée, la météo utilise des pastilles sur xs/sm et des cartes de prévision sur md/lg.",
    Giornaliero: "Quotidien",
    Orario: "Horaire",
    Servizio: "Service",
    Automatico: "Automatique",
    "1 decimale": "1 décimale",
    decimali: "décimales",
    ore: "heures",
    giorni: "jours",
    colonne: "colonnes",
    righe: "lignes",
    Pioggia: "Pluie",
    Vento: "Vent",
    Umidita: "Humidité",
    Pressione: "Pression",
    Visibilita: "Visibilité",
    Nuvolosita: "Couverture nuageuse",
    Condizione: "Condition",
    "2 colonne": "2 colonnes",
    "2 righe": "2 lignes",
    "4 colonne": "4 colonnes",
    "4 righe": "4 lignes",
    "Stack verticale con una sola colonna.": "Pile verticale à une colonne.",
    "Stack orizzontale: usa la griglia derivata dal canvas.":
      "Pile horizontale : utilise la grille héritée du canevas.",
    "Stack a griglia: larghezza automatica derivata dalle card interne.":
      "Pile en grille : largeur automatique selon ses cartes.",
    "Stack a griglia: larghezza manuale impostata dal pannello.":
      "Pile en grille : largeur manuelle définie dans le panneau.",
    "Automatico usa la precisione suggerita da Home Assistant o il default del device class.":
      "Le mode automatique utilise la précision suggérée par Home Assistant ou celle de la classe d’appareil.",
    "Entita opzionali per metadati sensore. Se lasci vuoto, il pannello contestuale prova a leggere batteria, stato e connessione dagli attributi dell'entita principale.":
      "Entités facultatives pour les métadonnées du capteur. Si elles sont vides, le panneau lit la batterie, l’état et la connexion dans les attributs de l’entité principale.",
    "Di base la dashboard usa il PIN Home Assistant. Se aggiungi un codice extra locale, nel popup inserirai PIN HA + codice extra: ad Home Assistant verra inviato solo il PIN HA. L'autenticazione dispositivo, se attiva, viene provata per prima.":
      "Par défaut, le tableau de bord utilise le code PIN Home Assistant. Avec un code local supplémentaire, la fenêtre demande les deux, mais seul le code PIN Home Assistant est envoyé au serveur. La confirmation de l’appareil est tentée en premier.",
    "Conservato solo fino al refresh. Puoi scegliere sotto se ricordarlo su questo dispositivo.":
      "Conservé uniquement jusqu’à l’actualisation. Vous pouvez choisir ci-dessous de le mémoriser sur cet appareil.",
    "Usa Windows Hello, Face ID, impronta o passkey come metodo rapido prima del PIN allarme.":
      "Utilise Windows Hello, Face ID, une empreinte ou une clé d’accès avant le code PIN de l’alarme.",
    "Viene inviato ad Home Assistant solo quando richiesto. Per default si cancella al refresh.":
      "Envoyé à Home Assistant uniquement lorsque nécessaire. Il est effacé à l’actualisation par défaut.",
    "Prova prima Face ID, impronta, PIN dispositivo o passkey; se non riesce, richiede il codice serratura configurato.":
      "Essaie d’abord Face ID, une empreinte, le code de l’appareil ou une clé d’accès ; en cas d’échec, demande le code de serrure configuré.",
    "Automatico (Home Assistant)": "Automatique (Home Assistant)",
    "Auto responsive": "Auto adaptatif",
    "Passa automaticamente tra chip e card in base allo spazio disponibile.":
      "Bascule automatiquement entre la puce et la carte selon l’espace disponible.",
    "Chip fisso 2x2": "Puce fixe 2x2",
    "Formato compatto: temperatura, icona animata e seconda info.":
      "Format compact : température, icône animée et information secondaire.",
    "Card fissa 4x4": "Carte fixe 4x4",
    "Formato esteso: header meteo completo con previsioni sottostanti.":
      "Format étendu : en-tête météo complet avec prévisions.",
    "Scelta automatica in base ai dati disponibili.":
      "Choix automatique selon les données disponibles.",
    "Probabilita di precipitazione.": "Probabilité de précipitations.",
    "Velocita del vento.": "Vitesse du vent.",
    "Percentuale umidita relativa.": "Pourcentage d’humidité relative.",
    "Pressione atmosferica.": "Pression atmosphérique.",
    "Distanza di visibilita.": "Distance de visibilité.",
    "Indice UV": "Indice UV",
    "Indice UV attuale.": "Indice UV actuel.",
    "Copertura nuvolosa.": "Couverture nuageuse.",
    "Punto di rugiada.": "Point de rosée.",
    "Descrizione meteo sintetica.": "Description météo courte.",
    "Temperatura minima e massima.": "Température minimale et maximale.",
    "Valore principale con label secondaria.":
      "Valeur principale avec libellé secondaire.",
    "Indicatore stato con glow dinamico.":
      "Indicateur d’état avec halo dynamique.",
    "Ring compatto con progress circolare.":
      "Anneau compact avec progression circulaire.",
    "Interruttore mini con stato on/off.":
      "Mini interrupteur avec état activé/désactivé.",
    "Pulsante con azione push, switch o pagina.":
      "Bouton avec action, interrupteur ou page.",
    "Controllo numerico per entita input_number/number.":
      "Commande numérique pour les entités input_number/number.",
    "Controllo orizzontale con incremento/decremento su + e -.":
      "Commande horizontale avec réglage plus et moins.",
    "Grafico mini live con scelta tipo line/area/bar.":
      "Mini graphique en direct de type ligne, zone ou barres.",
    "Auto (da contenuto)": "Auto (selon le contenu)",
    "Manca servizio": "Service manquant",
    "JSON non valido": "JSON invalide",
    "Manca script": "Script manquant",
    "Titolo e info": "Titre et informations",
    "Nome utente": "Nom d’utilisateur",
    "Con Home Assistant connesso, il saluto usa automaticamente l utente autenticato.":
      "Lorsque Home Assistant est connecté, le message utilise automatiquement l’utilisateur authentifié.",
    "Usato nei saluti automatici.": "Utilisé dans les messages automatiques.",
    Titolo: "Titre",
    Sottotitolo: "Sous-titre",
    "Layout meteo responsive": "Disposition météo adaptative",
    Unita: "Unité",
    "Entita meteo": "Entité météo",
    "Seconda info": "Information secondaire",
    Forecast: "Prévisions",
    Layout: "Disposition",
    "Suggerimenti live dalle entita weather.* di Home Assistant.":
      "Suggestions en direct des entités weather.* de Home Assistant.",
    "Inserisci manualmente l'entity id weather.* da usare per questa card.":
      "Saisissez l’identifiant weather.* à utiliser pour cette carte.",
    "Consiglio provider": "Conseil sur le fournisseur",
    Anteprima: "Aperçu",
    "Scene visibili": "Scènes visibles",
    Scene: "Scènes",
    "Nascondi scena": "Masquer la scène",
    "Mostra scena": "Afficher la scène",
    "Nome scena": "Nom de la scène",
    Icona: "Icône",
    "Tipo azione": "Type d’action",
    "Entity ID": "ID de l’entité",
    "Payload JSON": "Charge utile JSON",
    Colonne: "Colonnes",
    "Auto: la larghezza viene calcolata dalle card interne.":
      "Auto : la largeur est calculée selon les cartes internes.",
    "Manuale: imposta quante colonne canvas deve occupare lo stack.":
      "Manuel : définissez le nombre de colonnes occupées par la pile.",
    "Questa sezione non e configurabile.":
      "Cette section ne peut pas être configurée.",
    "Preview live": "Aperçu en direct",
    Dimensione: "Taille",
    "Espansione automatica": "Extension automatique",
    "Espansione automatica luce": "Extension automatique de la lumière",
    "Applica a": "Appliquer à",
    "Questa card": "Cette carte",
    Tutte: "Toutes",
    "Applica solo alla card selezionata":
      "Appliquer uniquement à la carte sélectionnée",
    "Applica a tutte le card dello stesso tipo":
      "Appliquer à toutes les cartes du même type",
    Avanzato: "Avancé",
    "Controllo manuale colonne × righe": "Contrôle manuel colonnes × lignes",
    Righe: "Lignes",
    Entita: "Entité",
    "Suggerimenti live dalle entita disponibili in Home Assistant.":
      "Suggestions en direct des entités disponibles dans Home Assistant.",
    "Entita dimostrative disponibili esclusivamente nella Demo.":
      "Les entités de démonstration sont disponibles uniquement en mode Démo.",
    "Digita un entity ID oppure verifica la connessione a Home Assistant.":
      "Saisissez un identifiant d’entité ou vérifiez la connexion Home Assistant.",
    "Entita consumo": "Entité de consommation",
    "Decimali visualizzati": "Décimales affichées",
    "Entita batteria": "Entité de batterie",
    "Entita stato": "Entité d’état",
    "Entita connessione": "Entité de connexion",
    "Override batteria": "Remplacement de la batterie",
    "Override connessione": "Remplacement de la connexion",
    "Sbloccare i codici di sicurezza?": "Déverrouiller les codes de sécurité ?",
    "I codici resteranno accessibili soltanto fino al refresh o alla chiusura della pagina.":
      "Les codes resteront accessibles uniquement jusqu’à l’actualisation ou la fermeture de la page.",
    "Sblocca configurazione sicurezza":
      "Déverrouiller la configuration de sécurité",
    "Come funziona": "Fonctionnement",
    "PIN Home Assistant": "Code PIN Home Assistant",
    "Codice extra locale": "Code local supplémentaire",
    "Codice Home Assistant serratura": "Code de serrure Home Assistant",
    "Ricorda su questo dispositivo": "Mémoriser sur cet appareil",
    "Ricorda i codici di questa card sul dispositivo":
      "Mémoriser les codes de cette carte sur l’appareil",
    "Attivita recente": "Activité récente",
    "Elementi visibili": "Éléments visibles",
    "Finestra storico (ore)": "Période de l’historique (heures)",
    "Dispositivi correlati": "Appareils associés",
    "Anteprima pannello live": "Aperçu du panneau en direct",
    "Configurazione widget selezionato": "Configuration du widget sélectionné",
    Funzione: "Fonction",
    "Invio segnale": "Envoi du signal",
    "Pagina destinazione": "Page de destination",
    "Invio valore": "Envoi de la valeur",
    "Tipo grafico": "Type de graphique",
    "Entita da associare": "Entité à associer",
  },
} as const;

export function translateBuilderDetail(locale: AppLocale, value: string) {
  if (locale === "it") return value;
  return (copy[locale] as Record<string, string>)[value] ?? value;
}
