/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_GRID_ENGINE_LEGACY_EDITOR_ROLLBACK?: string;
  readonly VITE_GRID_ENGINE_2_PREVIEW_DIAGNOSTIC?: string;
}
