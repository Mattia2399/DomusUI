import {
  BatteryLow,
  BellRing,
  DoorOpen,
  EyeOff,
  LockKeyhole,
  RotateCcw,
  ShieldAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { HomeAttentionCategory } from '../homeAttention/homeAttentionEngine';
import type { HomeAttentionPreferences } from '../homeAttention/homeAttentionPreferences';
import { useI18n } from '../../i18n/I18nProvider';
import GlassDropdown, { type GlassDropdownOption } from '../ui/GlassDropdown';
import GlassToggle from '../ui/GlassToggle';

type SettingsAttentionSectionProps = {
  preferences: HomeAttentionPreferences;
  onChange: (
    next:
      | HomeAttentionPreferences
      | ((current: HomeAttentionPreferences) => HomeAttentionPreferences),
  ) => void;
  onReset: () => void;
  suppressedCount?: number;
  onClearSuppressions?: () => void;
};

type CategoryOption = {
  id: HomeAttentionCategory;
  icon: LucideIcon;
};

type LocalizedCategoryOption = CategoryOption & {
  title: string;
  description: string;
};

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: 'safety',
    icon: ShieldAlert,
  },
  {
    id: 'security',
    icon: LockKeyhole,
  },
  {
    id: 'opening',
    icon: DoorOpen,
  },
  {
    id: 'availability',
    icon: WifiOff,
  },
  {
    id: 'battery',
    icon: BatteryLow,
  },
  {
    id: 'configuration',
    icon: Wrench,
  },
];

const BATTERY_OPTIONS: GlassDropdownOption[] = [
  { id: '10', name: '10%' },
  { id: '15', name: '15%' },
  { id: '20', name: '20%' },
  { id: '25', name: '25%' },
  { id: '30', name: '30%' },
];

function PreferenceRow({
  option,
  checked,
  disabled,
  onChange,
}: {
  option: LocalizedCategoryOption;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  const Icon = option.icon;
  return (
    <div className="flex min-h-[5.25rem] items-center gap-3 border-t border-[color:var(--ui-separator)] py-3.5 first:border-t-0">
      <Icon
        size={19}
        className="shrink-0 text-[color:var(--ui-text-secondary)]"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
          {option.title}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
          {option.description}
        </p>
      </div>
      <GlassToggle
        checked={checked}
        onChange={onChange}
        label={t('settings.attention.showCategory', { category: option.title.toLocaleLowerCase() })}
        disabled={disabled}
        size="compact"
        tone={option.id === 'safety' ? 'accent' : 'green'}
      />
    </div>
  );
}

export function SettingsAttentionPreview({
  preferences,
}: {
  preferences: HomeAttentionPreferences;
}) {
  const { t } = useI18n();
  const activeCount = Object.values(preferences.categories).filter(Boolean).length;
  return (
    <span className="relative flex min-h-[4.4rem] w-full items-center gap-3 overflow-hidden rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5 sm:min-h-[4.9rem] sm:rounded-[1.15rem] sm:px-3.5">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-warning)]/12 text-[color:var(--ui-warning)]">
        <BellRing size={18} />
        {preferences.enabled ? (
          <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--ui-bg-elevated)] bg-emerald-500" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-[color:var(--ui-text-primary)]">
          {preferences.enabled ? t('settings.attention.activeCategories', { count: activeCount }) : t('settings.attention.disabled')}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[color:var(--ui-text-secondary)]">
          {t('settings.attention.previewThresholds', { minutes: preferences.openingWarningMinutes, battery: preferences.batteryWarningThreshold })}
        </span>
      </span>
    </span>
  );
}

