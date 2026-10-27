import React from 'react';
import { clsx } from 'clsx';
import { LightCard } from '../components/devices/cards/LightCard';
import { DeviceCard } from '../components/devices/cards/DeviceCard';
import { DevicePanel } from '../components/devices/panels/DevicePanel';
import { ClimateCard } from '../components/devices/cards/ClimateCard';
import { ClimatePanel } from '../components/devices/panels/ClimatePanel';
import { findPowerSensor } from '../components/devices/model/device';
import { DEVICE_CARD_FORMATS, deviceCardHeightPx, type DeviceCardFormat } from '../components/devices/cards/DeviceCardShell';
import { LightPanel } from '../components/devices/panels/LightPanel';
import { PanelHost, type PanelPresentation } from '../components/devices/panels/PanelHost';
import { lightRgb } from '../components/devices/model/tileColor';
import { useDevicesTranslations } from '../i18n/devicesTranslations';
import { DEMO_CLIMATE_STATES, DEMO_DEVICE_STATES, DEMO_LIGHT_STATES } from './rooms/demoRoomsFixtures';
import { useLightCommands } from './rooms/useLightCommands';
import { useDeviceCommands } from './rooms/useDeviceCommands';
import { useClimateCommands } from './rooms/useClimateCommands';

/*
 * Development only (/devices-lab): the light and device cards in every
 * format, on, off, on standby and away, in Dark and Light, at the sizes of the Home grid (columns of
 * 188 px, rows of 36 px, gaps of 10 px), to set beside the design boards.
 */

const COLUMN_PX = 188;
const GAP_PX = 10;
const SAMPLES = [
  'light.demo_floor_lamp',
  'light.demo_led_strip',
  'light.demo_spots',
  'light.demo_chandelier',
  'light.demo_wall_lamp',
  'light.demo_reading_lamp',
  'light.demo_hood',
];
const DEVICE_SAMPLES = [
  'switch.demo_tv_plug',
  'switch.demo_console_plug',
  'fan.demo_fan',
  'cover.demo_living_blind',
  'humidifier.demo_dehumidifier',
  'input_boolean.demo_do_not_disturb',
  'switch.demo_broken',
];
const LAB_DEVICE_STATES = {
  ...DEMO_DEVICE_STATES,
  'switch.demo_broken': { state: 'unavailable', rawAttributes: { friendly_name: 'Presa giardino', device_class: 'outlet' } },
};
const CLIMATE_SAMPLES = ['climate.demo_living_ac', 'climate.demo_bedroom_ac', 'climate.demo_living_radiator', 'climate.demo_bathroom_floor'];
const powerSensorOf = (entityId: string) => findPowerSensor(entityId, LAB_DEVICE_STATES);

function widthOf(format: DeviceCardFormat) {
  const columns = format.startsWith('X') ? 4 : format.startsWith('W') ? 2 : 1;
  return columns * COLUMN_PX + (columns - 1) * GAP_PX;
}

