import React from 'react';
import { useReducedMotion } from 'framer-motion';
import type { EnergyModuleId, EnergyState } from '../../../services/energyCoreClient';
import type { FlowView } from './energyModel';

const VISUAL_HARDWARE_ORDER = ['grid', 'solar', 'battery', 'wallbox'] as const satisfies readonly EnergyModuleId[];

type Point = [number, number];
type HardwareId = (typeof VISUAL_HARDWARE_ORDER)[number];

export type EnergyHomeVariant = 'none' | string;

/** A scene in render pixels (768×1376). Without `src` it is drawn as a schematic. */
export type EnergyHomeAsset = {
  src?: string;
  alt: string;
  /** Vertical centre of the house (0–1), used for framing. */
  focusY?: number;
  anchors?: Partial<Record<HardwareId | 'home', Point>>;
  /** Callout position and horizontal alignment for each component. */
  labels?: Partial<Record<HardwareId, [number, number, 'start' | 'end' | 'center']>>;
};

export type EnergyHomeAssetCatalog = Partial<Record<EnergyHomeVariant, EnergyHomeAsset>>;

const render = (file: string) => `${import.meta.env.BASE_URL}images/energy/mobile/${file}.png`;
const HOME: Point = [300, 760];
const GRID_LABEL: [number, number, 'end'] = [470, 960, 'end'];
const BATTERY_LABEL: [number, number, 'end'] = [690, 720, 'end'];

/**
 * Renders keyed by the exact configured hardware. The file named "night" shows
 * no solar panels, so it represents the grid + battery installation.
 */
export const ENERGY_HOME_ASSETS: EnergyHomeAssetCatalog = {
  grid: {
    src: render('grid-only'),
    alt: 'Casa con rete',
    focusY: 0.54,
    anchors: { home: [300, 790], grid: [487, 880] },
    labels: { grid: [520, 990, 'start'] },
  },
  'grid+solar': {
    src: render('grid-solar'),
    alt: 'Casa con rete e fotovoltaico',
    focusY: 0.54,
    anchors: { home: [300, 790], grid: [487, 880], solar: [340, 620] },
    labels: { solar: [470, 480, 'start'], grid: [520, 990, 'start'] },
  },
  'grid+solar+battery': {
    src: render('grid-solar-battery'),
    alt: 'Casa con rete, fotovoltaico e batteria',
    anchors: { home: HOME, grid: [482, 833], solar: [340, 580], battery: [528, 820] },
    labels: { solar: [470, 440, 'start'], grid: GRID_LABEL, battery: BATTERY_LABEL },
  },
  'grid+solar+battery+wallbox': {
    src: render('grid-solar-battery-ev'),
    alt: 'Casa con rete, fotovoltaico, batteria e wallbox',
    anchors: { home: HOME, grid: [488, 856], solar: [340, 570], battery: [535, 858], wallbox: [467, 845] },
    labels: { solar: [470, 430, 'start'], grid: [560, 990, 'start'], battery: [700, 760, 'end'], wallbox: [250, 1000, 'center'] },
  },
  'grid+battery': {
    src: render('grid-solar-battery-night'),
    alt: 'Casa con rete e batteria',
    anchors: { home: HOME, grid: [482, 833], battery: [528, 820] },
    labels: { grid: GRID_LABEL, battery: BATTERY_LABEL },
  },
};

/** Schematic used for combinations without a matching render. */
const SCHEMATIC: EnergyHomeAsset = {
  alt: 'Schema dell’impianto',
  focusY: 0.5,
  anchors: { home: [384, 700], solar: [384, 470], grid: [170, 900], battery: [598, 700], wallbox: [598, 900] },
  labels: { solar: [384, 420, 'center'], grid: [170, 950, 'center'], battery: [640, 650, 'end'], wallbox: [598, 950, 'center'] },
};

const COLORS: Record<HardwareId, string> = {
  solar: '250 204 21',
  grid: '56 189 248',
  battery: '52 211 153',
  wallbox: '192 132 252',
};

export function energyHomeVariant(state: Pick<EnergyState, 'modules'>): EnergyHomeVariant {
  const present = VISUAL_HARDWARE_ORDER.filter((id) => Boolean(state.modules[id]));
  return present.length > 0 ? present.join('+') : 'none';
}

export function selectEnergyHomeAsset(
  state: Pick<EnergyState, 'modules'>,
  assets: EnergyHomeAssetCatalog = ENERGY_HOME_ASSETS,
) {
  const variant = energyHomeVariant(state);
  return { variant, asset: assets[variant] ?? null };
}

/** A gentle curve between a component and the home entry. */
function flowPath([x1, y1]: Point, [x2, y2]: Point) {
  return `M ${x1} ${y1} Q ${(x1 + x2) / 2 + (y2 - y1) * 0.18} ${(y1 + y2) / 2 - Math.abs(x2 - x1) * 0.12} ${x2} ${y2}`;
}

