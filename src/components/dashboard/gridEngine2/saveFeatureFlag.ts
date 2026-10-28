type GridEngine2QaSaveEnvironment = {
  readonly DEV?: boolean;
  readonly VITE_GRID_ENGINE_2_QA_SAVE?: unknown;
};

export function isGridEngine2QaSaveEnabled(environment: GridEngine2QaSaveEnvironment) {
  return environment.DEV === true && environment.VITE_GRID_ENGINE_2_QA_SAVE === 'true';
}

/** Independent, development-only write gate. The editor flag alone never enables persistence. */
export const GRID_ENGINE_2_QA_SAVE_ENABLED = isGridEngine2QaSaveEnabled(import.meta.env);
