import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  Flower2,
  Leaf,
  LoaderCircle,
  Plus,
  Save,
  Sprout,
  TreePine,
  Trees,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import GlassCombobox from '../../ui/GlassCombobox';
import GlassModal from '../../ui/GlassModal';
import GlassToggle from '../../ui/GlassToggle';
import {
  getIrrigationEntityMetadata,
  rankIrrigationEntityOptions,
  type IrrigationConfigurationModel,
  type IrrigationEntityState,
} from './irrigationConfigurationModel';
import { useI18n } from '../../../i18n/I18nProvider';

type ConfigurationStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'offline' | 'unsupported' | 'error' | 'conflict';

type ZoneField = 'name' | 'entityId' | 'soilMoistureEntityId' | 'iconKey' | 'enabled';

type IrrigationZonesManagementPageProps = {
  config: IrrigationConfigurationModel;
  canConfigure: boolean;
  status: ConfigurationStatus;
  hasUnsavedChanges: boolean;
  sensorOptions: string[];
  zoneEntityOptions: string[];
  entityStates: Record<string, IrrigationEntityState>;
  onZoneChange: (zoneId: string, field: ZoneField, value: string | boolean) => void;
  onAddZone: () => void;
  onRemoveZone: (zoneId: string) => void;
  onMoveZone: (zoneId: string, direction: -1 | 1) => void;
  onSave: () => void;
  onBack: () => void;
};

const ZONE_ICONS = [
  { key: 'sprout', labelKey: 'irrigation.icon.sprout', icon: Sprout },
  { key: 'leaf', labelKey: 'irrigation.icon.leaf', icon: Leaf },
  { key: 'flower-2', labelKey: 'irrigation.icon.flower', icon: Flower2 },
  { key: 'tree-pine', labelKey: 'irrigation.icon.pine', icon: TreePine },
  { key: 'trees', labelKey: 'irrigation.icon.trees', icon: Trees },
] as const;

