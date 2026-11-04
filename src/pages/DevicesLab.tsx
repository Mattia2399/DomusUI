import React from 'react';
import { clsx } from 'clsx';
import { LightCard } from '../components/devices/cards/LightCard';
import { DeviceCard } from '../components/devices/cards/DeviceCard';
import { panelKindOfDevice } from '../components/devices/panels/registry';
import type { DeviceAction } from '../components/devices/model/device';
import { ClimateCard } from '../components/devices/cards/ClimateCard';
import type { ClimateAction } from '../components/devices/model/climate';
import { findPowerSensor } from '../components/devices/model/device';
import { deviceCardHeightPx, type DeviceCardFormat } from '../components/devices/cards/DeviceCardShell';
import { SecurityCard } from '../components/devices/cards/SecurityCard';
import { MediaCard } from '../components/devices/cards/MediaCard';
import { AlarmCard, toAlarmModel } from '../components/devices/cards/AlarmCard';
import { VacuumCard, toVacuumModel } from '../components/devices/cards/VacuumCard';
import { CalendarCard } from '../components/devices/cards/CalendarCard';
import { MembersCard } from '../components/devices/cards/MembersCard';
import { SensorFamilyLab } from './SensorFamilyLab';
import GridV2ScenesCard from '../components/widgets/GridV2ScenesCard';
import type { SceneKey } from '../types/dashboardModels';
import { toSecurityModel } from '../components/devices/model/security';
import { toMediaModel } from '../components/devices/model/media';
import { Panel } from '../components/devices/panels/Panel';
import { PanelHost, type PanelPresentation } from '../components/devices/panels/PanelHost';
import { lightRgb } from '../components/devices/model/tileColor';
import { useDevicesTranslations } from '../i18n/devicesTranslations';
import { DEMO_CLIMATE_STATES, DEMO_DEVICE_STATES, DEMO_LIGHT_STATES } from './rooms/demoRoomsFixtures';
import { useLightCommands } from './rooms/useLightCommands';
import { useDeviceCommands } from './rooms/useDeviceCommands';
import { useClimateCommands } from './rooms/useClimateCommands';

/*
 * Development only (/devices-lab): every card in the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html), on, off, on standby and away, in
 * Dark and Light, at its measures (columns of 200 px, rows of 36 px, gaps of
 * 10 px), to set beside it.
 */

const SIZES: DeviceCardFormat[] = ['U×2', 'U×4', 'W×4'];
const COLUMN_PX = 200;
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

const NOW = Date.now();
const at = (hours: number, minutes = 0, days = 0) => {
  const date = new Date(NOW + days * 86_400_000);
  date.setHours(hours, minutes, 0, 0);
  return date;
};
const LAB_LOCK = toSecurityModel('lock.lab_door', { state: 'locked', rawAttributes: { friendly_name: 'Ingresso', battery_level: 64, supported_features: 1 } })!;
const LAB_CAMERA = toSecurityModel('camera.lab_door', { state: 'idle', rawAttributes: { friendly_name: 'Ingresso' } })!;
const LAB_MEDIA = toMediaModel('media_player.lab', {
  state: 'playing',
  rawAttributes: {
    friendly_name: 'Soggiorno', media_title: 'Blinding Lights', media_artist: 'The Weeknd', media_duration: 200, media_position: 81,
    media_position_updated_at: new Date(NOW).toISOString(), volume_level: 0.4, supported_features: 0xffffff,
  },
});
const LAB_ALARM = toAlarmModel('alarm_control_panel.lab', { state: 'disarmed', rawAttributes: { friendly_name: 'Allarme', supported_features: 7, code_arm_required: true } });
const LAB_VACUUM = toVacuumModel('vacuum.lab', { state: 'cleaning', rawAttributes: { friendly_name: 'Aspirapolvere', battery_level: 72 } }, { area: 18, minutes: 24 });
const LAB_EVENTS = [
  { uid: 'a', title: 'Dentista', start: at(15, 30), end: at(16, 15), allDay: false, location: 'Studio Rossi, via Roma 12' },
  { uid: 'b', title: 'Calcetto Luca', start: at(18), end: at(19), allDay: false },
  { uid: 'c', title: 'Cena da Anna', start: at(20, 30), end: at(22), allDay: false },
  { uid: 'd', title: 'Corso di yoga', start: at(19, 0, 1), end: at(20, 0, 1), allDay: false },
];
const LAB_MEMBERS = [
  { id: 'm', name: 'Mattia', home: true },
  { id: 'g', name: 'Giulia', home: true },
  { id: 'l', name: 'Luca', home: false, place: 'Scuola · 2 km' },
];

/** A touch runs the scene for six seconds, as a script would. */
function SceneRunLab() {
  const [run, setRun] = React.useState<{ id: SceneKey; startedAt: number } | null>(null);
  return (
    <div className="flex flex-col gap-3" data-testid="scene-run-lab" style={{ height: 120 }}>
      <GridV2ScenesCard
        title="Scenari"
        scenes={['night', 'movie', 'morning', 'music']}
        runningSceneId={run?.id ?? null}
        runningSceneStartedAt={run?.startedAt ?? null}
        durationScope="devices-lab"
        onSceneTrigger={(id) => {
          setRun({ id, startedAt: Date.now() });
          window.setTimeout(() => setRun(null), 6000);
        }}
      />
    </div>
  );
}

