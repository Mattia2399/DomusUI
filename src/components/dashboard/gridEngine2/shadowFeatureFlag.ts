type ShadowEnvironment = {
  readonly DEV?: boolean;
  readonly VITE_GRID_ENGINE_2_SHADOW?: unknown;
};

export function isGridEngine2ShadowEnabled(environment: ShadowEnvironment) {
  return environment.DEV === true && environment.VITE_GRID_ENGINE_2_SHADOW === 'true';
}

/** False by default and statically false in Vite production builds. */
export const GRID_ENGINE_2_SHADOW_ENABLED = isGridEngine2ShadowEnabled(import.meta.env);
