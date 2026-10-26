import React from 'react';
import { clsx } from 'clsx';
import { LightCard } from '../components/devices/cards/LightCard';
import { DEVICE_CARD_FORMATS, deviceCardHeightPx, type DeviceCardFormat } from '../components/devices/cards/DeviceCardShell';
import { LightPanel } from '../components/devices/panels/LightPanel';
import { PanelHost, type PanelPresentation } from '../components/devices/panels/PanelHost';
import { lightRgb } from '../components/devices/model/tileColor';
import { useDevicesTranslations } from '../i18n/devicesTranslations';
import { DEMO_LIGHT_STATES } from './rooms-v2/demoLightsFixtures';
import { useLightCommands } from './rooms-v2/useLightCommands';

/*
 * Development only (/devices-lab): the light card in every format, lit, off
 * and away, in Dark and Light, at the sizes of the Home grid (columns of
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

function widthOf(format: DeviceCardFormat) {
  const columns = format.startsWith('X') ? 4 : format.startsWith('W') ? 2 : 1;
  return columns * COLUMN_PX + (columns - 1) * GAP_PX;
}

function Board({ theme }: { theme: 'dark' | 'light' }) {
  const dt = useDevicesTranslations();
  const lights = useLightCommands({ demo: true, states: DEMO_LIGHT_STATES });
  const [panelId, setPanelId] = React.useState<string | null>(null);
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
            className={clsx('dv-glass rv2-pill h-9 rounded-full px-3.5 text-[13px] font-semibold', presentation === option && 'ring-2 ring-[color:var(--dv-select)]')}
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
