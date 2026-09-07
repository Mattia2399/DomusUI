import {
  BadgeCheck, CheckCircle2, ChevronLeft, CloudRain, Droplets, Gauge, LoaderCircle, Save,
  ShieldCheck, Sparkles, Sprout, Thermometer, TriangleAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import GlassCombobox from '../../ui/GlassCombobox';
import GlassSlider from '../../ui/GlassSlider';
import GlassToggle from '../../ui/GlassToggle';
import {
  applyIrrigationEntitySuggestions,
  getIrrigationEntityMetadata,
  rankIrrigationEntityOptions,
  validateIrrigationConfiguration,
  IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
  IRRIGATION_MINIMUM_MAX_DURATION_MIN,
  type IrrigationConfigurationIssue,
  type IrrigationConfigurationModel,
  type IrrigationEntityState,
} from './irrigationConfigurationModel';
import { useI18n } from '../../../i18n/I18nProvider';

export type { IrrigationConfigurationModel, IrrigationConfigurationZone } from './irrigationConfigurationModel';

type ConfigurationStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'offline' | 'unsupported' | 'error' | 'conflict';

type IrrigationConfigurationPageProps = {
  config: IrrigationConfigurationModel;
  canConfigure: boolean;
  status: ConfigurationStatus;
  revision: number | null;
  hasUnsavedChanges: boolean;
  binarySensorOptions: string[];
  weatherOptions: string[];
  sensorOptions: string[];
  zoneEntityOptions: string[];
  entityStates: Record<string, IrrigationEntityState>;
  onFieldChange: (field: keyof Omit<IrrigationConfigurationModel, 'zones'>, value: string | boolean | number) => void;
  onApplySuggestedConfiguration: (config: IrrigationConfigurationModel) => void;
  onSave: () => void;
  onBack?: () => void;
};

const GLOBAL_FIELDS = [
  { field: 'rainSensorEntityId', labelKey: 'irrigation.config.field.rain', icon: CloudRain, source: 'binary' },
  { field: 'weatherEntityId', labelKey: 'irrigation.config.field.weather', icon: CloudRain, source: 'weather' },
  { field: 'humidityEntityId', labelKey: 'irrigation.config.field.humidity', icon: Droplets, source: 'sensor' },
  { field: 'outdoorTempEntityId', labelKey: 'irrigation.config.field.temperature', icon: Thermometer, source: 'sensor' },
  { field: 'soilMoistureEntityId', labelKey: 'irrigation.config.field.soil', icon: Sprout, source: 'sensor' },
  { field: 'waterUsageEntityId', labelKey: 'irrigation.config.field.usage', icon: Gauge, source: 'sensor' },
  { field: 'waterAverageEntityId', labelKey: 'irrigation.config.field.average', icon: Gauge, source: 'sensor' },
] as const;

function StatusPill({ status, revision }: { status: ConfigurationStatus; revision: number | null }) {
  const { t } = useI18n();
  const content = status === 'loading'
    ? { label: t('irrigation.config.status.loading'), icon: LoaderCircle, className: 'text-[color:var(--ui-text-secondary)]' }
    : status === 'saving'
      ? { label: t('irrigation.config.status.saving'), icon: LoaderCircle, className: 'text-[color:var(--ui-accent)]' }
      : status === 'saved'
        ? { label: t('irrigation.config.status.saved'), icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-300' }
        : status === 'offline'
          ? { label: t('irrigation.config.status.offline'), icon: TriangleAlert, className: 'text-amber-600 dark:text-amber-300' }
          : status === 'conflict'
            ? { label: t('irrigation.config.status.conflict'), icon: TriangleAlert, className: 'text-amber-600 dark:text-amber-300' }
            : status === 'error' || status === 'unsupported'
              ? { label: t('irrigation.config.status.unavailable'), icon: TriangleAlert, className: 'text-rose-600 dark:text-rose-300' }
              : { label: revision ? t('irrigation.config.status.version', { revision }) : t('irrigation.config.status.pending'), icon: CheckCircle2, className: 'text-[color:var(--ui-text-secondary)]' };
  const Icon = content.icon;
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] font-semibold', content.className)}><Icon className={clsx('h-3.5 w-3.5', (status === 'loading' || status === 'saving') && 'animate-spin')} />{content.label}</span>;
}

export function IrrigationConfigurationPage({
  config, canConfigure, status, revision, hasUnsavedChanges, binarySensorOptions,
  weatherOptions, sensorOptions, zoneEntityOptions, entityStates, onFieldChange,
  onApplySuggestedConfiguration, onSave, onBack,
}: IrrigationConfigurationPageProps) {
  const { t } = useI18n();
  const [showVerification, setShowVerification] = useState(false);
  const configuredGlobals = GLOBAL_FIELDS.filter(({ field }) => Boolean(config[field]?.trim())).length;
  const configuredZones = config.zones.filter((zone) => Boolean(zone.entityId.trim())).length;
  const isBusy = status === 'loading' || status === 'saving';
  const saveDisabled = !canConfigure || isBusy || !hasUnsavedChanges || ['offline', 'unsupported', 'error'].includes(status);
  const optionsBySource = { binary: binarySensorOptions, weather: weatherOptions, sensor: sensorOptions };
  const validationIssues = useMemo(() => validateIrrigationConfiguration(config, entityStates), [config, entityStates]);
  const errorCount = validationIssues.filter((issue) => issue.severity === 'error').length;
  const warningCount = validationIssues.length - errorCount;
  const optionLabel = (entityId: string) => getIrrigationEntityMetadata(entityId, entityStates).friendlyName;
  const optionDescription = (entityId: string) => {
    const metadata = getIrrigationEntityMetadata(entityId, entityStates);
    return `${entityId} · ${metadata.available ? `${metadata.stateLabel}${metadata.unit ? ` ${metadata.unit}` : ''}` : t('irrigation.config.unavailable')}`;
  };
  const handleSave = () => {
    setShowVerification(true);
    if (errorCount === 0) onSave();
  };
  const handleApplySuggestions = () => {
    const suggested = applyIrrigationEntitySuggestions(config, {
      binarySensorOptions, weatherOptions, sensorOptions, zoneEntityOptions,
    }, entityStates);
    onApplySuggestedConfiguration({ ...suggested, zones: config.zones });
    setShowVerification(true);
  };

  return (
    <div className="mx-auto w-full max-w-[76rem] px-3 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pt-[calc(env(safe-area-inset-top)+1.5rem)] md:pb-6 md:pt-6 lg:px-8">
      {onBack ? (
        <button type="button" onClick={onBack} className="liquid-glass-control mb-4 inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-xs font-semibold md:hidden">
          <ChevronLeft className="h-4 w-4" /> {t('irrigation.config.back')}
        </button>
      ) : null}
      <header className="flex items-start justify-between gap-4 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.config.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{t('irrigation.config.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--ui-text-secondary)]">{t('irrigation.config.description')}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusPill status={status} revision={revision} />
          <button type="button" onClick={handleSave} disabled={saveDisabled} className="liquid-glass-control hidden min-h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold disabled:opacity-40 md:inline-flex">
            {status === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('irrigation.config.save')}
          </button>
        </div>
      </header>

      {!canConfigure ? (
        <div className="mt-5 flex items-start gap-3 rounded-[1.4rem] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-[color:var(--ui-text-secondary)]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{t('irrigation.config.readOnly')}</div>
      ) : (
        <div className="mt-5 flex flex-col gap-3 rounded-[1.4rem] border border-[color:rgb(var(--ui-accent-rgb)/0.2)] bg-[color:rgb(var(--ui-accent-rgb)/0.08)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ui-accent)]" /><div><p className="text-sm font-semibold">{t('irrigation.config.suggestions')}</p><p className="mt-0.5 text-xs leading-4 text-[color:var(--ui-text-secondary)]">{t('irrigation.config.suggestionsDescription')}</p></div></div>
          <button type="button" onClick={handleApplySuggestions} className="liquid-glass-control inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold"><Sparkles className="h-4 w-4" />{t('irrigation.config.completeSources')}</button>
        </div>
      )}

      <section className="mt-5 grid grid-cols-3 gap-2 sm:gap-3" aria-label={t('irrigation.config.status')}>
        <ConfigurationSummary value={`${configuredGlobals}/${GLOBAL_FIELDS.length}`} label={t('irrigation.config.globalData')} icon={Droplets} complete={configuredGlobals === GLOBAL_FIELDS.length} />
        <ConfigurationSummary value={`${configuredZones}/${config.zones.length}`} label={t('irrigation.config.connectedZones')} icon={Sprout} complete={configuredZones === config.zones.length && config.zones.length > 0} />
        <ConfigurationSummary value={revision ? `v${revision}` : '—'} label={t('irrigation.config.houseVersion')} icon={Save} complete={Boolean(revision)} />
      </section>

      <section className="mt-4 rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5">
        <h2 className="text-lg font-semibold tracking-[-0.025em]">{t('irrigation.config.environment')}</h2><p className="mt-0.5 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.config.environmentDescription')}</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {GLOBAL_FIELDS.map(({ field, labelKey, icon: Icon, source }) => (
            <div key={field} className="rounded-[1.25rem] bg-[color:var(--ui-fill-tertiary)] p-3.5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-[color:var(--app-workspace-accent)]" /><span>{t(labelKey)}</span></div>
              <GlassCombobox value={config[field]} options={rankIrrigationEntityOptions(field, optionsBySource[source], entityStates)} onChange={(value) => onFieldChange(field, value)} disabled={!canConfigure} placeholder={t('irrigation.config.searchEntity')} emptyLabel={t('irrigation.config.noEntity')} getOptionLabel={optionLabel} getOptionDescription={optionDescription} />
              <EntitySelectionStatus entityId={config[field]} states={entityStates} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--app-workspace-accent)]" /><div><h2 className="text-lg font-semibold tracking-[-0.025em]">{t('irrigation.config.protection')}</h2><p className="mt-0.5 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.config.protectionDescription')}</p></div></div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ProtectionToggle title={t('irrigation.config.blockRain')} description={t('irrigation.config.blockRainDescription')} checked={config.rainSensorEnabled} disabled={!canConfigure} onChange={(checked) => onFieldChange('rainSensorEnabled', checked)} />
          <ProtectionToggle title={t('irrigation.config.failSafe')} description={t('irrigation.config.failSafeDescription')} checked={config.blockOnRainSensorUnavailable} disabled={!canConfigure || !config.rainSensorEnabled} onChange={(checked) => onFieldChange('blockOnRainSensorUnavailable', checked)} />
          <div className="rounded-[1.25rem] bg-[color:var(--ui-fill-tertiary)] p-4 lg:col-span-2"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{t('irrigation.config.maxDuration')}</p><p className="mt-0.5 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.config.maxDurationDescription')}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{config.maximumManualDurationMin} min</span></div><GlassSlider className="mt-4" min={IRRIGATION_MINIMUM_MAX_DURATION_MIN} max={IRRIGATION_ABSOLUTE_MAX_DURATION_MIN} step={5} value={config.maximumManualDurationMin} disabled={!canConfigure} tone="green" aria-label={t('irrigation.config.maxDurationA11y')} onChange={(event) => onFieldChange('maximumManualDurationMin', Number(event.target.value))} /></div>
        </div>
      </section>

      <section className="mt-4 rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5" aria-live="polite">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--app-workspace-accent)]" /><div><h2 className="text-lg font-semibold tracking-[-0.025em]">{t('irrigation.config.verify')}</h2><p className="mt-0.5 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.config.verifyDescription')}</p></div></div><button type="button" onClick={() => setShowVerification(true)} className="liquid-glass-control min-h-10 rounded-full px-4 text-xs font-semibold">{t('irrigation.config.verifyNow')}</button></div>
        {showVerification ? <VerificationResults issues={validationIssues} errorCount={errorCount} warningCount={warningCount} /> : null}
      </section>

      <div data-testid="irrigation-mobile-save-dock" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 md:hidden"><button type="button" onClick={handleSave} disabled={saveDisabled} className="liquid-glass-navigation flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-45">{status === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{hasUnsavedChanges ? t('irrigation.config.save') : t('irrigation.config.saved')}</button></div>
    </div>
  );
}