export function IrrigationZonesManagementPage({
  config,
  canConfigure,
  status,
  hasUnsavedChanges,
  sensorOptions,
  zoneEntityOptions,
  entityStates,
  onZoneChange,
  onAddZone,
  onRemoveZone,
  onMoveZone,
  onSave,
  onBack,
}: IrrigationZonesManagementPageProps) {
  const { t } = useI18n();
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const pendingRemoval = config.zones.find((zone) => zone.id === pendingRemovalId);
  const isBusy = status === 'loading' || status === 'saving';
  const saveDisabled = !canConfigure || isBusy || !hasUnsavedChanges || ['offline', 'unsupported', 'error'].includes(status);
  const connectedZones = config.zones.filter((zone) => zone.entityId.trim()).length;

  const rankedValveOptions = useMemo(
    () => rankIrrigationEntityOptions('zoneEntityId', zoneEntityOptions, entityStates),
    [entityStates, zoneEntityOptions],
  );
  const rankedMoistureOptions = useMemo(
    () => rankIrrigationEntityOptions('soilMoistureEntityId', sensorOptions, entityStates),
    [entityStates, sensorOptions],
  );
  const optionLabel = (entityId: string) => getIrrigationEntityMetadata(entityId, entityStates).friendlyName;
  const optionDescription = (entityId: string) => {
    const metadata = getIrrigationEntityMetadata(entityId, entityStates);
    return `${entityId} · ${metadata.available ? metadata.stateLabel : t('irrigation.config.unavailable')}`;
  };

  return (
    <div className="mx-auto w-full max-w-[76rem] px-3 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pb-6 md:pt-6 lg:px-8">
      <button type="button" onClick={onBack} className="liquid-glass-control mb-4 inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-xs font-semibold">
        <ChevronLeft className="h-4 w-4" /> {t('irrigation.zones.back')}
      </button>

      <header className="flex items-start justify-between gap-4 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.zones.structure')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{t('irrigation.zones.manage')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--ui-text-secondary)]">{t('irrigation.zones.manageDescription')}</p>
        </div>
        <button type="button" onClick={onSave} disabled={saveDisabled} className="liquid-glass-control hidden min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-semibold disabled:opacity-40 md:inline-flex">
          {status === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('irrigation.zones.save')}
        </button>
      </header>

      {!canConfigure ? (
        <div className="mt-5 flex items-start gap-3 rounded-[1.4rem] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-[color:var(--ui-text-secondary)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{t('irrigation.zones.readOnly')}
        </div>
      ) : null}

      <section className="mt-5 flex items-center justify-between gap-4 rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-control)]">
        <div>
          <p className="text-sm font-semibold">{t('irrigation.zones.summary', { zones: config.zones.length, connected: connectedZones })}</p>
          <p className="mt-0.5 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.zones.orderHint')}</p>
        </div>
        <button type="button" onClick={onAddZone} disabled={!canConfigure} className="liquid-glass-control inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-xs font-semibold disabled:opacity-40">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">{t('irrigation.zones.add')}</span>
        </button>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {config.zones.map((zone, index) => (
          <article key={zone.id} className="rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.zones.item', { count: index + 1 })}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onMoveZone(zone.id, -1)} disabled={!canConfigure || index === 0} className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)] disabled:opacity-25" aria-label={t('irrigation.zones.moveUp', { name: zone.name })}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => onMoveZone(zone.id, 1)} disabled={!canConfigure || index === config.zones.length - 1} className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)] disabled:opacity-25" aria-label={t('irrigation.zones.moveDown', { name: zone.name })}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setPendingRemovalId(zone.id)} disabled={!canConfigure || config.zones.length <= 1} className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-tertiary)] hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-25" aria-label={t('irrigation.zones.remove', { name: zone.name })}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <label className="mt-3 block text-xs font-medium text-[color:var(--ui-text-secondary)]">
              {t('irrigation.zones.name')}
              <input value={zone.name} onChange={(event) => onZoneChange(zone.id, 'name', event.target.value)} disabled={!canConfigure} className="liquid-glass-control mt-2 w-full rounded-2xl px-3.5 py-2.5 text-sm text-[color:var(--ui-text-primary)] outline-none disabled:opacity-50" />
            </label>

            <div className="mt-3">
              <p className="text-xs font-medium text-[color:var(--ui-text-secondary)]">{t('irrigation.zones.icon')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ZONE_ICONS.map(({ key, labelKey, icon: Icon }) => {
                  const selected = (zone.iconKey || 'sprout') === key;
                  const label = t(labelKey);
                  return <button key={key} type="button" onClick={() => onZoneChange(zone.id, 'iconKey', key)} disabled={!canConfigure} aria-label={selected ? t('irrigation.zones.selected', { label }) : label} className={`${selected ? 'liquid-glass-selection text-[color:var(--app-workspace-accent)]' : 'liquid-glass-control text-[color:var(--ui-text-secondary)]'} flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40`}><Icon className="h-4 w-4" /></button>;
                })}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><GlassCombobox label={t('irrigation.zones.valve')} value={zone.entityId} options={rankedValveOptions} onChange={(value) => onZoneChange(zone.id, 'entityId', value)} disabled={!canConfigure} placeholder={t('irrigation.zones.searchValve')} getOptionLabel={optionLabel} getOptionDescription={optionDescription} /><ZoneEntityStatus entityId={zone.entityId} states={entityStates} /></div>
              <div><GlassCombobox label={t('irrigation.zones.soilSensor')} value={zone.soilMoistureEntityId ?? ''} options={rankedMoistureOptions} onChange={(value) => onZoneChange(zone.id, 'soilMoistureEntityId', value)} disabled={!canConfigure} placeholder={t('irrigation.zones.searchSensor')} getOptionLabel={optionLabel} getOptionDescription={optionDescription} /><ZoneEntityStatus entityId={zone.soilMoistureEntityId ?? ''} states={entityStates} optional /></div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-[1.15rem] bg-[color:var(--ui-fill-tertiary)] p-3.5">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t('irrigation.zones.automatic')}</p><p className="mt-0.5 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.zones.automaticDescription')}</p></div>
              <GlassToggle checked={zone.enabled !== false} onChange={(checked) => onZoneChange(zone.id, 'enabled', checked)} disabled={!canConfigure} label={t('irrigation.zones.automaticA11y', { name: zone.name })} size="compact" />
            </div>
          </article>
        ))}
      </section>

      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 md:hidden">
        <button type="button" onClick={onSave} disabled={saveDisabled} className="liquid-glass-navigation flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-45">
          {status === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : hasUnsavedChanges ? <Save className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {hasUnsavedChanges ? t('irrigation.zones.save') : t('irrigation.zones.saved')}
        </button>
      </div>

      <GlassModal
        isOpen={Boolean(pendingRemoval)}
        onClose={() => setPendingRemovalId(null)}
        title={t('irrigation.zones.removeTitle', { name: pendingRemoval?.name ?? t('irrigation.zones.removeFallback') })}
        description={t('irrigation.zones.removeDescription')}
        size="sm"
        variant="responsive"
        footer={<><button type="button" onClick={() => setPendingRemovalId(null)} className="liquid-glass-control min-h-11 rounded-full px-4 text-sm font-semibold">{t('irrigation.zones.cancel')}</button><button type="button" onClick={() => { if (pendingRemoval) onRemoveZone(pendingRemoval.id); setPendingRemovalId(null); }} className="min-h-11 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white">{t('irrigation.zones.removeAction')}</button></>}
      />
    </div>
  );
}

function ZoneEntityStatus({ entityId, states, optional = false }: { entityId: string; states: Record<string, IrrigationEntityState>; optional?: boolean }) {
  const { t } = useI18n();
  if (!entityId.trim()) return <p className="mt-1.5 text-[10px] text-[color:var(--ui-text-tertiary)]">{optional ? t('irrigation.zones.noSensor') : t('irrigation.config.missing')}</p>;
  const metadata = getIrrigationEntityMetadata(entityId, states);
  return <p className={`mt-1.5 flex items-center gap-1.5 truncate text-[10px] ${metadata.available ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${metadata.available ? 'bg-emerald-500' : 'bg-amber-400'}`} />{metadata.available ? metadata.stateLabel : metadata.exists ? t('irrigation.config.unavailable') : t('irrigation.config.notDetected')}</p>;
}

export default IrrigationZonesManagementPage;
