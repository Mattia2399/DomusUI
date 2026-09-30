import * as maplibre from 'maplibre-gl';
// MapLibre 6 ships its worker as a separate ESM entry. Importing both entries
// into this isolated chunk lets the window and its module worker reuse the
// same emitted module graph instead of bundling the shared runtime twice.
import 'maplibre-gl/dist/maplibre-gl-worker.mjs';

maplibre.setWorkerUrl(import.meta.url);

export default maplibre;