function EntitySelectionStatus({ entityId, states, compact = false, optional = false }: { entityId: string; states: Record<string, IrrigationEntityState>; compact?: boolean; optional?: boolean }) {
  const { t } = useI18n();
  if (!entityId.trim()) return <p className="mt-2 text-[10px] text-[color:var(--ui-text-tertiary)]">{optional ? t('irrigation.config.optionalMissing') : t('irrigation.config.missing')}</p>;
  const metadata = getIrrigationEntityMetadata(entityId, states);
  return <p className={clsx('mt-2 flex min-w-0 items-center gap-1.5 text-[10px]', metadata.available ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300', compact && 'mt-1.5')}><span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', metadata.available ? 'bg-emerald-500' : 'bg-amber-400')} /><span className="truncate">{metadata.available ? `${metadata.stateLabel}${metadata.unit ? ` ${metadata.unit}` : ''}` : metadata.exists ? t('irrigation.config.unavailable') : t('irrigation.config.notDetected')}</span></p>;
}

function ProtectionToggle({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center gap-3 rounded-[1.25rem] bg-[color:var(--ui-fill-tertiary)] p-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-4 text-[color:var(--ui-text-secondary)]">{description}</p></div><GlassToggle checked={checked} onChange={onChange} disabled={disabled} label={title} size="compact" /></div>;
}

function VerificationResults({ issues, errorCount, warningCount }: { issues: IrrigationConfigurationIssue[]; errorCount: number; warningCount: number }) {
  const { locale, t } = useI18n();
  const issueKeys = {
    invalid_max_duration: 'irrigation.validation.invalid_max_duration',
    missing_rain_sensor: 'irrigation.validation.missing_rain_sensor',
    invalid_global_domain: 'irrigation.validation.invalid_global_domain',
    missing_zone_entity: 'irrigation.validation.missing_zone_entity',
    invalid_zone_domain: 'irrigation.validation.invalid_zone_domain',
    duplicate_zone_entity: 'irrigation.validation.duplicate_zone_entity',
    entity_missing: 'irrigation.validation.entity_missing',
    entity_unavailable: 'irrigation.validation.entity_unavailable',
  } as const;
  if (issues.length === 0) return <div className="mt-4 flex items-center gap-2 rounded-[1.1rem] bg-emerald-500/10 px-3.5 py-3 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{t('irrigation.config.complete')}</div>;
  return <div className="mt-4 rounded-[1.1rem] bg-[color:var(--ui-fill-tertiary)] p-3.5"><p className="text-xs font-semibold">{errorCount ? t('irrigation.config.errors', { count: errorCount }) : t('irrigation.config.noBlocking')}{warningCount ? ` · ${t('irrigation.config.warnings', { count: warningCount })}` : ''}</p><ul className="mt-2 space-y-1.5">{issues.map((issue, index) => <li key={`${issue.code}-${issue.zoneId ?? issue.field ?? index}`} className={clsx('flex items-start gap-2 text-[11px] leading-4', issue.severity === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300')}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{locale === 'it' ? issue.message : t(issueKeys[issue.code as keyof typeof issueKeys] ?? (issue.severity === 'error' ? 'irrigation.config.errors' : 'irrigation.config.warnings'), { count: 1 })}</li>)}</ul></div>;
}

function ConfigurationSummary({ value, label, icon: Icon, complete }: { value: string; label: string; icon: typeof Save; complete: boolean }) {
  return <div className="min-w-0 rounded-[1.25rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3 shadow-[var(--ui-shadow-control)] sm:p-4"><div className="flex items-center justify-between gap-2"><Icon className="h-4 w-4 text-[color:var(--app-workspace-accent)]" /><span className={clsx('h-2 w-2 rounded-full', complete ? 'bg-emerald-500' : 'bg-amber-400')} /></div><p className="mt-3 truncate text-lg font-semibold tracking-[-0.03em] sm:text-xl">{value}</p><p className="truncate text-[9px] text-[color:var(--ui-text-secondary)] sm:text-[11px]">{label}</p></div>;
}

export default IrrigationConfigurationPage;
