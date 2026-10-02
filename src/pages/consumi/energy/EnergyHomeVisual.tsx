import React from 'react';
import type { EnergyModuleId, EnergyState } from '../../../services/energyCoreClient';
import { EnergyFlowDiagram } from './EnergyFlowDiagram';
import type { FlowView } from './energyModel';

const VISUAL_HARDWARE_ORDER = ['grid', 'solar', 'battery', 'wallbox'] as const satisfies readonly EnergyModuleId[];

export type EnergyHomeVariant = 'none' | string;

export type EnergyHomeAsset = {
  src: string;
  alt: string;
};

export type EnergyHomeAssetCatalog = Partial<Record<EnergyHomeVariant, EnergyHomeAsset>>;

/**
 * Approved house renders will be registered here when they are delivered.
 * Keeping the catalog empty deliberately preserves the live SVG diagram today.
 */
export const ENERGY_HOME_ASSETS: EnergyHomeAssetCatalog = {};

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
  const canUseAsset = Boolean(asset && failedSource !== asset.src);

  const homeVisual = canUseAsset && asset ? (
    <div className="relative h-full w-full" data-testid="energy-home-image">
      <div className="absolute inset-x-[8%] bottom-[8%] h-[22%] rounded-full bg-black/50 blur-2xl" aria-hidden="true" />
      <img
        src={asset.src}
        alt=""
        loading="lazy"
        decoding="async"
        className="relative h-full w-full object-contain drop-shadow-[0_28px_34px_rgba(0,0,0,0.48)]"
        onError={() => setFailedSource(asset.src)}
      />
      <span className="sr-only">{asset.alt}</span>
    </div>
  ) : undefined;

  return (
    <div
      className="h-full w-full"
      data-energy-home-variant={variant}
      data-energy-home-render={homeVisual ? 'image' : 'diagram'}
    >
      <EnergyFlowDiagram view={view} homeVisual={homeVisual} />
    </div>
  );
}

