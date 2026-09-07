import React from 'react';
import { X } from 'lucide-react';
import type { ConsumptionCardId, ConsumptionEntityConfig } from '../../hooks/useConsumptionConfig';
import GlassCombobox from '../ui/GlassCombobox';
import { useI18n } from '../../i18n/I18nProvider';

type ConsumptionEditorSidebarProps = {
  selectedCardId: ConsumptionCardId | null;
  onSelectCard: (cardId: ConsumptionCardId) => void;
  config: ConsumptionEntityConfig;
  haEntityIds: string[];
  haConnected: boolean;
  onUpdateConfigField: (field: keyof ConsumptionEntityConfig, value: string) => void;
  onResetConfig: () => void;
  variant?: 'sidebar' | 'sheet';
  onClose?: () => void;
};

type ConfigField = {
  field: keyof ConsumptionEntityConfig;
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0];
  placeholder: string;
};

const ELECTRICITY_FIELDS: ConfigField[] = [
  { field: 'solarPowerEntityId', labelKey: 'settings.consumption.field.solarPower', placeholder: 'sensor.solar_power_kw' },
  { field: 'gridPowerEntityId', labelKey: 'settings.consumption.field.gridPower', placeholder: 'sensor.grid_power_kw' },
  { field: 'homePowerEntityId', labelKey: 'settings.consumption.field.homePower', placeholder: 'sensor.home_power_kw' },
  { field: 'solarMixEntityId', labelKey: 'settings.consumption.field.solarMix', placeholder: 'sensor.solar_mix_percent' },
  { field: 'batteryPowerEntityId', labelKey: 'settings.consumption.field.batteryPower', placeholder: 'sensor.battery_power_kw' },
  { field: 'batterySocEntityId', labelKey: 'settings.consumption.field.batterySoc', placeholder: 'sensor.battery_soc' },
];

const WATER_FIELDS: ConfigField[] = [
  { field: 'waterCurrentEntityId', labelKey: 'settings.consumption.field.waterCurrent', placeholder: 'sensor.water_today_liters' },
  { field: 'waterGoalEntityId', labelKey: 'settings.consumption.field.waterGoal', placeholder: 'input_number.water_daily_goal_liters' },
  { field: 'waterRainRecoveryEntityId', labelKey: 'settings.consumption.field.rainRecovery', placeholder: 'sensor.water_rain_recovery_lpm' },
];

const GAS_FIELDS: ConfigField[] = [
  { field: 'gasTodayEntityId', labelKey: 'settings.consumption.field.gasToday', placeholder: 'sensor.gas_today_m3' },
];

const CARD_OPTIONS: Array<{ id: ConsumptionCardId; labelKey: ConfigField['labelKey'] }> = [
  { id: 'electricity', labelKey: 'settings.consumption.energy' },
  { id: 'water', labelKey: 'settings.consumption.water' },
  { id: 'gas', labelKey: 'settings.consumption.gas' },
  { id: 'trend', labelKey: 'settings.consumption.report' },
];

function renderField(
  item: ConfigField,
  value: string,
  onUpdate: (field: keyof ConsumptionEntityConfig, value: string) => void,
  entitySuggestions: string[],
  t: ReturnType<typeof useI18n>['t'],
) {
  return (
    <label key={item.field} className="block">
      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t(item.labelKey)}</p>
      <GlassCombobox
        value={value}
        options={entitySuggestions}
        onChange={(nextValue) => onUpdate(item.field, nextValue)}
        placeholder={item.placeholder}
      />
    </label>
  );
}

export function ConsumptionEditorSidebar({
  selectedCardId,
  onSelectCard,
  config,
  haEntityIds,
  haConnected,
  onUpdateConfigField,
  onResetConfig,
  variant = 'sidebar',
  onClose,
}: ConsumptionEditorSidebarProps) {
  const { t } = useI18n();
  const entitySuggestions = haEntityIds.filter(
    (entityId) =>
      entityId.startsWith('sensor.') ||
      entityId.startsWith('number.') ||
      entityId.startsWith('input_number.') ||
      entityId.startsWith('utility_meter.'),
  );
  const activeCardId = selectedCardId ?? 'electricity';

  let fields: ConfigField[] = [];
  if (activeCardId === 'electricity') {
    fields = ELECTRICITY_FIELDS;
  } else if (activeCardId === 'water') {
    fields = WATER_FIELDS;
  } else if (activeCardId === 'gas') {
    fields = GAS_FIELDS;
  }

  const isSheet = variant === 'sheet';

  return (
    <aside
      className={
        isSheet
          ? 'flex h-full min-h-0 w-full flex-col p-3 pt-1 sm:p-4'
          : 'liquid-glass-panel h-full min-h-0 w-[clamp(17rem,28vw,25rem)] shrink-0 rounded-[2rem] p-5'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">{t('settings.consumption.configuration')}</p>
          <h3 className="mt-2 text-xl font-semibold">{t('settings.consumption.details')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetConfig}
            className="glass-button rounded-xl px-3 py-2 text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)] transition-colors"
          >
            {t('settings.consumption.reset')}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="glass-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors hover:text-[color:var(--ui-text-primary)]"
              aria-label={t('settings.consumption.close')}
              title={t('settings.consumption.close')}
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {CARD_OPTIONS.map((item) => {
          const active = activeCardId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectCard(item.id)}
              className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                active
                  ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-primary)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
              }`}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex h-[calc(100%-9.5rem)] min-h-0 flex-col">
        <div className="glass-scrollbar space-y-5 overflow-y-auto pr-1">
          {fields.length > 0 ? (
            <div className="dashboard-content-surface space-y-4 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('settings.consumption.sources')}</p>
              {fields.map((item) => renderField(item, config[item.field], onUpdateConfigField, entitySuggestions, t))}
            </div>
          ) : (
            <div className="dashboard-content-surface rounded-2xl border-dashed p-4">
              <p className="text-sm text-[color:var(--ui-text-secondary)]">
                {t('settings.consumption.reportHint')}
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] text-[color:var(--ui-text-tertiary)]">
          {haConnected && entitySuggestions.length > 0
            ? t('settings.consumption.suggestions')
            : t('settings.consumption.noSuggestions')}
        </p>
      </div>
    </aside>
  );
}

export default ConsumptionEditorSidebar;
