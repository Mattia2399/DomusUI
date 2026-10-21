import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Check,
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
// Changes save themselves once the person stops typing for a moment.
const AUTOSAVE_DELAY_MS = 700;
// A confirmation steps aside after a moment; errors stay until the next action.
const CONFIRMATION_MS = 4000;

const INPUT = 'ui-input min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-sm';
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

type FieldError = NonNullable<PolicyDraftErrors[keyof PolicyDraftErrors]> | 'missing';

const FIELD_ERROR_COPY: Record<FieldError, DevicePowerCopyKey> = {
  required: 'errorRequired',
  range: 'errorRange',
  order: 'errorOrder',
  length: 'errorLength',
  domain: 'errorDomain',
  missing: 'errorMissing',
};

type DevicePowerSettingsProps = {
  callApi?: DevicePowerCallApi;
  connected: boolean;
  /** The integration offers device power management (`device_power_v1`). */
  supported: boolean;
  /** device_power.manage of Domus Access Control; Home Assistant checks the administrator again. */
  canManage: boolean;
  haStates: MockEntityStateMap;
};

/** `automation`: shown under the switch it answers; `form`: under the configuration. */
type Feedback = { tone: 'success' | 'error'; text: string; at: 'automation' | 'form' } | null;

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

/**
 * Settings › This device › Power and charging.
 *
 * Like an iOS settings page: the switch turns the automation on or off at
 * once and opens the rest of the page; every change saves itself.
 */