export function SettingsAttentionSection({
  preferences,
  onChange,
  onReset,
  suppressedCount = 0,
  onClearSuppressions,
}: SettingsAttentionSectionProps) {
  const { t } = useI18n();
  const categoryOptions = CATEGORY_OPTIONS.map((option) => ({
    ...option,
    title: t(`settings.attention.category.${option.id}.title` as Parameters<typeof t>[0]),
    description: t(`settings.attention.category.${option.id}.description` as Parameters<typeof t>[0]),
  }));
  const openingOptions: GlassDropdownOption[] = [5, 10, 15, 30].map((minutes) => ({ id: String(minutes), name: t('settings.attention.afterMinutes', { count: minutes }) }));
  openingOptions.push({ id: '60', name: t('settings.attention.afterHour') });
  const selectedOpening =
    openingOptions.find(
      (option) => Number(option.id) === preferences.openingWarningMinutes,
    ) ?? openingOptions[1];
  const selectedBattery =
    BATTERY_OPTIONS.find(
      (option) => Number(option.id) === preferences.batteryWarningThreshold,
    ) ?? BATTERY_OPTIONS[2];

  const updateCategory = (category: HomeAttentionCategory, checked: boolean) => {
    onChange((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: checked,
      },
    }));
  };

  return (
    <div className="space-y-4">
      <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <BellRing
            size={22}
            className="shrink-0 text-[color:var(--ui-text-secondary)]"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[color:var(--ui-text-primary)]">
              {t('settings.attention.show')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
              {t('settings.attention.showDescription')}
            </p>
          </div>
          <GlassToggle
            checked={preferences.enabled}
            onChange={(enabled) => onChange((current) => ({ ...current, enabled }))}
            label={t('settings.attention.show')}
            tone="accent"
          />
        </div>
      </section>

      {!preferences.enabled ? (
        <div
          role="status"
          className="rounded-[1.25rem] border border-[color:var(--ui-warning)]/25 bg-[color:var(--ui-warning)]/10 px-4 py-3 text-sm leading-6 text-[color:var(--ui-text-secondary)]"
        >
          {t('settings.attention.disabledDescription')}
        </div>
      ) : !preferences.categories.safety ? (
        <div
          role="status"
          className="rounded-[1.25rem] border border-[color:var(--ui-danger)]/25 bg-[color:var(--ui-danger)]/10 px-4 py-3 text-sm leading-6 text-[color:var(--ui-text-secondary)]"
        >
          {t('settings.attention.criticalHidden')}
        </div>
      ) : null}

      <section className="dashboard-content-surface rounded-[1.5rem] px-5 py-2 sm:px-6">
        <div className="pb-2 pt-4">
          <h2 className="font-semibold text-[color:var(--ui-text-primary)]">
            {t('settings.attention.whatToShow')}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">
            {t('settings.attention.whatToShowDescription')}
          </p>
        </div>
        {categoryOptions.map((option) => (
          <PreferenceRow
            key={option.id}
            option={option}
            checked={preferences.categories[option.id]}
            disabled={!preferences.enabled}
            onChange={(checked) => updateCategory(option.id, checked)}
          />
        ))}
      </section>

      <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
        <h2 className="font-semibold text-[color:var(--ui-text-primary)]">
          {t('settings.attention.when')}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
          {t('settings.attention.whenDescription')}
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <GlassDropdown
            label={t('settings.attention.opening')}
            options={openingOptions}
            selected={selectedOpening}
            disabled={!preferences.enabled || !preferences.categories.opening}
            onChange={(option) =>
              onChange((current) => ({
                ...current,
                openingWarningMinutes: Number(option.id),
              }))
            }
          />
          <GlassDropdown
            label={t('settings.attention.lowBattery')}
            options={BATTERY_OPTIONS}
            selected={selectedBattery}
            disabled={!preferences.enabled || !preferences.categories.battery}
            onChange={(option) =>
              onChange((current) => ({
                ...current,
                batteryWarningThreshold: Number(option.id),
              }))
            }
          />
        </div>
      </section>

      {suppressedCount > 0 && onClearSuppressions ? (
        <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <EyeOff
              size={20}
              className="shrink-0 text-[color:var(--ui-text-secondary)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-[color:var(--ui-text-primary)]">
                {t('settings.attention.snoozed')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                {suppressedCount === 1
                  ? t('settings.attention.snoozedOne')
                  : t('settings.attention.snoozedMany', { count: suppressedCount })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearSuppressions}
              className="liquid-glass-selection inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold"
            >
              {t('settings.attention.showAgain')}
            </button>
          </div>
        </section>
      ) : null}

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="max-w-2xl text-xs leading-5 text-[color:var(--ui-text-tertiary)]">
          {t('settings.attention.disclaimer')}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="liquid-glass-control inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-[color:var(--ui-text-primary)]"
        >
          <RotateCcw size={16} />
          {t('settings.attention.restoreRecommended')}
        </button>
      </div>
    </div>
  );
}

export default SettingsAttentionSection;
