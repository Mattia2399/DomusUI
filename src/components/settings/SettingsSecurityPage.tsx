import { useId, useMemo, useState } from 'react';
import { Camera, Check, ExternalLink, KeyRound, LockKeyhole, Radio, Shield, ShieldCheck } from 'lucide-react';
import { useDeviceAuth, type AuthUserContext } from '../../hooks/useDeviceAuth';
import { useI18n } from '../../i18n/I18nProvider';
import {
  SECURITY_CENTER_STORAGE_KEYS,
  readSecurityCenterAlarm,
  readSecurityCenterSelection,
  securityAlarmCandidates,
  securityCameraCandidates,
  securitySensorCandidates,
  writeSecurityCenterAlarm,
  writeSecurityCenterSelection,
} from '../../services/securityCenterSelection';
import { setWidgetSecrets, setWidgetSecretsRemembered, useWidgetSecrets } from '../../services/widgetSecrets';
import type { MockEntityStateMap } from '../../types/ha';
import GlassBottomSheet from '../ui/GlassBottomSheet';
import GlassToggle from '../ui/GlassToggle';
import { SettingsListGroup, SettingsListRow } from './SettingsList';

/*
 * Settings → Security gathers what was spread across the app: what the
 * Security center shows (this device), the codes that protect each alarm
 * card (this device) and the personal device confirmation. Nothing here
 * changes Home Assistant.
 */

export type SecurityAlarmCard = {
  widgetId: string;
  entityId: string;
  /** Asked before disarming; set on the card itself, in edit mode. */
  requireDeviceConfirmation: boolean;
};

type Picker = 'alarm' | 'sensors' | 'cameras' | null;

const INPUT = 'ui-input min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-sm';

function friendlyName(haStates: MockEntityStateMap, entityId: string) {
  const name = haStates[entityId]?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId;
}

