type GridEngine2EditorEnvironment = {
  readonly DEV?: boolean;
  readonly VITE_GRID_ENGINE_2_EDITOR?: unknown;
};

export function isGridEngine2EditorEnabled(environment: GridEngine2EditorEnvironment) {
  return environment.DEV === true && environment.VITE_GRID_ENGINE_2_EDITOR === 'true';
}

/** Development-only, exact-true, disabled by default and statically inert in production. */
export const GRID_ENGINE_2_EDITOR_ENABLED = isGridEngine2EditorEnabled(import.meta.env);
