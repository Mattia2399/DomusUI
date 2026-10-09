import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranslationKey } from '../i18n/translations';
import {
  addDevice,
  getSelf,
  removeDevice,
  saveNotifications,
  toProfileClientError,
  updateDevice,
  type DeviceUpdate,
  type ProfileCallApi,
  type ProfileErrorCode,
  type ProfileSnapshot,
} from '../services/profileClient';
import { PROFILE_ERROR_LABEL } from '../services/profileDevicesModel';

export type PersonalDevicesFeedback = { tone: 'success' | 'error' | 'info'; key: TranslationKey };

export type PersonalDevicesState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshot: ProfileSnapshot | null;
  loadError: ProfileErrorCode | null;
  feedback: PersonalDevicesFeedback | null;
  /** Devices with a command in flight; their controls stay disabled meanwhile. */
  pendingDeviceIds: ReadonlySet<string>;
  generalPending: boolean;
};

/**
 * One source of truth for the personal devices page.
 *
 * The profile is read once when the page opens. Every change is sent with the
 * revision the page holds and replaced by the server's answer; commands run
 * one at a time so each uses the latest revision. A revision conflict is
 * never retried: the profile is read again and the user is told.
 */
export function usePersonalDevices({ callApi, enabled }: { callApi?: ProfileCallApi; enabled: boolean }) {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
  const [status, setStatus] = useState<PersonalDevicesState['status']>('idle');
  const [loadError, setLoadError] = useState<ProfileErrorCode | null>(null);
  const [feedback, setFeedback] = useState<PersonalDevicesFeedback | null>(null);
  const [pendingDeviceIds, setPendingDeviceIds] = useState<ReadonlySet<string>>(new Set());
  const [generalPending, setGeneralPending] = useState(false);
  const snapshotRef = useRef<ProfileSnapshot | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);
  // Kept in a ref so a new function identity never triggers another read.
  const callApiRef = useRef(callApi);
  callApiRef.current = callApi;
  const hasCallApi = Boolean(callApi);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback((next: ProfileSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const reload = useCallback(async () => {
    const api = callApiRef.current;
    if (!api) return null;
    if (mountedRef.current) {
      setStatus((current) => (current === 'ready' ? current : 'loading'));
      setLoadError(null);
    }
    try {
      const next = await getSelf(api);
      apply(next);
      if (mountedRef.current) setStatus('ready');
      return next;
    } catch (error) {
      if (mountedRef.current) {
        setLoadError(toProfileClientError(error).code);
        setStatus(snapshotRef.current ? 'ready' : 'error');
      }
      return null;
    }
  }, [apply]);

  useEffect(() => {
    if (!enabled || !hasCallApi) return;
    void reload();
  }, [enabled, hasCallApi, reload]);

  const mark = (deviceId: string, pending: boolean) =>
    setPendingDeviceIds((current) => {
      const next = new Set(current);
      if (pending) next.add(deviceId);
      else next.delete(deviceId);
      return next;
    });

  /** Run one command after the previous one, with the revision current at that moment. */
  const run = useCallback(
    (command: (api: ProfileCallApi, revision: number) => Promise<ProfileSnapshot>, success?: TranslationKey) => {
      const task = queueRef.current.then(async () => {
        const api = callApiRef.current;
        const current = snapshotRef.current;
        if (!api || !current) return false;
        try {
          apply(await command(api, current.revision));
          if (mountedRef.current && success) setFeedback({ tone: 'success', key: success });
          return true;
        } catch (error) {
          const code = toProfileClientError(error).code;
          if (code === 'revision_conflict') {
            await reload();
            if (mountedRef.current) setFeedback({ tone: 'info', key: PROFILE_ERROR_LABEL.revision_conflict });
          } else if (mountedRef.current) {
            setFeedback({ tone: 'error', key: PROFILE_ERROR_LABEL[code] });
          }
          return false;
        }
      });
      queueRef.current = task.catch(() => undefined);
      return task;
    },
    [apply, reload],
  );

  const setGeneralNotifications = useCallback(
    async (enabledValue: boolean) => {
      setGeneralPending(true);
      try {
        return await run((api, revision) => saveNotifications(api, revision, enabledValue));
      } finally {
        if (mountedRef.current) setGeneralPending(false);
      }
    },
    [run],
  );

  const changeDevice = useCallback(
    async (deviceId: string, update: DeviceUpdate, success?: TranslationKey) => {
      mark(deviceId, true);
      try {
        return await run((api, revision) => updateDevice(api, revision, deviceId, update), success);
      } finally {
        if (mountedRef.current) mark(deviceId, false);
      }
    },
    [run],
  );

  const deleteDevice = useCallback(
    async (deviceId: string) => {
      mark(deviceId, true);
      try {
        return await run((api, revision) => removeDevice(api, revision, deviceId), 'profile.devices.feedback.removed');
      } finally {
        if (mountedRef.current) mark(deviceId, false);
      }
    },
    [run],
  );

  const claimDevice = useCallback(
    (haDeviceId: string) =>
      run((api, revision) => addDevice(api, revision, haDeviceId), 'profile.devices.feedback.added'),
    [run],
  );

  const state: PersonalDevicesState = useMemo(
    () => ({ status, snapshot, loadError, feedback, pendingDeviceIds, generalPending }),
    [feedback, generalPending, loadError, pendingDeviceIds, snapshot, status],
  );

  return {
    state,
    reload,
    clearFeedback: () => setFeedback(null),
    setGeneralNotifications,
    setDeviceNotifications: (deviceId: string, value: boolean) =>
      changeDevice(deviceId, { notificationsEnabled: value }),
    renameDevice: (deviceId: string, label: string | null) =>
      changeDevice(deviceId, { label }, 'profile.devices.feedback.renamed'),
    deleteDevice,
    claimDevice,
  };
}
