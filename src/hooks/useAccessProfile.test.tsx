import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAccessProfile } from './useAccessProfile';
import { DEMO_ACCESS } from '../security/accessControl';
import type { HaAuthUser } from '../services/haIdentityPresentation';
import { accessProfileFor, getSelfAnswer } from '../test/accessFixtures';

const ADMIN_ID = 'a'.repeat(32);
const MEMBER_ID = 'b'.repeat(32);
const account = (id: string, isAdmin = false): HaAuthUser => ({ id, name: id.slice(0, 4), isAdmin, isOwner: false }) as HaAuthUser;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type Props = { identity: HaAuthUser | null; runtimeMode?: 'real' | 'demo' };

function renderProfile(callApi: (message: Record<string, unknown>) => Promise<unknown>, initial: Props) {
  return renderHook(({ identity, runtimeMode = 'real' }: Props) => useAccessProfile({ runtimeMode, identity, callApi }), {
    initialProps: initial,
  });
}

describe('useAccessProfile', () => {
  it('is loading until the backend answers, then ready, and asks with nothing but the command type', async () => {
    const answer = deferred<unknown>();
    const callApi = vi.fn(() => answer.promise);
    const admin = account(ADMIN_ID, true);
    const { result } = renderProfile(callApi, { identity: admin });
    expect(result.current.access.status).toBe('loading');
    expect(result.current.access.can('ha_frontend.open')).toBe(false);
    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/access/get_self' }, { reportError: false, throwOnError: true });

    await act(async () => answer.resolve(getSelfAnswer(accessProfileFor('admin', { userId: ADMIN_ID }))));
    expect(result.current.access.status).toBe('ready');
    expect(result.current.access.can('ha_frontend.open')).toBe(true);
  });

  it('asks nothing while there is no account, and stays loading', () => {
    const callApi = vi.fn();
    const { result } = renderProfile(callApi, { identity: null });
    expect(callApi).not.toHaveBeenCalled();
    expect(result.current.access.status).toBe('loading');
  });

  it('marks an untrusted policy as locked', async () => {
    const member = account(MEMBER_ID);
    const callApi = vi.fn(async () => getSelfAnswer(accessProfileFor('locked', { userId: MEMBER_ID })));
    const { result } = renderProfile(callApi, { identity: member });
    await waitFor(() => expect(result.current.access.status).toBe('locked'));
    expect(result.current.access.can('dashboard.view')).toBe(true);
    expect(result.current.access.can('energy.view')).toBe(false);
  });

  it.each([
    ['unavailable', { code: 'unknown_command', message: 'Unknown command.' }],
    ['unavailable', new Error('Comando non ammesso dal bridge')],
    ['error', new Error('socket closed')],
  ] as const)('is %s, with nothing granted, when the backend fails with %o', async (status, error) => {
    const callApi = vi.fn(async () => {
      throw error;
    });
    const { result } = renderProfile(callApi, { identity: account(MEMBER_ID) });
    await waitFor(() => expect(result.current.access.status).toBe(status));
    expect(result.current.access.can('dashboard.view')).toBe(false);
  });

  it('refuses an answer for another account', async () => {
    const callApi = vi.fn(async () => getSelfAnswer(accessProfileFor('admin', { userId: ADMIN_ID })));
    const { result } = renderProfile(callApi, { identity: account(MEMBER_ID) });
    await waitFor(() => expect(result.current.access.status).toBe('error'));
    expect(result.current.access.can('dashboard.view')).toBe(false);
  });

  it('drops the previous account in the same render and never shows its permissions to the next one', async () => {
    const memberAnswer = deferred<unknown>();
    const callApi = vi
      .fn()
      .mockResolvedValueOnce(getSelfAnswer(accessProfileFor('admin', { userId: ADMIN_ID })))
      .mockReturnValueOnce(memberAnswer.promise);
    const admin = account(ADMIN_ID, true);
    const { result, rerender } = renderProfile(callApi, { identity: admin });
    await waitFor(() => expect(result.current.access.can('ha_frontend.open')).toBe(true));

    rerender({ identity: account(MEMBER_ID) });
    expect(result.current.access.status).toBe('loading');
    expect(result.current.access.can('ha_frontend.open')).toBe(false);

    await act(async () => memberAnswer.resolve(getSelfAnswer(accessProfileFor('member', { userId: MEMBER_ID }))));
    expect(result.current.access.status).toBe('ready');
    expect(result.current.access.can('ha_frontend.open')).toBe(false);
    expect(result.current.access.can('energy.view')).toBe(true);
  });

  it('asks again after a reconnection, even for the same account', async () => {
    const callApi = vi.fn(async () => getSelfAnswer(accessProfileFor('member', { userId: MEMBER_ID })));
    const { result, rerender } = renderProfile(callApi, { identity: account(MEMBER_ID) });
    await waitFor(() => expect(result.current.access.status).toBe('ready'));

    rerender({ identity: null });
    expect(result.current.access.status).toBe('loading');
    rerender({ identity: account(MEMBER_ID) });
    expect(result.current.access.status).toBe('loading');
    await waitFor(() => expect(result.current.access.status).toBe('ready'));
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('does not ask again while the same account object stays', async () => {
    const callApi = vi.fn(async () => getSelfAnswer(accessProfileFor('member', { userId: MEMBER_ID })));
    const member = account(MEMBER_ID);
    const { result, rerender } = renderProfile(callApi, { identity: member });
    await waitFor(() => expect(result.current.access.status).toBe('ready'));
    rerender({ identity: member });
    rerender({ identity: member });
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('replaces the profile in one step on refresh, keeping the current one meanwhile', async () => {
    const second = deferred<unknown>();
    const callApi = vi
      .fn()
      .mockResolvedValueOnce(getSelfAnswer(accessProfileFor('member', { userId: MEMBER_ID })))
      .mockReturnValueOnce(second.promise);
    const { result } = renderProfile(callApi, { identity: account(MEMBER_ID) });
    await waitFor(() => expect(result.current.access.status).toBe('ready'));
    expect(result.current.access.can('security.control')).toBe(false);

    act(() => result.current.refresh());
    expect(result.current.access.status).toBe('ready');
    expect(result.current.access.can('energy.view')).toBe(true);

    await act(async () =>
      second.resolve(getSelfAnswer(accessProfileFor('member', { userId: MEMBER_ID, grants: ['security.control'], revision: 3 }))),
    );
    expect(result.current.access.can('security.control')).toBe(true);
    expect(result.current.access.profile?.revision).toBe(3);
  });

  it('ignores an answer that arrives after its account went away', async () => {
    const late = deferred<unknown>();
    const callApi = vi.fn(() => late.promise);
    const { result, rerender } = renderProfile(callApi, { identity: account(ADMIN_ID, true) });
    rerender({ identity: null });
    await act(async () => late.resolve(getSelfAnswer(accessProfileFor('admin', { userId: ADMIN_ID }))));
    expect(result.current.access.status).toBe('loading');
  });

  it('gives the demo its own profile without asking anything', () => {
    const callApi = vi.fn();
    const { result } = renderProfile(callApi, { identity: null, runtimeMode: 'demo' });
    expect(result.current.access).toBe(DEMO_ACCESS);
    expect(callApi).not.toHaveBeenCalled();
  });
});