function AlarmCardRow({
  card,
  name,
  disabled,
  onOpen,
}: {
  card: SecurityAlarmCard;
  name: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const secrets = useWidgetSecrets(card.widgetId);
  const pin = Boolean(secrets.values.alarmUnlockCode?.trim());
  const extra = Boolean(secrets.values.alarmLocalExtraCode?.trim());
  const parts = [
    pin ? t('settings.securityPage.pinSaved') : '',
    extra ? t('settings.securityPage.extraCode') : '',
    card.requireDeviceConfirmation ? t('settings.securityPage.deviceConfirmation') : '',
  ].filter(Boolean);
  const summary = parts.length > 0 ? parts.join(' · ') : t('settings.securityPage.unprotected');
  return (
    <SettingsListRow
      icon={LockKeyhole}
      tone={parts.length > 0 ? 'success' : 'default'}
      title={name}
      subtitle={summary.charAt(0).toUpperCase() + summary.slice(1)}
      onClick={disabled ? undefined : onOpen}
    />
  );
}

function AlarmCodesSheet({
  card,
  name,
  onClose,
}: {
  card: SecurityAlarmCard | null;
  name: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fieldId = useId();
  const secrets = useWidgetSecrets(card?.widgetId);
  const [draft, setDraft] = useState<{ pin: string; extra: string; remember: boolean } | null>(null);
  const current = draft ?? {
    pin: secrets.values.alarmUnlockCode ?? '',
    extra: secrets.values.alarmLocalExtraCode ?? '',
    remember: secrets.rememberOnDevice,
  };

  const close = () => {
    setDraft(null);
    onClose();
  };
  const save = () => {
    if (!card) return;
    // Remember first, so the codes are written where they should live.
    setWidgetSecretsRemembered(card.widgetId, current.remember);
    setWidgetSecrets(card.widgetId, {
      alarmUnlockCode: current.pin.trim().slice(0, 24),
      alarmLocalExtraCode: current.extra.trim().slice(0, 12),
    });
    close();
  };
  const forget = () => {
    if (!card) return;
    setWidgetSecrets(card.widgetId, { alarmUnlockCode: '', alarmLocalExtraCode: '' });
    setWidgetSecretsRemembered(card.widgetId, false);
    close();
  };

  return (
    <GlassBottomSheet
      isOpen={card !== null}
      onClose={close}
      title={name}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="liquid-glass-control inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold"
          >
            {t('settings.securityPage.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[color:var(--ui-accent)] px-4 text-sm font-semibold text-[color:var(--ui-accent-contrast)]"
          >
            {t('settings.securityPage.save')}
          </button>
        </div>
      }
    >
      {card ? (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${fieldId}-pin`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('settings.securityPage.pinLabel')}
            </label>
            <input
              id={`${fieldId}-pin`}
              type="password"
              autoComplete="off"
              aria-describedby={`${fieldId}-pin-hint`}
              className={INPUT}
              value={current.pin}
              maxLength={24}
              onChange={(event) => setDraft({ ...current, pin: event.target.value })}
            />
            <p id={`${fieldId}-pin-hint`} className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
              {t('settings.securityPage.pinHint')}
            </p>
          </div>
          <div>
            <label htmlFor={`${fieldId}-extra`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('settings.securityPage.extraLabel')}
            </label>
            <input
              id={`${fieldId}-extra`}
              type="password"
              autoComplete="off"
              aria-describedby={`${fieldId}-extra-hint`}
              className={INPUT}
              value={current.extra}
              maxLength={12}
              onChange={(event) => setDraft({ ...current, extra: event.target.value })}
            />
            <p id={`${fieldId}-extra-hint`} className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
              {t('settings.securityPage.extraHint')}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('settings.securityPage.remember')}</span>
              <span className="block text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">{t('settings.securityPage.rememberHint')}</span>
            </span>
            <GlassToggle
              size="compact"
              checked={current.remember}
              onChange={(value) => setDraft({ ...current, remember: value })}
              label={t('settings.securityPage.remember')}
            />
          </div>
          <div className="rounded-[1rem] border border-[color:var(--ui-border)] px-3 py-2.5">
            <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {card.requireDeviceConfirmation ? t('settings.securityPage.confirmationOn') : t('settings.securityPage.confirmationOff')}
            </p>
            <p className="mt-0.5 text-[11px] text-[color:var(--ui-text-secondary)]">{t('settings.securityPage.confirmationHint')}</p>
          </div>
          {secrets.values.alarmUnlockCode || secrets.values.alarmLocalExtraCode ? (
            <button
              type="button"
              onClick={forget}
              className="inline-flex min-h-10 items-center text-sm font-semibold text-[color:var(--ui-danger)] hover:opacity-80"
            >
              {t('settings.securityPage.forget')}
            </button>
          ) : null}
        </div>
      ) : null}
    </GlassBottomSheet>
  );
}

export function SettingsSecurityPage({
  haStates,
  alarmCards = [],
  canManage,
  deviceAuthUser,
  onOpenSecurityCenter,
  onOpenProfileSecurity,
}: {
  haStates: MockEntityStateMap;
  alarmCards?: SecurityAlarmCard[];
  canManage: boolean;
  deviceAuthUser?: Partial<AuthUserContext>;
  onOpenSecurityCenter: () => void;
  onOpenProfileSecurity: () => void;
}) {
  const { locale, t } = useI18n();
  const deviceAuth = useDeviceAuth(deviceAuthUser);
  const [picker, setPicker] = useState<Picker>(null);
  const [alarmId, setAlarmId] = useState(() => readSecurityCenterAlarm());
  const [sensorIds, setSensorIds] = useState(() =>
    readSecurityCenterSelection(SECURITY_CENTER_STORAGE_KEYS.visibleSensorEntityIds),
  );
  const [cameraIds, setCameraIds] = useState(() =>
    readSecurityCenterSelection(SECURITY_CENTER_STORAGE_KEYS.visibleCameraEntityIds),
  );
  const [editingCard, setEditingCard] = useState<SecurityAlarmCard | null>(null);

  const alarms = useMemo(() => securityAlarmCandidates(haStates, locale), [haStates, locale]);
  const sensors = useMemo(() => securitySensorCandidates(haStates, locale), [haStates, locale]);
  const cameras = useMemo(() => securityCameraCandidates(haStates, locale), [haStates, locale]);
  // Like the Security center: the stored alarm when it still exists, otherwise the first one.
  const mainAlarm = alarmId && alarms.includes(alarmId) ? alarmId : alarms[0] ?? '';
  const shownSensors = sensorIds === null ? sensors : sensorIds.filter((id) => sensors.includes(id));
  const shownCameras = cameraIds === null ? cameras : cameraIds.filter((id) => cameras.includes(id));

  const chooseAlarm = (entityId: string) => {
    setAlarmId(entityId);
    writeSecurityCenterAlarm(entityId);
    setPicker(null);
  };
  const toggle = (kind: 'sensors' | 'cameras', entityId: string, show: boolean) => {
    const all = kind === 'sensors' ? sensors : cameras;
    const shown = kind === 'sensors' ? shownSensors : shownCameras;
    const next = show ? [...new Set([...shown, entityId])] : shown.filter((id) => id !== entityId);
    const ordered = all.filter((id) => next.includes(id));
    const key = kind === 'sensors'
      ? SECURITY_CENTER_STORAGE_KEYS.visibleSensorEntityIds
      : SECURITY_CENTER_STORAGE_KEYS.visibleCameraEntityIds;
    writeSecurityCenterSelection(key, ordered);
    if (kind === 'sensors') setSensorIds(ordered);
    else setCameraIds(ordered);
  };
  const showAll = (kind: 'sensors' | 'cameras') => {
    const key = kind === 'sensors'
      ? SECURITY_CENTER_STORAGE_KEYS.visibleSensorEntityIds
      : SECURITY_CENTER_STORAGE_KEYS.visibleCameraEntityIds;
    writeSecurityCenterSelection(key, null);
    if (kind === 'sensors') setSensorIds(null);
    else setCameraIds(null);
  };

  const count = (shown: number, total: number) => t('settings.securityPage.countOf', { shown, total });
  const pickerItems = picker === 'sensors' ? sensors : picker === 'cameras' ? cameras : alarms;
  const pickerShown = picker === 'sensors' ? shownSensors : shownCameras;
  const pickerTitle =
    picker === 'alarm'
      ? t('settings.securityPage.mainAlarm')
      : picker === 'sensors'
        ? t('settings.securityPage.sensors')
        : t('settings.securityPage.cameras');

  return (
    <div className="mx-auto w-full max-w-[48rem] space-y-6 pb-4">
      {!canManage ? (
        <p className="px-1 text-xs text-[color:var(--ui-text-secondary)]">{t('settings.securityPage.readOnly')}</p>
      ) : null}

      <section className="space-y-2">
        <SettingsListGroup title={t('settings.securityPage.group.center')}>
          <SettingsListRow
            icon={Shield}
            title={t('settings.securityPage.mainAlarm')}
            value={mainAlarm ? friendlyName(haStates, mainAlarm) : t('settings.securityPage.noAlarm')}
            onClick={canManage && alarms.length > 1 ? () => setPicker('alarm') : undefined}
          />
          <SettingsListRow
            icon={Radio}
            title={t('settings.securityPage.sensors')}
            value={sensors.length > 0 ? count(shownSensors.length, sensors.length) : t('settings.securityPage.noSensors')}
            onClick={canManage && sensors.length > 0 ? () => setPicker('sensors') : undefined}
          />
          <SettingsListRow
            icon={Camera}
            title={t('settings.securityPage.cameras')}
            value={cameras.length > 0 ? count(shownCameras.length, cameras.length) : t('settings.securityPage.noCameras')}
            onClick={canManage && cameras.length > 0 ? () => setPicker('cameras') : undefined}
          />
          <SettingsListRow icon={ExternalLink} title={t('settings.securityPage.openCenter')} onClick={onOpenSecurityCenter} />
        </SettingsListGroup>
        <p className="px-1 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('settings.securityPage.thisDevice')}</p>
      </section>

      <section className="space-y-2">
        <SettingsListGroup title={t('settings.securityPage.group.alarms')}>
          {alarmCards.length > 0 ? (
            alarmCards.map((card) => (
              <AlarmCardRow
                key={card.widgetId}
                card={card}
                name={friendlyName(haStates, card.entityId)}
                disabled={!canManage}
                onOpen={() => setEditingCard(card)}
              />
            ))
          ) : (
            <SettingsListRow
              icon={LockKeyhole}
              title={t('settings.securityPage.noAlarmCards')}
              subtitle={t('settings.securityPage.noAlarmCardsHint')}
            />
          )}
        </SettingsListGroup>
        {alarmCards.length > 0 ? (
          <p className="px-1 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('settings.securityPage.thisDevice')}</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <SettingsListGroup title={t('settings.securityPage.group.confirmations')}>
          <SettingsListRow
            icon={deviceAuth.isEnrolled ? ShieldCheck : KeyRound}
            tone={deviceAuth.isEnrolled ? 'success' : 'default'}
            title={t('settings.securityPage.sensitive')}
            subtitle={deviceAuth.isEnrolled ? t('settings.securityPage.sensitiveOn') : t('settings.securityPage.sensitiveOff')}
            value={deviceAuth.isEnrolled ? t('settings.securityPage.active') : undefined}
            onClick={onOpenProfileSecurity}
          />
        </SettingsListGroup>
        <p className="px-1 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('settings.securityPage.sensitiveHint')}</p>
      </section>

      <GlassBottomSheet
        isOpen={picker !== null}
        onClose={() => setPicker(null)}
        title={pickerTitle}
        footer={
          <div className="flex gap-2">
            {picker === 'sensors' || picker === 'cameras' ? (
              <button
                type="button"
                onClick={() => showAll(picker)}
                className="liquid-glass-control inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold"
              >
                {t('settings.securityPage.showAll')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPicker(null)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[color:var(--ui-accent)] px-4 text-sm font-semibold text-[color:var(--ui-accent-contrast)]"
            >
              {t('settings.securityPage.done')}
            </button>
          </div>
        }
      >
        <div className="max-h-[55dvh] divide-y divide-[color:var(--ui-separator)] overflow-y-auto rounded-[1.2rem] border border-[color:var(--ui-border)]">
          {pickerItems.map((entityId) =>
            picker === 'alarm' ? (
              <button
                key={entityId}
                type="button"
                onClick={() => chooseAlarm(entityId)}
                aria-pressed={entityId === mainAlarm}
                className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 text-left text-sm font-semibold text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]"
              >
                <span className="min-w-0 flex-1 truncate">{friendlyName(haStates, entityId)}</span>
                {entityId === mainAlarm ? <Check size={17} className="shrink-0 text-[color:var(--ui-accent)]" aria-hidden="true" /> : null}
              </button>
            ) : (
              <div key={entityId} className="flex min-h-[3.25rem] items-center gap-3 px-4">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                  {friendlyName(haStates, entityId)}
                </span>
                <GlassToggle
                  size="compact"
                  checked={pickerShown.includes(entityId)}
                  onChange={(value) => toggle(picker === 'cameras' ? 'cameras' : 'sensors', entityId, value)}
                  label={friendlyName(haStates, entityId)}
                />
              </div>
            ),
          )}
        </div>
      </GlassBottomSheet>

      <AlarmCodesSheet
        key={editingCard?.widgetId ?? 'none'}
        card={editingCard}
        name={editingCard ? friendlyName(haStates, editingCard.entityId) : ''}
        onClose={() => setEditingCard(null)}
      />
    </div>
  );
}

export default SettingsSecurityPage;