export function DevicePowerSettings({ callApi, connected, supported, canManage, haStates }: DevicePowerSettingsProps) {
  const c = useDevicePowerCopy();
  const fieldId = useId();
  const reduceMotion = useReducedMotion();
  const clientId = useMemo(() => getOrCreateDomusClientId(), []);
  const [state, setState] = useState<DevicePowerState | null>(null);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(null));
  const [baseline, setBaseline] = useState<PolicyDraft>(() => draftFromPolicy(null));
  // Switched on before anything was saved: the page opens for the first choices.
  const [setupOpen, setSetupOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, setPending] = useState<false | 'form' | 'automation'>(false);
  const busy = pending !== false;
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PowerPolicy | null>(null);
  // A draft the server refused is not sent again until it changes.
  const refusedDraftRef = useRef<PolicyDraft | null>(null);
  const usable = supported && canManage && connected && Boolean(callApi);

  const bound = state?.policies.find((policy) => clientId !== null && policy.clientId === clientId) ?? null;
  const others = state?.policies.filter((policy) => policy !== bound) ?? [];
  const automationOn = bound ? bound.enabled : setupOpen;
  const dirty = !sameDraft(draft, baseline);
  const validation = validatePolicyDraft(draft);

  // An entity typed by hand must exist in Home Assistant; the saved one may be away for a while.
  const knownEntity = (entityId: string, savedId: string | undefined) =>
    entityId === savedId || haStates[entityId] !== undefined;
  const fieldErrors: Partial<Record<keyof PolicyDraftErrors, FieldError>> = { ...validation.errors };
  if (!fieldErrors.batteryEntityId && !knownEntity(draft.batteryEntityId, bound?.batteryEntityId)) {
    fieldErrors.batteryEntityId = 'missing';
  }
  if (!fieldErrors.switchEntityId && !knownEntity(draft.switchEntityId, bound?.switchEntityId)) {
    fieldErrors.switchEntityId = 'missing';
  }
  const savable = Boolean(validation.settings) && Object.keys(fieldErrors).length === 0;

  // The draft follows the server while nobody is editing it, and after a save of exactly what it holds.
  const baselineRef = useRef(baseline);
  const adopt = useCallback(
    (next: DevicePowerState, options: { resetDraft?: boolean; sent?: PolicyDraft } = {}) => {
      setState(next);
      const nextBound = next.policies.find((policy) => clientId !== null && policy.clientId === clientId) ?? null;
      const nextBaseline = draftFromPolicy(nextBound);
      const previous = baselineRef.current;
      baselineRef.current = nextBaseline;
      setBaseline(nextBaseline);
      setDraft((current) =>
        options.resetDraft || sameDraft(current, previous) || (options.sent && sameDraft(current, options.sent))
          ? nextBaseline
          : { ...current, enabled: nextBaseline.enabled },
      );
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
    // The saved entities stay listed even when they no longer look like a battery or are away.
    if (bound && !battery.includes(bound.batteryEntityId)) battery.push(bound.batteryEntityId);
    if (bound && !switches.includes(bound.switchEntityId)) switches.push(bound.switchEntityId);
    return {
      battery: battery.sort(byBatteryClass),
      switches: switches.sort((first, second) => friendlyName(haStates, first).localeCompare(friendlyName(haStates, second))),
    };
  }, [bound, haStates]);

  const describeError = (code: string) =>
    code === 'switch_in_use' ? c('switchInUse') : code === 'client_already_bound' ? c('clientBound') : c('saveError');

  const run = async (action: () => Promise<void>, at: 'automation' | 'form', onRefused?: () => void) => {
    setPending(at);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      const { code } = toDevicePowerClientError(error);
      if (code === 'revision_conflict' || code === 'policy_not_found') {
        await refresh({ resetDraft: true });
        setFeedback({ tone: 'error', text: c('conflict'), at });
      } else {
        onRefused?.();
        setFeedback({ tone: 'error', text: describeError(code), at });
      }
    } finally {
      setPending(false);
    }
  };

  /** Saves the form as it is: creates this device's policy, or changes it. */
  const persist = (sent: PolicyDraft) => {
    const settings = validatePolicyDraft(sent).settings;
    if (!callApi || !settings) return;
    if (!clientId) {
      setFeedback({ tone: 'error', text: c('noClientId'), at: 'form' });
      return;
    }
    const creating = !bound;
    void run(
      async () => {
        const next = await saveDevicePowerPolicy(
          callApi,
          { ...settings, enabled: true, clientId },
          bound ? { policyId: bound.policyId, revision: bound.revision } : undefined,
        );
        adopt(next, { sent });
        refusedDraftRef.current = null;
        if (creating) {
          setSetupOpen(false);
          setFeedback({ tone: 'success', text: c('automationOn'), at: 'automation' });
        } else {
          setFeedback({ tone: 'success', text: c('autosaved'), at: 'form' });
        }
      },
      'form',
      () => {
        refusedDraftRef.current = sent;
      },
    );
  };

  // Every change saves itself after a short pause; an invalid one shows why instead.
  useEffect(() => {
    if (!usable || !automationOn || !dirty || busy) return undefined;
    if (refusedDraftRef.current && sameDraft(refusedDraftRef.current, draft)) return undefined;
    setShowErrors(false);
    const timer = window.setTimeout(() => {
      if (savable) persist(draft);
      else setShowErrors(true);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Only an edit, a save or the switch restart the pause; live states arrive all the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, baseline, busy, automationOn, usable]);

  useEffect(() => {
    if (feedback?.tone !== 'success') return undefined;
    const timer = window.setTimeout(() => setFeedback((current) => (current === feedback ? null : current)), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  /** The switch: on or off at once for a saved policy; before that it only opens the page. */
  const setAutomation = (enabled: boolean) => {
    if (!bound) {
      setSetupOpen(enabled);
      setFeedback(null);
      if (!enabled) {
        setDraft(baselineRef.current);
        setShowErrors(false);
        refusedDraftRef.current = null;
      }
      return;
    }
    if (!callApi) return;
    const { policyId, revision, runtime: _runtime, createdAt: _created, updatedAt: _updated, ...settings } = bound;
    void run(async () => {
      adopt(await saveDevicePowerPolicy(callApi, { ...settings, enabled }, { policyId, revision }));
      setFeedback({ tone: 'success', text: c(enabled ? 'automationOn' : 'automationOff'), at: 'automation' });
    }, 'automation');
  };

  const link = (policy: PowerPolicy) => {
    if (!callApi) return;
    if (!clientId) {
      setFeedback({ tone: 'error', text: c('noClientId'), at: 'automation' });
      return;
    }
    void run(async () => {
      adopt(await bindDevicePowerPolicy(callApi, policy, clientId), { resetDraft: true });
      setFeedback({ tone: 'success', text: c('linked'), at: 'automation' });
    }, 'automation');
  };

  const remove = () => {
    const target = pendingRemoval;
    setPendingRemoval(null);
    if (!callApi || !target) return;
    void run(async () => {
      adopt(await deleteDevicePowerPolicy(callApi, target), { resetDraft: target === bound });
      if (target === bound) setSetupOpen(false);
      setFeedback({ tone: 'success', text: c('removed'), at: 'automation' });
    }, 'automation');
  };

  if (!supported || load === 'unsupported') {
    return <Notice icon={PlugZap} title={c('unsupportedTitle')} body={c('unsupportedBody')} />;
  }
  if (!canManage) {
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

  const statusLabel = !bound ? c('statusIncomplete') : c(STATUS_COPY[bound.runtime.status]);
  const statusWarning = Boolean(bound && ['battery_unavailable', 'switch_unavailable', 'error'].includes(bound.runtime.status));
  // The entities being chosen, so their values show before the first save.
  const batteryId = draft.batteryEntityId || bound?.batteryEntityId || '';
  const switchId = draft.switchEntityId || bound?.switchEntityId || '';
  const level = batteryLevel(haStates, batteryId, bound?.batteryEntityId === batteryId ? bound.runtime.batteryLevel : null);
  const power = switchOn(haStates, switchId, bound?.switchEntityId === switchId ? bound.runtime.switchOn : null);
  // The picker shows the entity id; its name is repeated under it.
  const chosenName = (entityId: string) =>
    entityId && haStates[entityId] && friendlyName(haStates, entityId) !== entityId ? friendlyName(haStates, entityId) : null;
  // An empty field is not an error to point at: the page simply waits for it.
  const errorText = (field: keyof PolicyDraftErrors) => {
    const error = showErrors ? fieldErrors[field] : undefined;
    return error && error !== 'required' ? c(FIELD_ERROR_COPY[error]) : null;
  };
  // What the switch means right now, in words: the saved policy, never the form.
  const boundPower = bound ? switchOn(haStates, bound.switchEntityId, bound.runtime.switchOn) : null;
  const automationBody = !bound
    ? setupOpen
      ? c('automationPending')
      : c('automationIntro')
    : bound.enabled
      ? c('automationOnBody', { start: bound.startThreshold, stop: bound.stopThreshold })
      : boundPower === true
        ? c('automationOffBodyOn')
        : boundPower === false
          ? c('automationOffBodyOff')
          : c('automationOffBody');
  const automationFeedback = feedback?.at === 'automation' ? feedback : null;
  const formFeedback = feedback?.at === 'form' ? feedback : null;
  const reveal = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: 'auto' },
        exit: { opacity: 0, height: 0 },
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
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
              <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{automationBody}</span>
            </span>
            <GlassToggle
              checked={automationOn}
              onChange={setAutomation}
              label={c('automationTitle')}
              disabled={busy}
              busy={pending === 'automation'}
            />
          </div>
        </ProfileGroup>
        {automationFeedback ? (
          <p
            role="status"
            className={`mt-2 px-1 text-xs font-medium leading-5 ${
              automationFeedback.tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
            }`}
          >
            {automationFeedback.text}
          </p>
        ) : bound ? (
          <p className="mt-2 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
            {bound.enabled ? c('disableNote') : c('enableNote')}
          </p>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {automationOn ? (
          <motion.div key="details" {...reveal} className="overflow-hidden">
            <div className="space-y-6 pb-1">
              <ProfileGroup title={c('statusGroup')}>
                <SettingsListRow
                  icon={BatteryCharging}
                  iconClassName="bg-emerald-600"
                  title={c('battery')}
                  value={!batteryId ? '—' : level === null ? c('notAvailable') : `${Math.round(level)} %`}
                />
                <SettingsListRow
                  icon={PlugZap}
                  iconClassName="bg-amber-500"
                  title={c('power')}
                  value={!switchId ? '—' : power === null ? c('notAvailable') : power ? c('powerOn') : c('powerOff')}
                />
                <SettingsListRow
                  icon={Activity}
                  iconClassName={statusWarning ? 'bg-rose-500' : 'bg-sky-500'}
                  title={c('automation')}
                  subtitle={bound?.runtime.status === 'error' ? c('errorDetail') : undefined}
                  value={statusLabel}
                />
              </ProfileGroup>

              <div>
                <ProfileGroup
                  title={c('configGroup')}
                  action={
                    pending === 'form' ? (
                      <span role="status" className="text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
                        {c('saving')}
                      </span>
                    ) : formFeedback?.tone === 'success' && !dirty ? (
                      <span role="status" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <Check size={12} aria-hidden="true" />
                        {formFeedback.text}
                      </span>
                    ) : null
                  }
                >
                  <div className="space-y-4 px-4 py-4">
                    <div>
                      <GlassCombobox
                        label={c('batteryField')}
                        value={draft.batteryEntityId}
                        options={entityOptions.battery}
                        onChange={(batteryEntityId) => setDraft((current) => ({ ...current, batteryEntityId }))}
                        placeholder={c('batteryPlaceholder')}
                        emptyLabel={c('noEntities')}
                        getOptionLabel={(entityId) => friendlyName(haStates, entityId)}
                        getOptionDescription={(entityId) => entityId}
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
                        onChange={(switchEntityId) => setDraft((current) => ({ ...current, switchEntityId }))}
                        placeholder={c('switchPlaceholder')}
                        emptyLabel={c('noEntities')}
                        getOptionLabel={(entityId) => friendlyName(haStates, entityId)}
                        getOptionDescription={(entityId) => entityId}
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
                              onChange={(event) => {
                                const { value } = event.target;
                                setDraft((current) => ({ ...current, [field]: value }));
                              }}
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
                        onChange={(event) => {
                          const { value } = event.target;
                          setDraft((current) => ({ ...current, label: value }));
                        }}
                      />
                      <p
                        id={`${fieldId}-label-hint`}
                        className={`mt-1 text-[11px] ${errorText('label') ? 'text-rose-500' : 'text-[color:var(--ui-text-tertiary)]'}`}
                      >
                        {errorText('label') ?? c('labelHint')}
                      </p>
                    </div>
                  </div>
                </ProfileGroup>
                {formFeedback?.tone === 'error' ? (
                  <p role="status" className="mt-2 px-1 text-xs font-medium leading-5 text-rose-500">
                    {formFeedback.text}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {bound ? (
        // A row on its own at the bottom, like Forget This Device on iOS; the dialog asks first.
        <div className="overflow-hidden rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center px-4 py-3 text-sm font-medium text-rose-500 transition-colors hover:bg-[color:var(--ui-fill-tertiary)] focus-visible:bg-[color:var(--ui-fill-tertiary)] focus-visible:outline-none disabled:opacity-45"
            disabled={busy}
            onClick={() => setPendingRemoval(bound)}
          >
            {c('remove')}
          </button>
        </div>
      ) : null}

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
