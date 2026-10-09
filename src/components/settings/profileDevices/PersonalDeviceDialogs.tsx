import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { normalizeLabelInput, type PersonalDeviceRow } from '../../../services/profileDevicesModel';
import GlassModal from '../../ui/GlassModal';
import { accentButtonClass, dangerButtonClass, footerButtonBase, neutralButtonClass } from './deviceVisuals';

/** Rename a device in Domus only; an empty name falls back to Home Assistant's. */
export function RenameDeviceDialog({
  row,
  busy,
  onCancel,
  onSave,
}: {
  row: PersonalDeviceRow | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (label: string | null) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(row?.device.label ?? '');
  }, [row?.device.id, row?.device.label]);

  const { label, tooLong } = normalizeLabelInput(value);
  const unchanged = label === (row?.device.label ?? null);
  const submit = () => {
    if (!busy && !tooLong && !unchanged) onSave(label);
  };

  return (
    <GlassModal
      isOpen={row !== null}
      onClose={busy ? () => undefined : onCancel}
      title={t('profile.devices.renameTitle')}
      description={t('profile.devices.renameDescription')}
      closeLabel={t('profile.devices.cancel')}
      variant="dialog"
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={`${footerButtonBase} ${neutralButtonClass}`} onClick={onCancel} disabled={busy}>
            {t('profile.devices.cancel')}
          </button>
          <button
            type="submit"
            form={`${inputId}-form`}
            className={`${footerButtonBase} ${accentButtonClass}`}
            disabled={busy || tooLong || unchanged}
          >
            {t('profile.devices.save')}
          </button>
        </div>
      }
    >
      <form
        id={`${inputId}-form`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {t('profile.devices.renameLabel')}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
          value={value}
          placeholder={row?.live?.displayName ?? ''}
          autoComplete="off"
          aria-invalid={tooLong || undefined}
          aria-describedby={hintId}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
        />
        <p
          id={hintId}
          role={tooLong ? 'alert' : undefined}
          className={`mt-2 text-xs leading-5 ${
            tooLong ? 'font-medium text-[color:var(--ui-danger)]' : 'text-[color:var(--ui-text-secondary)]'
          }`}
        >
          {tooLong ? t('profile.devices.renameTooLong') : t('profile.devices.renameHint')}
        </p>
      </form>
    </GlassModal>
  );
}

/** Removing only unlinks the device from the profile; Home Assistant is untouched. */
export function RemoveDeviceDialog({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: PersonalDeviceRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const name = row?.title ?? t('profile.devices.unnamed');

  return (
    <GlassModal
      isOpen={row !== null}
      onClose={busy ? () => undefined : onCancel}
      title={t('profile.devices.removeTitle')}
      eyebrow={name}
      description={t('profile.devices.removeBody')}
      closeLabel={t('profile.devices.cancel')}
      variant="dialog"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={`${footerButtonBase} ${neutralButtonClass}`} onClick={onCancel} disabled={busy}>
            {t('profile.devices.cancel')}
          </button>
          <button
            type="button"
            className={`${footerButtonBase} ${dangerButtonClass}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {t('profile.devices.removeConfirm')}
          </button>
        </div>
      }
    />
  );
}