function Board({ theme }: { theme: 'dark' | 'light' }) {
  const dt = useDevicesTranslations();
  const lights = useLightCommands({ demo: true, states: DEMO_LIGHT_STATES });
  const devices = useDeviceCommands({ demo: true, states: LAB_DEVICE_STATES, powerSensorOf });
  const climates = useClimateCommands({ demo: true, states: DEMO_CLIMATE_STATES });
  const [climatePanelId, setClimatePanelId] = React.useState<string | null>(null);
  const climatePanel = climatePanelId ? climates.modelOf(climatePanelId) : null;
  const [panelId, setPanelId] = React.useState<string | null>(null);
  const [devicePanelId, setDevicePanelId] = React.useState<string | null>(null);
  const devicePanel = devicePanelId ? devices.modelOf(devicePanelId) : null;
  const [presentation, setPresentation] = React.useState<PanelPresentation>('dialog');
  const panelModel = panelId ? lights.modelOf(panelId) : null;

  return (
    <section
      className={clsx(theme === 'dark' ? 'dashboard-theme-dark bg-black' : 'dashboard-theme-light bg-[#E9ECF2]', 'flex flex-col gap-8 p-8 text-[color:var(--dv-text)]')}
      aria-label={theme}
      data-testid={`devices-lab-${theme}`}
    >
      <div className="flex items-center gap-2">
        {(['dialog', 'sheet', 'side'] as PanelPresentation[]).map((option) => (
          <button
            key={option}
            type="button"
            className={clsx('dv-glass rooms-pill h-9 rounded-full px-3.5 text-[13px] font-semibold', presentation === option && 'ring-2 ring-[color:var(--dv-select)]')}
            aria-pressed={presentation === option}
            onClick={() => setPresentation(option)}
          >
            {option}
          </button>
        ))}
      </div>
      {SAMPLES.map((entityId) => {
        const model = lights.modelOf(entityId);
        return (
          <div key={entityId} className="flex flex-col gap-3">
            <h2 className="dv-t2 m-0 text-[13px] font-bold uppercase tracking-[0.06em]">
              {model.name} · {model.caps}
            </h2>
            <div className="flex flex-wrap items-start gap-7">
              {DEVICE_CARD_FORMATS.map((format) => (
                <figure key={format} className="m-0 flex flex-col gap-1.5">
                  <figcaption className="dv-t3 text-[11px] font-semibold tabular-nums">
                    {format} · {widthOf(format)}×{deviceCardHeightPx(format)}
                  </figcaption>
                  <div style={{ width: widthOf(format), height: deviceCardHeightPx(format) }}>
                    <LightCard
                      model={model}
                      format={format}
                      onAction={(action) => lights.act(entityId, action)}
                      onOpenPanel={() => setPanelId(entityId)}
                    />
                  </div>
                </figure>
              ))}
            </div>
          </div>
        );
      })}
      {DEVICE_SAMPLES.map((entityId) => {
        const model = devices.modelOf(entityId);
        return (
          <div key={entityId} className="flex flex-col gap-3">
            <h2 className="dv-t2 m-0 text-[13px] font-bold uppercase tracking-[0.06em]">
              {model.name} · {model.kind}
            </h2>
            <div className="flex flex-wrap items-start gap-7">
              {DEVICE_CARD_FORMATS.map((format) => (
                <figure key={format} className="m-0 flex flex-col gap-1.5">
                  <figcaption className="dv-t3 text-[11px] font-semibold tabular-nums">
                    {format} · {widthOf(format)}×{deviceCardHeightPx(format)}
                  </figcaption>
                  <div style={{ width: widthOf(format), height: deviceCardHeightPx(format) }}>
                    <DeviceCard
                      model={model}
                      format={format}
                      onAction={(action) => devices.act(entityId, action)}
                      onOpenPanel={() => setDevicePanelId(entityId)}
                    />
                  </div>
                </figure>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-3">
        <h2 className="dv-t2 m-0 text-[13px] font-bold uppercase tracking-[0.06em]">climate · large · small</h2>
        <div className="flex flex-wrap items-start gap-7">
          {CLIMATE_SAMPLES.map((entityId, index) => (
            <div key={entityId} style={{ width: index < 2 ? widthOf('W×4') : widthOf('U×2'), height: index < 2 ? undefined : deviceCardHeightPx('U×2') }}>
              <ClimateCard
                model={climates.modelOf(entityId)}
                size={index < 2 ? 'large' : 'small'}
                roomHumidity={48}
                onAction={(action) => climates.act(entityId, action)}
                onOpenPanel={() => setClimatePanelId(entityId)}
              />
            </div>
          ))}
        </div>
      </div>
      <PanelHost presentation={presentation} isOpen={Boolean(climatePanel)} onClose={() => setClimatePanelId(null)} title={climatePanel?.name ?? ''}>
        {climatePanel ? (
          <ClimatePanel
            model={climatePanel}
            roomName={dt('sectionClimate')}
            roomHumidity={48}
            onAction={(action) => climates.act(climatePanel.entityId, action)}
            onClose={() => setClimatePanelId(null)}
          />
        ) : null}
      </PanelHost>
      <PanelHost
        presentation={presentation}
        isOpen={Boolean(devicePanel)}
        onClose={() => setDevicePanelId(null)}
        title={devicePanel?.name ?? ''}
        tintRgb={devicePanel && devicePanel.on ? '100 210 255' : null}
        softTint
      >
        {devicePanel ? (
          <DevicePanel
            model={devicePanel}
            roomName={dt('sectionDevices')}
            protectedPlug={false}
            onAction={(action) => devices.act(devicePanel.entityId, action)}
            onClose={() => setDevicePanelId(null)}
          />
        ) : null}
      </PanelHost>
      <PanelHost
        presentation={presentation}
        isOpen={Boolean(panelModel)}
        onClose={() => setPanelId(null)}
        title={panelModel?.name ?? ''}
        tintRgb={panelModel && panelModel.on && panelModel.available ? lightRgb(panelModel).join(' ') : null}
      >
        {panelModel ? (
          <LightPanel model={panelModel} roomName={dt('lights')} onAction={(action) => lights.act(panelModel.entityId, action)} onClose={() => setPanelId(null)} />
        ) : null}
      </PanelHost>
    </section>
  );
}

export default function DevicesLab() {
  return (
    <main className="min-h-screen">
      <Board theme="dark" />
      <Board theme="light" />
    </main>
  );
}
