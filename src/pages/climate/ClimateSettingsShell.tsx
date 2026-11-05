import { useI18n } from '../../i18n/I18nProvider';

/** CLM.1 entry point; future climate views stay behind this lazy boundary. */
export default function ClimateSettingsShell() {
  const { t } = useI18n();
  return (
    <section className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-5">
      <p className="text-sm text-[color:var(--ui-text-secondary)]">
        {t('settings.climate.notConfigured')}
      </p>
    </section>
  );
}
