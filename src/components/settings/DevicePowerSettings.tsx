import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Link2,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  Trash2,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useDevicePowerCopy, type DevicePowerCopyKey } from '../../i18n/devicePowerCopy';
import {
  bindDevicePowerPolicy,
  deleteDevicePowerPolicy,
  draftFromPolicy,
  getDevicePowerState,
  saveDevicePowerPolicy,
  toDevicePowerClientError,
  validatePolicyDraft,
  type DevicePowerCallApi,
  type DevicePowerState,
  type PolicyDraft,
  type PolicyDraftErrors,
  type PolicyRuntimeStatus,
  type PowerPolicy,
} from '../../services/devicePowerClient';
import { getOrCreateDomusClientId } from '../../services/domusClientId';
import type { MockEntityStateMap } from '../../types/ha';
import GlassCombobox from '../ui/GlassCombobox';
import GlassModal from '../ui/GlassModal';
import GlassToggle from '../ui/GlassToggle';
import ProfileGroup from './ProfileGroup';
import { SettingsListRow } from './SettingsList';

// The runtime is read again while the page is open; the controllers do not wait for it.
const REFRESH_INTERVAL_MS = 15_000;

const INPUT = 'ui-input min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-sm';
const PRIMARY_BUTTON =
  'liquid-glass-selection inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45';
const DANGER_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/[0.07] px-5 text-sm font-semibold text-rose-500 disabled:opacity-45';
const QUIET_BUTTON =
  'liquid-glass-control inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-45';

const STATUS_COPY: Record<PolicyRuntimeStatus, DevicePowerCopyKey> = {
  disabled: 'statusDisabled',
  starting: 'statusStarting',
  charging: 'statusCharging',
  waiting: 'statusWaiting',
  battery_unavailable: 'statusBatteryUnavailable',
  switch_unavailable: 'statusSwitchUnavailable',
  error: 'statusError',
};

const FIELD_ERROR_COPY: Record<NonNullable<PolicyDraftErrors[keyof PolicyDraftErrors]>, DevicePowerCopyKey> = {
  required: 'errorRequired',
  range: 'errorRange',
  order: 'errorOrder',
  length: 'errorLength',
  domain: 'errorDomain',
};

type DevicePowerSettingsProps = {
  callApi?: DevicePowerCallApi;
  connected: boolean;
  /** The integration offers device power management (`device_power_v1`). */
  supported: boolean;
  /** Home Assistant administrators only; the server checks it again. */
  isAdmin: boolean;
  haStates: MockEntityStateMap;
};

type Feedback = { tone: 'success' | 'error'; text: string } | null;

function sameDraft(first: PolicyDraft, second: PolicyDraft) {
  return (Object.keys(first) as (keyof PolicyDraft)[]).every((key) => first[key] === second[key]);
}

function friendlyName(states: MockEntityStateMap, entityId: string) {
  const name = states[entityId]?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId;
}

/** The live level, read like the controller does; `fallback` only when the entity is not in view. */
function batteryLevel(states: MockEntityStateMap, entityId: string, fallback: number | null): number | null {
  const raw = entityId ? states[entityId]?.state : undefined;
  if (raw === undefined) return fallback;
  const level = Number(raw);
  return raw.trim() !== '' && Number.isFinite(level) && level >= 0 && level <= 100 ? level : null;
}

function switchOn(states: MockEntityStateMap, entityId: string, fallback: boolean | null): boolean | null {
  const raw = entityId ? states[entityId]?.state : undefined;
  if (raw === undefined) return fallback;
  return raw === 'on' ? true : raw === 'off' ? false : null;
}

