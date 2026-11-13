import { useCallback } from 'react';
import { useI18n, type AppLocale } from './I18nProvider';

/** The words Access Control shows in the interface; no technical term, no capability name. */
const it = {
  dismiss: 'Chiudi',
  lockedAction: 'Apri Ruoli e permessi',
  cardUnavailable: 'Non disponibile',
  checking: 'Verifica dell’account…',
  deniedTitle: 'Non disponibile per il tuo account',
  deniedBody: 'Questa parte di Domus non è disponibile con il tuo account. Puoi continuare dalle altre sezioni.',
  goHome: 'Vai alla Home',
  offlineTitle: 'Home Assistant non collegato',
  offlineBody: 'Senza connessione Domus non sa quale account sta usando: le sezioni tornano appena Home Assistant risponde.',
  errorTitle: 'Autorizzazioni non disponibili',
  errorBody:
    'Domus non è riuscita a leggere cosa può fare il tuo account. Finché non ci riesce, non mostra le sezioni che ne dipendono.',
  retry: 'Riprova',
  unavailableTitle: 'Domus non è pronta',
  unavailableBody:
    'Home Assistant non risponde alle autorizzazioni di Domus. Aggiorna o ricarica l’integrazione Domus UI, poi riprova.',
  lockedTitle: 'Le autorizzazioni Domus richiedono attenzione',
  lockedBody: 'Le autorizzazioni salvate non sono leggibili: Domus mostra solo l’essenziale finché non vengono ripristinate.',
  lockedAdminBody:
    'Le autorizzazioni salvate non sono leggibili: Domus mostra solo l’essenziale. Un amministratore di Home Assistant può ripristinarle.',
};

type AccessCopyKey = keyof typeof it;

const en: Record<AccessCopyKey, string> = {
  dismiss: 'Dismiss',
  lockedAction: 'Open Roles and permissions',
  cardUnavailable: 'Not available',
  checking: 'Checking your account…',
  deniedTitle: 'Not available for your account',
  deniedBody: 'This part of Domus is not available with your account. You can carry on from the other sections.',
  goHome: 'Go to Home',
  offlineTitle: 'Home Assistant not connected',
  offlineBody: 'Without a connection Domus does not know which account is in use: the sections come back as soon as Home Assistant answers.',
  errorTitle: 'Permissions unavailable',
  errorBody:
    'Domus could not read what your account can do. Until it can, it does not show the sections that depend on it.',
  retry: 'Try again',
  unavailableTitle: 'Domus is not ready',
  unavailableBody:
    'Home Assistant does not answer Domus permissions. Update or reload the Domus UI integration, then try again.',
  lockedTitle: 'Domus permissions need attention',
  lockedBody: 'The saved permissions cannot be read: Domus shows only the essentials until they are restored.',
  lockedAdminBody:
    'The saved permissions cannot be read: Domus shows only the essentials. A Home Assistant administrator can restore them.',
};

const fr: Record<AccessCopyKey, string> = {
  dismiss: 'Fermer',
  lockedAction: 'Ouvrir Rôles et autorisations',
  cardUnavailable: 'Non disponible',
  checking: 'Vérification du compte…',
  deniedTitle: 'Non disponible pour votre compte',
  deniedBody: 'Cette partie de Domus n’est pas disponible avec votre compte. Vous pouvez continuer depuis les autres sections.',
  goHome: 'Aller à l’accueil',
  offlineTitle: 'Home Assistant non connecté',
  offlineBody: 'Sans connexion, Domus ne sait pas quel compte est utilisé : les sections reviennent dès que Home Assistant répond.',
  errorTitle: 'Autorisations indisponibles',
  errorBody:
    'Domus n’a pas pu lire ce que votre compte peut faire. Tant qu’elle n’y parvient pas, elle n’affiche pas les sections qui en dépendent.',
  retry: 'Réessayer',
  unavailableTitle: 'Domus n’est pas prête',
  unavailableBody:
    'Home Assistant ne répond pas aux autorisations de Domus. Mettez à jour ou rechargez l’intégration Domus UI, puis réessayez.',
  lockedTitle: 'Les autorisations Domus demandent votre attention',
  lockedBody: 'Les autorisations enregistrées sont illisibles : Domus n’affiche que l’essentiel jusqu’à leur restauration.',
  lockedAdminBody:
    'Les autorisations enregistrées sont illisibles : Domus n’affiche que l’essentiel. Un administrateur de Home Assistant peut les restaurer.',
};

const hu: Record<AccessCopyKey, string> = {
  dismiss: 'Elvetés',
  lockedAction: 'Szerepkörök és jogosultságok megnyitása',
  cardUnavailable: 'Nem elérhető',
  checking: 'Fiók ellenőrzése…',
  deniedTitle: 'A fiókodhoz nem elérhető',
  deniedBody: 'A Domus ezen része a fiókoddal nem érhető el. A többi részben folytathatod.',
  goHome: 'Ugrás az Otthon oldalra',
  offlineTitle: 'A Home Assistant nincs csatlakoztatva',
  offlineBody: 'Kapcsolat nélkül a Domus nem tudja, melyik fiók van használatban: a részek visszatérnek, amint a Home Assistant válaszol.',
  errorTitle: 'A jogosultságok nem elérhetők',
  errorBody:
    'A Domus nem tudta kiolvasni, mire jogosult a fiókod. Amíg ez nem sikerül, nem jeleníti meg az ettől függő részeket.',
  retry: 'Újrapróbálás',
  unavailableTitle: 'A Domus nem áll készen',
  unavailableBody:
    'A Home Assistant nem válaszol a Domus jogosultsági kérésére. Frissítsd vagy töltsd újra a Domus UI integrációt, majd próbáld újra.',
  lockedTitle: 'A Domus jogosultságai figyelmet igényelnek',
  lockedBody: 'A mentett jogosultságok nem olvashatók: a Domus csak a legszükségesebbet mutatja, amíg helyre nem állnak.',
  lockedAdminBody:
    'A mentett jogosultságok nem olvashatók: a Domus csak a legszükségesebbet mutatja. Egy Home Assistant rendszergazda helyreállíthatja őket.',
};

const COPY: Record<AppLocale, Record<AccessCopyKey, string>> = { it, en, fr, hu };

export type { AccessCopyKey };

export function useAccessCopy() {
  const { locale } = useI18n();
  return useCallback((key: AccessCopyKey) => COPY[locale]?.[key] ?? it[key], [locale]);
}
