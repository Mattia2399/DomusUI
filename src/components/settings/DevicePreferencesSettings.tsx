import { Check, SunMoon } from 'lucide-react';
import { SUPPORTED_LOCALES, useI18n, type AppLocale } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import {
  DASHBOARD_BACKGROUND_PRESETS,
  type DashboardAppearanceMode,
  type DashboardBackgroundPreset,
} from '../../theme/dashboardTheme';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import ProfileGroup from './ProfileGroup';

const backgroundPreviewClassById: Record<DashboardBackgroundPreset, string> = {
  neutral: 'profile-background-thumb-neutral',
  'home-hub': 'profile-background-thumb-home-hub',
  'ocean-mist': 'profile-background-thumb-ocean-mist',
  'sunset-amber': 'profile-background-thumb-sunset-amber',
  'forest-glass': 'profile-background-thumb-forest-glass',
  dynamic: 'profile-background-thumb-dynamic',
};

// Name and description of each background, in the device language.
const BACKGROUND_COPY: Record<DashboardBackgroundPreset, [TranslationKey, TranslationKey]> = {
  neutral: ['settings.device.background.neutral', 'settings.device.background.neutralDescription'],
  'home-hub': ['settings.device.background.homeHub', 'settings.device.background.homeHubDescription'],
  'ocean-mist': ['settings.device.background.oceanMist', 'settings.device.background.oceanMistDescription'],
  'sunset-amber': ['settings.device.background.sunsetAmber', 'settings.device.background.sunsetAmberDescription'],
  'forest-glass': ['settings.device.background.forestGlass', 'settings.device.background.forestGlassDescription'],
  dynamic: ['settings.device.background.dynamic', 'settings.device.background.dynamicDescription'],
};

function SelectedMark({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-accent-strong)] text-[color:var(--ui-accent-contrast)]">
      <Check size={15} strokeWidth={2.5} />
    </span>
  ) : (
    <span className="h-7 w-7 shrink-0" />
  );
}

/**
 * Light or dark theme and background of this browser. The values stay where
 * they always were (`ha.dashboard.theme`, `ha.dashboard.background`).
 */
export function DeviceAppearanceSettings({
  appearanceMode,
  onAppearanceModeChange,
  background,
  onBackgroundChange,
}: {
  appearanceMode: DashboardAppearanceMode;
  onAppearanceModeChange: (mode: DashboardAppearanceMode) => void;
  background: DashboardBackgroundPreset;
  onBackgroundChange: (background: DashboardBackgroundPreset) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <ProfileGroup title={t('settings.device.themeGroup')}>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
              <SunMoon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t('settings.device.theme')}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                {t('settings.device.themeDescription')}
              </span>
            </span>
          </div>
          <GlassSegmentSelect
            ariaLabel={t('settings.device.themeAria')}
            className="mt-3"
            value={appearanceMode}
            onChange={onAppearanceModeChange}
            options={[
              { value: 'auto', label: t('settings.device.themeSystem') },
              { value: 'light', label: t('settings.device.themeLight') },
              { value: 'dark', label: t('settings.device.themeDark') },
            ]}
          />
        </div>
      </ProfileGroup>

      <ProfileGroup title={t('settings.device.backgroundGroup')}>
        {DASHBOARD_BACKGROUND_PRESETS.map((preset) => {
          const selected = background === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onBackgroundChange(preset.id)}
              aria-pressed={selected}
              className="flex min-h-[4.8rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[1rem] border border-[color:var(--ui-border-strong)] shadow-[0_8px_18px_var(--ui-shadow-soft)]">
                <span className={`profile-background-thumb absolute inset-[-18%] ${backgroundPreviewClassById[preset.id]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">{t(BACKGROUND_COPY[preset.id][0])}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                  {t(BACKGROUND_COPY[preset.id][1])}
                </span>
              </span>
              <SelectedMark selected={selected} />
            </button>
          );
        })}
      </ProfileGroup>
      <p className="px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
        {t('settings.device.backgroundNote')}
      </p>
    </div>
  );
}

/** The language of Domus in this browser (`domusui.language.v1`). */
export function DeviceLanguageSettings() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="space-y-6">
      <p className="px-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
        {t('language.page.description')}
      </p>
      <ProfileGroup title={t('language.page.group')}>
        {SUPPORTED_LOCALES.map((language) => {
          const selected = locale === language;
          return (
            <button
              key={language}
              type="button"
              onClick={() => setLocale(language as AppLocale)}
              aria-pressed={selected}
              className="flex min-h-[4.4rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-xs font-semibold uppercase text-[color:var(--ui-text-secondary)]">
                {language}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">
                {t(`language.name.${language}` as TranslationKey)}
              </span>
              <SelectedMark selected={selected} />
            </button>
          );
        })}
      </ProfileGroup>
    </div>
  );
}
