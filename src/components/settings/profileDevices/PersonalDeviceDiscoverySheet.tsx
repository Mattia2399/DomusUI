import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, SearchX } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';
import type { PersonalDevicesFeedback } from '../../../hooks/usePersonalDevices';
import {
  discoverDevices,
  toProfileClientError,
  type DiscoveryCandidate,
  type ProfileCallApi,
  type ProfileErrorCode,
} from '../../../services/profileClient';
import { DISCOVERY_STATUS_LABEL, PROFILE_ERROR_LABEL, sortDiscovery } from '../../../services/profileDevicesModel';
import GlassBottomSheet from '../../ui/GlassBottomSheet';
import NotYourDeviceHelp from './NotYourDeviceHelp';
import {
  DEVICE_KIND_ICON,
  DISCOVERY_STATUS_VISUAL,
  TONE_CLASS,
  accentButtonClass,
  footerButtonBase,
  neutralButtonClass,
} from './deviceVisuals';

type DiscoveryState =
  | { status: 'loading'; devices: DiscoveryCandidate[] }
  | { status: 'ready'; devices: DiscoveryCandidate[] }
  | { status: 'error'; devices: DiscoveryCandidate[]; code: ProfileErrorCode };

/**
 * Lists the Companion App devices Home Assistant ties to the signed-in user
 * and lets them link one after a light confirmation. Discovery is read only;
 * the server checks everything again when the device is added.
 */
export function PersonalDeviceDiscoverySheet({
  isOpen,
  callApi,
  disabled,
  feedback,
  onClose,
  onClaim,
}: {
  isOpen: boolean;
  callApi?: ProfileCallApi;
  disabled: boolean;
  /** The page's latest error, shown here while the sheet covers the page. */
  feedback: PersonalDevicesFeedback | null;
  onClose: () => void;
  onClaim: (haDeviceId: string) => Promise<boolean>;
}) {
  const { locale, t } = useI18n();
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }), [locale]);
  const [state, setState] = useState<DiscoveryState>({ status: 'loading', devices: [] });
  const [confirming, setConfirming] = useState<DiscoveryCandidate | null>(null);
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    if (!callApi) return;
    setState((current) => ({ status: 'loading', devices: current.devices }));
    try {
      const result = await discoverDevices(callApi);
      setState({ status: 'ready', devices: result.devices });
    } catch (error) {
      setState((current) => ({ status: 'error', devices: current.devices, code: toProfileClientError(error).code }));
    }
  }, [callApi]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirming(null);
    setState({ status: 'loading', devices: [] });
    void refresh();
  }, [isOpen, refresh]);

  const devices = useMemo(() => sortDiscovery(state.devices, collator), [collator, state.devices]);
  const busy = state.status === 'loading' || claiming;

  const confirm = async () => {
    if (!confirming?.haDeviceId || claiming) return;
    setClaiming(true);
    const added = await onClaim(confirming.haDeviceId);
    setClaiming(false);
    if (added) {
      onClose();
      return;
    }
    setConfirming(null);
    void refresh();
  };

  const confirmName = confirming?.displayName ?? t('profile.devices.unnamed');

  return (
    <GlassBottomSheet
      isOpen={isOpen}
      onClose={claiming ? () => undefined : onClose}
      title={confirming ? t('profile.devices.discovery.confirmTitle', { name: confirmName }) : t('profile.devices.discovery.title')}
      description={confirming ? undefined : t('profile.devices.discovery.description')}
      footer={
        confirming ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={`${footerButtonBase} ${neutralButtonClass} flex-1 sm:flex-none`}
              onClick={() => setConfirming(null)}
              disabled={claiming}
            >
              {t('profile.devices.cancel')}
            </button>
            <button
              type="button"
              className={`${footerButtonBase} ${accentButtonClass} flex-1 sm:flex-none`}
              onClick={() => void confirm()}
              disabled={claiming || disabled}
              aria-busy={claiming || undefined}
            >
              {t('profile.devices.discovery.confirm')}
            </button>
          </div>
        ) : (
          <div className="flex justify-between gap-2">
            <button
              type="button"
              className={`${footerButtonBase} ${neutralButtonClass}`}
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={state.status === 'loading' ? 'animate-spin motion-reduce:animate-none' : undefined}
              />
              {t('profile.devices.discovery.refresh')}
            </button>
            <button type="button" className={`${footerButtonBase} ${neutralButtonClass}`} onClick={onClose}>
              {t('profile.devices.close')}
            </button>
          </div>
        )
      }
    >
      {feedback?.tone === 'error' || feedback?.tone === 'info' ? (
        <p role="status" className="mb-3 text-xs font-medium leading-5 text-[color:var(--ui-warning)]">
          {t(feedback.key)}
        </p>
      ) : null}

      {confirming ? null : (
        <div aria-busy={state.status === 'loading' || undefined}>
          {state.status === 'error' ? (
            <p role="alert" className="mb-3 text-xs font-medium leading-5 text-[color:var(--ui-danger)]">
              {t(PROFILE_ERROR_LABEL[state.code])}
            </p>
          ) : null}

          {state.status === 'loading' && devices.length === 0 ? (
            <div className="space-y-2" aria-label={t('profile.devices.discovery.loading')} role="status">
              {[0, 1].map((index) => (
                <span
                  key={index}
                  className="block h-16 animate-pulse rounded-[1.1rem] bg-[color:var(--ui-fill-tertiary)] motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : devices.length === 0 ? (
            state.status === 'ready' ? (
              <div className="px-2 py-6 text-center">
                <SearchX size={24} className="mx-auto text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">{t('profile.devices.discovery.empty')}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                  {t('profile.devices.discovery.emptyHelp')}
                </p>
              </div>
            ) : null
          ) : (
            <ul className="divide-y divide-[color:var(--ui-separator)]" aria-label={t('profile.devices.discovery.title')}>
              {devices.map((candidate, index) => {
                const KindIcon = DEVICE_KIND_ICON[candidate.kind];
                const visual = DISCOVERY_STATUS_VISUAL[candidate.status];
                const StatusIcon = visual.icon;
                const name = candidate.displayName ?? t('profile.devices.unnamed');
                return (
                  <li
                    key={candidate.haDeviceId ?? `registration-${index}`}
                    data-testid="discovery-device"
                    data-discovery-status={candidate.status}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
                      <KindIcon size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="break-words text-sm font-semibold text-[color:var(--ui-text-primary)]">{name}</p>
                      <p className={`mt-0.5 flex items-start gap-1.5 text-xs font-medium leading-5 ${TONE_CLASS[visual.tone]}`}>
                        <StatusIcon size={13} className="mt-[3px] shrink-0" aria-hidden="true" />
                        <span>{t(DISCOVERY_STATUS_LABEL[candidate.status])}</span>
                      </p>
                      {candidate.status === 'ownership_conflict' ? (
                        <p className="mt-0.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                          {t('profile.devices.discovery.conflictHint')}
                        </p>
                      ) : null}
                    </div>
                    {candidate.claimable ? (
                      <button
                        type="button"
                        className={`${footerButtonBase} ${accentButtonClass} shrink-0`}
                        onClick={() => setConfirming(candidate)}
                        disabled={busy || disabled}
                        aria-label={t('profile.devices.discovery.associateAria', { name })}
                      >
                        {t('profile.devices.discovery.associate')}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {devices.length > 0 ? (
            <div className="mt-2 border-t border-[color:var(--ui-separator)] pt-2">
              <NotYourDeviceHelp />
            </div>
          ) : null}
        </div>
      )}
    </GlassBottomSheet>
  );
}

export default PersonalDeviceDiscoverySheet;
