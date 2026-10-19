import { isGridEngine2RendererEnabled } from './rendererFeatureFlag';

type RuntimeSolverRendererEnvironment = {
  readonly DEV?: boolean;
  readonly VITE_GRID_ENGINE_2_RENDERER?: unknown;
  readonly VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER?: unknown;
};

export function isGridEngine2RuntimeSolverRendererRequested(
  environment: RuntimeSolverRendererEnvironment,
) {
  return environment.DEV === true &&
    environment.VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER === 'true';
}

export function isGridEngine2RuntimeSolverRendererEnabled(
  environment: RuntimeSolverRendererEnvironment,
) {
  return isGridEngine2RuntimeSolverRendererRequested(environment) &&
    isGridEngine2RendererEnabled(environment);
}

/** Development-only, exact-true, disabled by default and inert in production. */
export const GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER_REQUESTED =
  isGridEngine2RuntimeSolverRendererRequested(import.meta.env);

export const GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER_ENABLED =
  isGridEngine2RuntimeSolverRendererEnabled(import.meta.env);
