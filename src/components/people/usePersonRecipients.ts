import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listRecipients,
  toRecipientsError,
  type PersonRecipient,
  type ProfileRecipientsCallApi,
  type RecipientsErrorCode,
} from '../../services/profileRecipientsClient';

export type PersonRecipientsState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  recipients: PersonRecipient[];
  error: RecipientsErrorCode | null;
};

/**
 * Read the recipient list on demand: when the picker opens and on Refresh.
 * No polling, no subscription. A failed refresh keeps the last good list.
 */
export function usePersonRecipients(callApi: ProfileRecipientsCallApi | undefined) {
  const [state, setState] = useState<PersonRecipientsState>({ status: 'idle', recipients: [], error: null });
  const callApiRef = useRef(callApi);
  callApiRef.current = callApi;
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const api = callApiRef.current;
    if (!api) return;
    const request = ++requestRef.current;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const recipients = await listRecipients(api);
      if (mountedRef.current && request === requestRef.current) setState({ status: 'ready', recipients, error: null });
    } catch (error) {
      if (mountedRef.current && request === requestRef.current) {
        setState((current) => ({ ...current, status: 'error', error: toRecipientsError(error).code }));
      }
    }
  }, []);

  return { state, load };
}
