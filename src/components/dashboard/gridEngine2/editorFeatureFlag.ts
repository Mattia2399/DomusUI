type GridEngine2EditorEnvironment = {
  readonly VITE_GRID_ENGINE_LEGACY_EDITOR_ROLLBACK?: unknown;
};

/**
 * Grid Engine 2 is the standard Home editor in development and production.
 *
 * The only switch retained here is an opt-in, build-time emergency rollback.
 * It deliberately does not reuse the former opt-in editor setting: an omitted
 * value must select GE2, and stale pre-cutover settings must not change
 * production behaviour.
 */
export function isGridEngine2StandardEditorEnabled(environment: GridEngine2EditorEnvironment) {
  return environment.VITE_GRID_ENGINE_LEGACY_EDITOR_ROLLBACK !== 'true';
}

export const GRID_ENGINE_2_STANDARD_EDITOR_ENABLED =
  isGridEngine2StandardEditorEnabled(import.meta.env);
