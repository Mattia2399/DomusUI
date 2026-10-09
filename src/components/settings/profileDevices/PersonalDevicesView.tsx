import { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Info, MonitorSmartphone, Plus, WifiOff, X, XCircle } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';
import type { usePersonalDevices } from '../../../hooks/usePersonalDevices';
import type { ProfileCallApi } from '../../../services/profileClient';
import { PROFILE_ERROR_LABEL, buildDeviceRows, type PersonalDeviceRow } from '../../../services/profileDevicesModel';
import GlassToggle from '../../ui/GlassToggle';
import ProfileGroup from '../ProfileGroup';
import PersonalDeviceDiscoverySheet from './PersonalDeviceDiscoverySheet';
import PersonalDeviceItem from './PersonalDeviceItem';
import { RemoveDeviceDialog, RenameDeviceDialog } from './PersonalDeviceDialogs';
import { accentButtonClass, footerButtonBase } from './deviceVisuals';
import PersonalDevicesSkeleton from './PersonalDevicesSkeleton';

export type PersonalDevicesAvailability = 'ready' | 'offline' | 'unsupported';

type PersonalDevicesController = ReturnType<typeof usePersonalDevices>;

function Notice({ tone, children, onDismiss, dismissLabel }: {
  tone: 'success' | 'error' | 'info';
  children: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? XCircle : Info;
  const color = tone === 'success'
    ? 'text-[color:var(--ui-success)]'
    : tone === 'error'
      ? 'text-[color:var(--ui-danger)]'
      : 'text-[color:var(--ui-text-secondary)]';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 px-1 text-xs font-medium leading-5 ${color}`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">{children}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Profile → My devices: the personal devices the user linked to their Domus
 * profile, with the general and per-device notification switches. The two
 * switches are stored separately and never change each other.
 */
export function PersonalDevicesView({
  controller,
  availability,
  callApi,
}: {
  controller: PersonalDevicesController;
  availability: PersonalDevicesAvailability;
  callApi?: ProfileCallApi;
}) {
  const { locale, t } = useI18n();
  const { state } = controller;
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }), [locale]);
  const rows = useMemo(
    () => (state.snapshot ? buildDeviceRows(state.snapshot, collator) : []),
    [collator, state.snapshot],
  );
  const [renaming, setRenaming] = useState<PersonalDeviceRow | null>(null);
  const [removing, setRemoving] = useState<PersonalDeviceRow | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);

  if (availability === 'unsupported') {
    return (
      <div className="space-y-6">
        <Notice tone="info">{t('profile.devices.unsupported')}</Notice>
      </div>
    );
  }

  const offline = availability === 'offline';
  const snapshot = state.snapshot;

  if (!snapshot) {
    if (offline) {
      return (
        <div className="space-y-6">
          <p className="flex items-start gap-2 px-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]" role="status">
            <WifiOff size={16} className="mt-1 shrink-0" aria-hidden="true" />
            {t('profile.devices.offline')}
          </p>
        </div>
      );
    }
    if (state.status === 'error' && state.loadError) {
      return (
        <div className="space-y-4 px-1">
          <Notice tone="error">{t(PROFILE_ERROR_LABEL[state.loadError])}</Notice>
          <button
            type="button"
            onClick={() => void controller.reload()}
            className={`${footerButtonBase} ${accentButtonClass}`}
          >
            {t('profile.devices.retry')}
          </button>
        </div>
      );
    }
    return <PersonalDevicesSkeleton label={t('profile.devices.loading')} />;
  }

  const generalEnabled = snapshot.profile.notificationsEnabled;
  // The dialog closes either way: the outcome is reported on the page.
  const finishDialog = async (action: () => Promise<boolean>, close: () => void) => {
    setDialogBusy(true);
    await action();
    setDialogBusy(false);
    close();
  };
  const openDiscovery = () => {
    controller.clearFeedback();
    setDiscoveryOpen(true);
  };

  const addButton = (
    <button
      type="button"
      onClick={openDiscovery}
      disabled={offline}
      className={`${footerButtonBase} ${accentButtonClass} w-full sm:w-auto`}
    >
      <Plus size={16} aria-hidden="true" />
      {t('profile.devices.add')}
    </button>
  );

  return (
    <div className="space-y-6" data-testid="personal-devices-view">
      {offline ? (
        <p className="flex items-start gap-2 px-1 text-xs font-medium leading-5 text-[color:var(--ui-warning)]" role="status">
          <WifiOff size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('profile.devices.offline')}
        </p>
      ) : null}

      {state.feedback && !discoveryOpen ? (
        <Notice
          tone={state.feedback.tone}
          onDismiss={controller.clearFeedback}
          dismissLabel={t('profile.startup.dismiss')}
        >
          {t(state.feedback.key)}
        </Notice>
      ) : null}

      <ProfileGroup title={t('profile.devices.notifications')}>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
            <Bell size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-[-0.01em]">{t('profile.devices.general.title')}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              {t('profile.devices.general.subtitle')}
            </span>
          </span>
          <GlassToggle
            checked={generalEnabled}
            onChange={(value) => void controller.setGeneralNotifications(value)}
            label={t('profile.devices.general.title')}
            disabled={offline}
            busy={state.generalPending}
          />
        </div>
      </ProfileGroup>
      {!generalEnabled ? (
        <p className="-mt-3 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]" data-testid="general-off-note">
          {t('profile.devices.general.offHint')}
        </p>
      ) : null}

      <ProfileGroup title={t('profile.devices.group')}>
        {rows.length > 0 ? (
          rows.map((row) => (
            <PersonalDeviceItem
              key={row.device.id}
              row={row}
              generalEnabled={generalEnabled}
              locked={offline || state.pendingDeviceIds.has(row.device.id)}
              pending={state.pendingDeviceIds.has(row.device.id)}
              onToggleNotifications={(value) => void controller.setDeviceNotifications(row.device.id, value)}
              onRename={() => setRenaming(row)}
              onRemove={() => setRemoving(row)}
            />
          ))
        ) : (
          <div className="px-5 py-8 text-center" data-testid="personal-devices-empty">
            <MonitorSmartphone size={26} className="mx-auto text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">{t('profile.devices.empty.title')}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              {t('profile.devices.empty.body')}
            </p>
          </div>
        )}
      </ProfileGroup>

      <div className="flex justify-center sm:justify-start">{addButton}</div>

      <RenameDeviceDialog
        row={renaming}
        busy={dialogBusy}
        onCancel={() => setRenaming(null)}
        onSave={(label) => {
          if (!renaming) return;
          void finishDialog(() => controller.renameDevice(renaming.device.id, label), () => setRenaming(null));
        }}
      />
      <RemoveDeviceDialog
        row={removing}
        busy={dialogBusy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          void finishDialog(() => controller.deleteDevice(removing.device.id), () => setRemoving(null));
        }}
      />
      <PersonalDeviceDiscoverySheet
        isOpen={discoveryOpen}
        callApi={callApi}
        disabled={offline}
        feedback={state.feedback}
        onClose={() => setDiscoveryOpen(false)}
        onClaim={(haDeviceId) => controller.claimDevice(haDeviceId)}
      />
    </div>
  );
}

export default PersonalDevicesView;
