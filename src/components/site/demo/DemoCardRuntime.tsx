import { useMemo } from 'react';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { WidgetCardRenderer } from '../../widgets/CardRenderer';
import { createVacuumStateMocks, VACUUM_MAX_COMPAT_MOCK_ENTITY_ID } from '../../widgets/vacuumMock';
import { useSiteCopy, useSiteLocale } from '../i18n/SiteLocaleProvider';
import type { DemoCardProps } from './DemoCard';
import { useDemoHome } from './DemoHomeProvider';
import { DEMO_WIDGETS, SENSOR_HISTORY } from './fixtures';

const noop = () => undefined;
const vacuum = createVacuumStateMocks()[VACUUM_MAX_COMPAT_MOCK_ENTITY_ID];

export default function DemoCardRuntime(props: DemoCardProps) {
  const { locale } = useSiteLocale();
  return (
    <I18nProvider forcedLocale={locale}>
      <RealDemoCard {...props} />
    </I18nProvider>
  );
}

/**
 * Renders a real Domus UI card bound to the shared demo home.
 *
 * `span` and `breakpoint` must describe the grid cell the card sits in, so
 * the production variant resolver picks the same Mini / Standard / Expanded
 * layout it would pick on a real dashboard.
 */
function RealDemoCard({
  id,
  span,
  breakpoint = 'xl',
  interactive = true,
}: DemoCardProps) {
  const { entities, actions, switchConsumption, dashboardState } = useDemoHome();
  const title = useSiteCopy().demo.titles[id];
  const base = DEMO_WIDGETS[id];
  const w = span?.w ?? base.layout.w;
  const h = span?.h ?? base.layout.h;

  // Stable identity per span: the renderer is memoised on the widget object.
  const widget = useMemo(() => ({ ...base, title, layout: { ...base.layout, w, h } }), [base, title, w, h]);

  return (
    <WidgetCardRenderer
      widget={widget}
      dashboardState={dashboardState}
      isEditMode={false}
      isInteractive={interactive}
      isSelected={false}
      gridBreakpoint={breakpoint}
      liveEntity={id === 'vacuum' ? { ...vacuum, ...entities[id] } : entities[id]}
      value={id === 'sensor' ? 420 : undefined}
      sensorHistory={id === 'sensor' ? SENSOR_HISTORY : undefined}
      switchConsumptionEntity={id === 'switch' ? switchConsumption : undefined}
      onClick={id === 'light' ? actions.toggleLamp : noop}
      onLightBrightnessChange={(_, value) => actions.setLampBrightness(value)}
      onLightColorChange={(_, hs) => actions.setLampHs(hs)}
      onSwitchToggle={actions.toggleSwitch}
      onClimatePowerToggle={actions.toggleClimate}
      onClimateTargetTempChange={(_, value) => actions.setClimateTarget(value)}
      onClimateModeChange={(_, mode) => actions.setClimateMode(mode)}
      onClimateFanModeChange={(_, mode) => actions.setClimateFanMode(mode)}
      onAlarmDisarm={() => actions.setAlarm('disarmed')}
      onAlarmArm={(_, mode) => actions.setAlarm(mode === 'custom_bypass' ? 'armed_home' : `armed_${mode}`)}
      onLockToggle={actions.toggleLock}
      onLockOpen={noop}
      onMediaToggle={actions.toggleMedia}
      onMediaSeek={(_, position) => actions.seekMedia(position)}
      onMediaNext={noop}
      onMediaPrevious={noop}
      onCoverOpen={() => actions.setCoverPosition(100)}
      onCoverClose={() => actions.setCoverPosition(0)}
      onCoverStop={noop}
      onCoverPositionChange={(_, position) => actions.setCoverPosition(position)}
    />
  );
}
