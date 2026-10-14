type RendererEnvironment = {
  readonly DEV?: boolean;
  readonly VITE_GRID_ENGINE_2_RENDERER?: unknown;
};

export function isGridEngine2RendererEnabled(environment: RendererEnvironment) {
  return environment.DEV === true && environment.VITE_GRID_ENGINE_2_RENDERER === 'true';
}

/** False by default and statically false in Vite production builds. */
export const GRID_ENGINE_2_RENDERER_ENABLED = isGridEngine2RendererEnabled(import.meta.env);
