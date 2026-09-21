import { useI18n } from '../../i18n/I18nProvider';
import { binarySensorCopy } from '../../i18n/binarySensorTranslations';
import { BinarySensorGlyph } from '../widgets/BinarySensorGlyph';
import { resolveBinarySensorPresentation } from '../widgets/binarySensorPresentation';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { BatteryLevelGlyph, parseBatteryPercentage } from './DeviceMetadataCard';
import { DeviceTelemetryStrip, type DeviceTelemetryStripItem } from './DeviceTelemetryStrip';

type BinarySensorControlsProps = {
  name: string;
  rawState?: string;
  deviceClass?: string;
  battery?: string;
};

export function BinarySensorControls({ name, rawState, deviceClass, battery }: BinarySensorControlsProps) {
  const { locale } = useI18n();
  const copy = binarySensorCopy[locale];
  const presentation = resolveBinarySensorPresentation(rawState, deviceClass, locale);
  const batteryValue = battery?.trim();
  const batteryPercent = batteryValue ? parseBatteryPercentage(batteryValue) : undefined;
  const telemetryItems: DeviceTelemetryStripItem[] = batteryValue ? [{
    id: 'battery',
    icon: <BatteryLevelGlyph percentage={batteryPercent} compact />,
    label: copy.battery,
    value: batteryValue,
    tone: batteryPercent === undefined ? 'neutral' : batteryPercent <= 20 ? 'danger' : batteryPercent <= 50 ? 'warning' : 'success',
  }] : [];

  return (
    <div className={`${CONTEXT_PANEL_LAYOUT.shell} gap-[clamp(0.7rem,2.4vw,1rem)]`}>
      <ContextPanelHeader
        title={name}
        subtitle={presentation.label}
        icon={<BinarySensorGlyph icon={presentation.icon} state={presentation.state} size={22} />}
        fallbackTitle={copy.title}
        iconClassName={presentation.tone === 'alert' ? 'text-amber-300' : presentation.tone === 'success' ? 'text-emerald-300' : presentation.tone === 'active' ? 'text-sky-300' : 'text-[color:var(--ui-text-tertiary)]'}
      />

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionSoft} flex min-h-[9rem] flex-col items-center justify-center gap-4 text-center`}>
        <div
          className={`grid h-16 w-16 place-items-center rounded-full ${presentation.tone === 'alert' ? 'bg-amber-400/15 text-amber-300' : presentation.tone === 'success' ? 'bg-emerald-400/15 text-emerald-300' : presentation.tone === 'active' ? 'bg-sky-400/15 text-sky-300' : 'bg-white/10 text-[color:var(--ui-text-tertiary)]'}`}
        >
          <BinarySensorGlyph icon={presentation.icon} state={presentation.state} size={34} />
        </div>
        <div>
          <p className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{presentation.label}</p>
          <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
            {presentation.available ? copy.reported : copy.noReading}
          </p>
        </div>
      </div>

      {telemetryItems.length > 0 ? <DeviceTelemetryStrip items={telemetryItems} /> : null}
    </div>
  );
}