function describe(scene: EnergyHomeAsset, view: FlowView) {
  const parts = view.nodes.map((node) => `${node.label}: ${node.online ? `${node.value}${node.caption ? ` ${node.caption}` : ''}` : 'offline'}`);
  return `${scene.alt}. Flussi energetici. ${[...parts, `Casa: ${view.home.value} ${view.home.caption}`].join('; ')}.`;
}

function Scene({ scene, view, onError }: { scene: EnergyHomeAsset; view: FlowView; onError?: () => void }) {
  const reduceMotion = Boolean(useReducedMotion());
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const home = scene.anchors?.home ?? HOME;
  return (
    <div className="relative h-full w-full overflow-hidden [container-type:size]" role="img" aria-label={describe(scene, view)}>
      <div
        className="absolute left-1/2 top-1/2 aspect-[768/1376] w-[min(104cqw,108cqh)]"
        style={{ transform: `translate(-50%, -${(scene.focusY ?? 0.51) * 100}%)` }}
      >
        {scene.src ? (
          <img src={scene.src} alt="" decoding="async" draggable={false} className="absolute inset-0 h-full w-full select-none [mask-image:radial-gradient(closest-side,#000_72%,transparent)]" onError={onError} data-testid="energy-home-image" />
        ) : null}
        <svg viewBox="0 0 768 1376" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {scene.src ? null : (
            <g fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="3" strokeLinejoin="round">
              <path d="M300 680 L384 610 L468 680 V780 H300 Z" />
              <path d="M360 780 V730 H408 V780" />
            </g>
          )}
          {view.nodes.map((node) => {
            const point = scene.anchors?.[node.id as HardwareId];
            const label = scene.labels?.[node.id as HardwareId];
            if (!point) return null;
            const color = COLORS[node.id as HardwareId];
            const active = node.online && node.direction !== 'idle';
            const pathId = `${id}-${node.id}`;
            const duration = Math.max(1.6, 3.2 - Math.min(node.amountW, 6000) / 4000);
            return (
              <g key={node.id} data-flow-direction={node.direction} data-flow-online={node.online ? 'true' : 'false'}>
                {label ? <path d={`M ${point[0]} ${point[1]} L ${label[0]} ${label[1]}`} stroke="rgb(255 255 255 / 0.22)" strokeWidth="1.4" /> : null}
                <path
                  id={pathId}
                  d={node.direction === 'out' ? flowPath(home, point) : flowPath(point, home)}
                  fill="none"
                  stroke={`rgb(${color} / ${active ? 0.5 : 0.14})`}
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeDasharray={node.online ? undefined : '6 8'}
                />
                <circle cx={point[0]} cy={point[1]} r="7" fill={`rgb(${color})`} opacity={node.online ? 0.95 : 0.35} />
                {active && !reduceMotion ? (
                  <>
                    <circle cx={point[0]} cy={point[1]} r="7" fill="none" stroke={`rgb(${color})`} strokeWidth="2">
                      <animate attributeName="r" values="7;22" dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                    {(node.amountW > 2500 ? [0, 0.5] : [0]).map((offset) => (
                      <circle key={offset} r="5" fill={`rgb(${color})`}>
                        <animateMotion dur={`${duration}s`} begin={`${-offset * duration}s`} repeatCount="indefinite">
                          <mpath href={`#${pathId}`} />
                        </animateMotion>
                      </circle>
                    ))}
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
        {view.nodes.map((node) => {
          const label = scene.labels?.[node.id as HardwareId];
          if (!label) return null;
          return (
            <span
              key={node.id}
              aria-hidden="true"
              className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:text-xs ${node.online ? 'border-white/16' : 'border-dashed border-white/25 text-white/60'}`}
              style={{
                left: `${(label[0] / 768) * 100}%`,
                top: `${(label[1] / 1376) * 100}%`,
                transform: `translate(${label[2] === 'start' ? '0' : label[2] === 'end' ? '-100%' : '-50%'}, -50%)`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${COLORS[node.id as HardwareId]})` }} />
              {node.label} {node.online ? node.value : 'offline'}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function EnergyHomeVisual({
  state,
  view,
  assets = ENERGY_HOME_ASSETS,
}: {
  state: Pick<EnergyState, 'modules'>;
  view: FlowView;
  assets?: EnergyHomeAssetCatalog;
}) {
  const { variant, asset } = selectEnergyHomeAsset(state, assets);
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const useImage = Boolean(asset?.src && failedSource !== asset.src);

  return (
    <div className="h-full w-full" data-energy-home-variant={variant} data-energy-home-render={useImage ? 'image' : 'diagram'}>
      <Scene
        key={useImage ? asset?.src : 'schematic'}
        scene={useImage && asset ? asset : SCHEMATIC}
        view={view}
        onError={() => setFailedSource(asset?.src ?? null)}
      />
    </div>
  );
}