function SizeRow({ title, render }: { title: string; render: (format: DeviceCardFormat) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="dv-t2 m-0 text-[13px] font-bold uppercase tracking-[0.06em]">{title}</h2>
      <div className="flex flex-wrap items-start gap-[10px]">
        {SIZES.map((format) => (
          <div key={format} style={{ width: widthOf(format), height: deviceCardHeightPx(format) }}>
            {render(format)}
          </div>
        ))}
      </div>
    </div>
  );
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
  const [dataPanel, setDataPanel] = React.useState<'members' | 'camera' | null>(null);

  return (
    <section
      className={clsx(theme === 'dark' ? 'dashboard-theme-dark bg-black' : 'dashboard-theme-light bg-[#E9ECF2]', 'flex flex-col gap-8 p-8 text-[color:var(--dv-text)]')}
      aria-label={theme}
      data-testid={`devices-lab-${theme}`}
    >
      <div className="flex items-center gap-2">
        {(['members', 'camera'] as const).map((option) => (
          <button key={option} type="button" className="dv-glass rooms-pill h-9 rounded-full px-3.5 text-[13px] font-semibold" onClick={() => setDataPanel(option)}>
            {option}
          </button>
        ))}
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
              {SIZES.map((format) => (
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
              {SIZES.map((format) => (
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
      <SizeRow title="climate" render={(format) => (
        <ClimateCard model={climates.modelOf('climate.demo_living_ac')} format={format} roomHumidity={48} onAction={(action) => climates.act('climate.demo_living_ac', action)} onOpenPanel={() => undefined} />
      )} />
      <SizeRow title="lock" render={(format) => <SecurityCard model={LAB_LOCK} format={format} onOpen={() => undefined} onLockCommand={() => undefined} />} />
      <SizeRow title="camera" render={(format) => <SecurityCard model={LAB_CAMERA} format={format} onOpen={() => undefined} />} />
      <SizeRow title="media_player" render={(format) => <MediaCard model={LAB_MEDIA} pictureUrl={null} format={format} onAction={() => undefined} onOpen={() => undefined} />} />
      <SizeRow title="alarm_control_panel" render={(format) => <AlarmCard model={LAB_ALARM} format={format} onArm={() => undefined} onDisarm={() => undefined} onOpen={() => undefined} />} />
      <SizeRow title="vacuum" render={(format) => <VacuumCard model={LAB_VACUUM} format={format} onStartPause={() => undefined} onReturnToBase={() => undefined} onOpen={() => undefined} />} />
      <SceneRunLab />
      <SensorFamilyLab />
      <SizeRow title="calendar" render={(format) => <CalendarCard name="Famiglia" events={LAB_EVENTS} available format={format} onOpen={() => undefined} />} />
      <SizeRow title="person" render={(format) => <MembersCard title="Casa" members={LAB_MEMBERS} format={format} onOpen={() => undefined} />} />
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
      <PanelHost presentation={presentation} isOpen={dataPanel !== null} onClose={() => setDataPanel(null)} title={dataPanel ?? ''} wide>
        {dataPanel === 'members' ? (
          <Panel
            kind="members"
            input={{
              name: 'Membri della casa',
              haStates: {},
              members: [
                { id: 'a', personEntityId: 'person.anna', name: 'Anna', state: 'home', trackerEntityIds: [], devices: { smartwatch: 0, tablet: 0, smartphone: 1, tracker: 0 } },
                { id: 'b', personEntityId: 'person.bruno', name: 'Bruno', state: 'home', trackerEntityIds: [], devices: { smartwatch: 1, tablet: 0, smartphone: 1, tracker: 0 } },
                { id: 'c', personEntityId: 'person.carla', name: 'Carla', state: 'not_home', locationLabel: 'Scuola', trackerEntityIds: [], devices: { smartwatch: 0, tablet: 0, smartphone: 1, tracker: 0 } },
              ],
            }}
            onClose={() => setDataPanel(null)}
          />
        ) : dataPanel === 'camera' ? (
          <Panel
            kind="camera"
            input={{
              camera: {
                entityId: 'camera.lab',
                name: 'Ingresso',
                status: 'In diretta',
                relatedEntities: [
                  { entityId: 'switch.record', name: 'Registra', domain: 'switch', category: 'control', state: 'on' },
                  { entityId: 'button.photo', name: 'Foto', domain: 'button', category: 'action' },
                ],
                historyEntries: [{ entityId: 'binary_sensor.motion', state: 'Movimento', timestampMs: 1_700_000_000_000 }],
              },
              onRelatedAction: () => undefined,
            }}
            onClose={() => setDataPanel(null)}
          />
        ) : null}
      </PanelHost>
      <PanelHost presentation={presentation} isOpen={Boolean(climatePanel)} onClose={() => setClimatePanelId(null)} title={climatePanel?.name ?? ''} wide>
        {climatePanel ? (
          <Panel kind="climate" input={{ model: climatePanel, roomName: dt('sectionClimate'), roomHumidity: 48, onAction: (action: ClimateAction) => climates.act(climatePanel.entityId, action) }} onClose={() => setClimatePanelId(null)} />
        ) : null}
      </PanelHost>
      <PanelHost presentation={presentation} isOpen={Boolean(devicePanel)} onClose={() => setDevicePanelId(null)} title={devicePanel?.name ?? ''} wide>
        {devicePanel ? (
          <Panel kind={panelKindOfDevice(devicePanel.kind)} input={{ model: devicePanel, roomName: dt('sectionDevices'), onAction: (action: DeviceAction) => devices.act(devicePanel.entityId, action) }} onClose={() => setDevicePanelId(null)} />
        ) : null}
      </PanelHost>
      <PanelHost
        presentation={presentation}
        isOpen={Boolean(panelModel)}
        onClose={() => setPanelId(null)}
        title={panelModel?.name ?? ''}
        wide
      >
        {panelModel ? (
          <Panel kind="light" input={{ model: panelModel, roomName: dt('lights'), onAction: (action: Parameters<typeof lights.act>[1]) => lights.act(panelModel.entityId, action) }} onClose={() => setPanelId(null)} />
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