function Notice({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <section role="status" className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 shrink-0 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {body ? <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{body}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

/** Settings › This device › Power and charging. */
export function DevicePowerSettings({ callApi, connected, supported, isAdmin, haStates }: DevicePowerSettingsProps) {
  const c = useDevicePowerCopy();
  const fieldId = useId();
  const clientId = useMemo(() => getOrCreateDomusClientId(), []);
  const [state, setState] = useState<DevicePowerState | null>(null);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(null));
  const [baseline, setBaseline] = useState<PolicyDraft>(() => draftFromPolicy(null));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PowerPolicy | null>(null);
  const usable = supported && isAdmin && connected && Boolean(callApi);

  const bound = state?.policies.find((policy) => clientId !== null && policy.clientId === clientId) ?? null;
  const others = state?.policies.filter((policy) => policy !== bound) ?? [];
  const dirty = !sameDraft(draft, baseline);
  const validation = validatePolicyDraft(draft);

  // The draft is replaced by a newer version only while nobody has touched it.
  const baselineRef = useRef(baseline);
  const adopt = useCallback(
    (next: DevicePowerState, options: { resetDraft?: boolean } = {}) => {
      setState(next);
      const nextBound = next.policies.find((policy) => clientId !== null && policy.clientId === clientId) ?? null;
      const nextBaseline = draftFromPolicy(nextBound);
      const previous = baselineRef.current;
      baselineRef.current = nextBaseline;
      setBaseline(nextBaseline);
      setDraft((current) => (options.resetDraft || sameDraft(current, previous) ? nextBaseline : current));
      if (options.resetDraft) setShowErrors(false);
    },
    [clientId],
  );

  const refresh = useCallback(
    async (options: { resetDraft?: boolean; background?: boolean } = {}) => {
      if (!callApi) return;
      try {
        const next = await getDevicePowerState(callApi);
        adopt(next, options);
        setLoad('ready');
      } catch (error) {
        const { code } = toDevicePowerClientError(error);
        // A missed periodic read keeps what is shown; the next one tries again.
        if (options.background && code !== 'unsupported') return;
        setLoad(code === 'unsupported' ? 'unsupported' : 'error');
      }
    },
    [adopt, callApi],
  );

  useEffect(() => {
    if (!usable) return undefined;
    void refresh({ resetDraft: true });
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh({ background: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh, usable]);

  const entityOptions = useMemo(() => {
    const battery: string[] = [];
    const switches: string[] = [];
    for (const [entityId, entity] of Object.entries(haStates)) {
      if (entityId.startsWith('switch.')) switches.push(entityId);
      if (!entityId.startsWith('sensor.')) continue;
      const deviceClass = entity.rawAttributes?.device_class;
      const unit = entity.unit ?? entity.rawAttributes?.unit_of_measurement;
      if (deviceClass === 'battery' || unit === '%') battery.push(entityId);
    }
    const byBatteryClass = (first: string, second: string) =>
      Number(haStates[second]?.rawAttributes?.device_class === 'battery') -
        Number(haStates[first]?.rawAttributes?.device_class === 'battery') ||
      friendlyName(haStates, first).localeCompare(friendlyName(haStates, second));
    // A chosen entity stays listed even when it no longer looks like a battery.
    if (draft.batteryEntityId && !battery.includes(draft.batteryEntityId)) battery.push(draft.batteryEntityId);
    if (draft.switchEntityId && !switches.includes(draft.switchEntityId)) switches.push(draft.switchEntityId);
    return {
      battery: battery.sort(byBatteryClass),
      switches: switches.sort((first, second) => friendlyName(haStates, first).localeCompare(friendlyName(haStates, second))),
    };
  }, [draft.batteryEntityId, draft.switchEntityId, haStates]);

  const describeError = (code: string) =>
    code === 'switch_in_use' ? c('switchInUse') : code === 'client_already_bound' ? c('clientBound') : c('saveError');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      const { code } = toDevicePowerClientError(error);
      if (code === 'revision_conflict' || code === 'policy_not_found') {
        await refresh({ resetDraft: true });
        setFeedback({ tone: 'error', text: c('conflict') });
      } else {
        setFeedback({ tone: 'error', text: describeError(code) });
      }
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    setShowErrors(true);
    if (!callApi || !validation.settings) return;
    if (!clientId) {
      setFeedback({ tone: 'error', text: c('noClientId') });
      return;
    }
    const settings = { ...validation.settings, clientId };
    void run(async () => {
      const next = await saveDevicePowerPolicy(
        callApi,
        settings,
        bound ? { policyId: bound.policyId, revision: bound.revision } : undefined,
      );
      adopt(next, { resetDraft: true });
      setFeedback({ tone: 'success', text: c('saved') });
    });
  };

  const link = (policy: PowerPolicy) => {
    if (!callApi) return;
    if (!clientId) {
      setFeedback({ tone: 'error', text: c('noClientId') });
      return;
    }
    void run(async () => {
      adopt(await bindDevicePowerPolicy(callApi, policy, clientId), { resetDraft: true });
      setFeedback({ tone: 'success', text: c('linked') });
    });
  };

  const remove = () => {
    const target = pendingRemoval;
    setPendingRemoval(null);
    if (!callApi || !target) return;
    void run(async () => {
      adopt(await deleteDevicePowerPolicy(callApi, target), { resetDraft: target === bound });
      setFeedback({ tone: 'success', text: c('removed') });
    });
  };

  if (!supported || load === 'unsupported') {
    return <Notice icon={PlugZap} title={c('unsupportedTitle')} body={c('unsupportedBody')} />;
  }
  if (!isAdmin) {
    return <Notice icon={LockKeyhole} title={c('title')} body={c('adminOnly')} />;
  }
  if (!connected || !callApi) {
    return <Notice icon={WifiOff} title={c('title')} body={c('offline')} />;
  }
  if (load === 'loading') {
    return <Notice icon={RefreshCw} title={c('loading')} />;
  }
  if (load === 'error' || !state) {
    return (
      <Notice icon={AlertTriangle} title={c('loadError')}>
        <button type="button" className={`${QUIET_BUTTON} mt-4`} onClick={() => void refresh({ resetDraft: true })}>
          <RefreshCw size={15} aria-hidden="true" />
          {c('retry')}
        </button>
      </Notice>
    );
  }
  if (state.status !== 'ready') {
    return <Notice icon={AlertTriangle} title={c('corruptTitle')} body={c('corruptBody')} />;
  }

  const statusLabel = !bound
    ? c('statusIncomplete')
    : !bound.enabled
      ? c('statusDisabled')
      : c(STATUS_COPY[bound.runtime.status]);
  const statusWarning = Boolean(
    bound && bound.enabled && ['battery_unavailable', 'switch_unavailable', 'error'].includes(bound.runtime.status),
  );
  // The entities being chosen, so their values show before the first save.
  const batteryId = draft.batteryEntityId || bound?.batteryEntityId || '';
  const switchId = draft.switchEntityId || bound?.switchEntityId || '';
  const level = batteryLevel(haStates, batteryId, bound?.batteryEntityId === batteryId ? bound.runtime.batteryLevel : null);
  const power = switchOn(haStates, switchId, bound?.switchEntityId === switchId ? bound.runtime.switchOn : null);
  const errors = showErrors ? validation.errors : {};
  // The picker shows the entity id; its name is repeated under it.
  const chosenName = (entityId: string) =>
    entityId && haStates[entityId] && friendlyName(haStates, entityId) !== entityId ? friendlyName(haStates, entityId) : null;
  const errorText = (field: keyof PolicyDraftErrors) => {
    const error = errors[field];
    return error ? c(FIELD_ERROR_COPY[error]) : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <ProfileGroup title={c('automationGroup')}>
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-transparent bg-amber-500 text-white shadow-[0_6px_14px_var(--ui-shadow-soft)]">
              <PlugZap size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{c('automationTitle')}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{c('automationBody')}</span>
            </span>
            <GlassToggle
              checked={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
              label={c('automationTitle')}
              disabled={busy}
            />
          </div>
        </ProfileGroup>
        <p className="mt-2 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{c('disableNote')}</p>
      </div>

      <ProfileGroup title={c('statusGroup')}>
        <SettingsListRow
          icon={BatteryCharging}
          iconClassName="bg-emerald-600"
          title={c('battery')}
          value={level === null ? c('notAvailable') : `${Math.round(level)} %`}
        />
        <SettingsListRow
          icon={PlugZap}
          iconClassName="bg-amber-500"
          title={c('power')}
          value={power === null ? c('notAvailable') : power ? c('powerOn') : c('powerOff')}
        />
        <SettingsListRow
          icon={Activity}
          iconClassName={statusWarning ? 'bg-rose-500' : 'bg-sky-500'}
          title={c('automation')}
          subtitle={bound?.enabled && bound.runtime.status === 'error' ? c('errorDetail') : undefined}
          value={statusLabel}
        />
      </ProfileGroup>

      <ProfileGroup title={c('configGroup')}>
        <div className="space-y-4 px-4 py-4">
          <div>
            <label htmlFor={`${fieldId}-label`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {c('label')}
            </label>
            <input
              id={`${fieldId}-label`}
              className={INPUT}
              value={draft.label}
              maxLength={80}
              aria-invalid={Boolean(errorText('label'))}
              aria-describedby={`${fieldId}-label-hint`}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
            <p id={`${fieldId}-label-hint`} className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
              {errorText('label') ?? c('labelHint')}
            </p>
          </div>

          <div>
            <GlassCombobox
              label={c('batteryField')}
              value={draft.batteryEntityId}
              options={entityOptions.battery}
              onChange={(batteryEntityId) => setDraft({ ...draft, batteryEntityId })}
              placeholder={c('batteryPlaceholder')}
              emptyLabel={c('noEntities')}
              getOptionLabel={(entityId) => friendlyName(haStates, entityId)}
              getOptionDescription={(entityId) => entityId}
              disabled={busy}
            />
            <p className={`mt-1 text-[11px] ${errorText('batteryEntityId') ? 'text-rose-500' : 'text-[color:var(--ui-text-tertiary)]'}`}>
              {errorText('batteryEntityId') ?? chosenName(draft.batteryEntityId) ?? c('batteryHint')}
            </p>
          </div>

          <div>
            <GlassCombobox
              label={c('switchField')}
              value={draft.switchEntityId}
              options={entityOptions.switches}
              onChange={(switchEntityId) => setDraft({ ...draft, switchEntityId })}
              placeholder={c('switchPlaceholder')}
              emptyLabel={c('noEntities')}
              getOptionLabel={(entityId) => friendlyName(haStates, entityId)}
              getOptionDescription={(entityId) => entityId}
              disabled={busy}
            />
            <p className={`mt-1 text-[11px] ${errorText('switchEntityId') ? 'text-rose-500' : 'text-[color:var(--ui-text-tertiary)]'}`}>
              {errorText('switchEntityId') ?? chosenName(draft.switchEntityId) ?? c('switchHint')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['startThreshold', 'stopThreshold'] as const).map((field) => (
              <div key={field}>
                <label htmlFor={`${fieldId}-${field}`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                  {field === 'startThreshold' ? c('startField') : c('stopField')}
                </label>
                <div className="relative">
                  <input
                    id={`${fieldId}-${field}`}
                    className={`${INPUT} pr-9 tabular-nums`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={draft[field]}
                    aria-invalid={Boolean(errorText(field))}
                    aria-describedby={`${fieldId}-${field}-hint`}
                    onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--ui-text-secondary)]">
                    %
                  </span>
                </div>
                <p
                  id={`${fieldId}-${field}-hint`}
                  className={`mt-1 text-[11px] ${
                    errorText(field)
                      ? 'text-rose-500'
                      : field === 'startThreshold'
                        ? 'hidden text-[color:var(--ui-text-tertiary)] sm:block'
                        : 'text-[color:var(--ui-text-tertiary)]'
                  }`}
                >
                  {errorText(field) ?? (field === 'stopThreshold' ? c('thresholdHint') : ' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </ProfileGroup>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy || (!dirty && Boolean(bound))} onClick={save}>
          {busy ? c('saving') : c('save')}
        </button>
        {bound ? (
          <button type="button" className={DANGER_BUTTON} disabled={busy} onClick={() => setPendingRemoval(bound)}>
            <Trash2 size={15} aria-hidden="true" />
            {c('remove')}
          </button>
        ) : null}
        {feedback ? (
          <p role="status" className={`text-sm font-medium ${feedback.tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {feedback.text}
          </p>
        ) : null}
      </div>

      {others.length > 0 ? (
        <ProfileGroup title={c('existingGroup')} description={c('existingHint')}>
          {others.map((policy) => (
            <div key={policy.policyId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{policy.label ?? c('unnamed')}</p>
                <p className="mt-0.5 truncate text-xs text-[color:var(--ui-text-secondary)]">{policy.batteryEntityId}</p>
                <p className="truncate text-xs text-[color:var(--ui-text-secondary)]">{policy.switchEntityId}</p>
                <p className="mt-1 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                  {policy.enabled ? c(STATUS_COPY[policy.runtime.status]) : c('inactive')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {!bound ? (
                  <button type="button" className={QUIET_BUTTON} disabled={busy} onClick={() => link(policy)}>
                    <Link2 size={15} aria-hidden="true" />
                    {c('link')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={DANGER_BUTTON}
                  disabled={busy}
                  onClick={() => setPendingRemoval(policy)}
                  aria-label={`${c('delete')}: ${policy.label ?? c('unnamed')}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {c('delete')}
                </button>
              </div>
            </div>
          ))}
        </ProfileGroup>
      ) : null}

      <GlassModal
        isOpen={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        title={c('removeTitle')}
        description={c('removeBody')}
        variant="dialog"
        size="sm"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" className={QUIET_BUTTON} onClick={() => setPendingRemoval(null)}>
              {c('cancel')}
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)]"
              onClick={remove}
            >
              {c('removeConfirm')}
            </button>
          </div>
        )}
      />
    </div>
  );
}

export default DevicePowerSettings;
