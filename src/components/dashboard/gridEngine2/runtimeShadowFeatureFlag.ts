type RuntimeShadowEnvironment = {
  readonly DEV?: unknown;
  readonly VITE_GRID_ENGINE_2_RUNTIME_SHADOW?: unknown;
  readonly VITE_GRID_ENGINE_2_RUNTIME_SHADOW_ID_DETAILS?: unknown;
  readonly VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE?: unknown;
  readonly VITE_GRID_ENGINE_2_RUNTIME_GEOMETRY_INSPECT?: unknown;
};

export function isGridEngine2RuntimeShadowEnabled(environment: RuntimeShadowEnvironment) {
  return environment.DEV === true && environment.VITE_GRID_ENGINE_2_RUNTIME_SHADOW === 'true';
}

export function isGridEngine2RuntimeShadowIdDetailsEnabled(environment: RuntimeShadowEnvironment) {
  return isGridEngine2RuntimeShadowEnabled(environment)
    && environment.VITE_GRID_ENGINE_2_RUNTIME_SHADOW_ID_DETAILS === 'true';
}

export function isGridEngine2RuntimeShadowReconciliationEnabled(environment: RuntimeShadowEnvironment) {
  return isGridEngine2RuntimeShadowEnabled(environment)
    && environment.VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE === 'true';
}

export function isGridEngine2RuntimeGeometryInspectEnabled(environment: RuntimeShadowEnvironment) {
  return isGridEngine2RuntimeShadowEnabled(environment)
    && environment.VITE_GRID_ENGINE_2_RUNTIME_GEOMETRY_INSPECT === 'true';
}

export const GRID_ENGINE_2_RUNTIME_SHADOW_ENABLED = isGridEngine2RuntimeShadowEnabled(import.meta.env);
export const GRID_ENGINE_2_RUNTIME_SHADOW_ID_DETAILS_ENABLED =
  isGridEngine2RuntimeShadowIdDetailsEnabled(import.meta.env);
export const GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILIATION_ENABLED =
  isGridEngine2RuntimeShadowReconciliationEnabled(import.meta.env);
export const GRID_ENGINE_2_RUNTIME_GEOMETRY_INSPECT_ENABLED =
  isGridEngine2RuntimeGeometryInspectEnabled(import.meta.env);
