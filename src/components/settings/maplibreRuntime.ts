import { Map, Marker, setWorkerUrl } from 'maplibre-gl';

const developmentWorkerPath = '/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs';
const productionWorkerFileName = './maplibre-gl-worker.js';
const maplibreWorkerUrl = import.meta.env.DEV
  ? new URL(developmentWorkerPath, window.location.origin).href
  : new URL(productionWorkerFileName, import.meta.url).href;

// The production worker is a second Rollup entry so its MapLibre internals are
// shared with this lazy runtime chunk instead of being bundled twice. Pointing
// MapLibre at the window bundle starts a worker without vector-tile handlers.
setWorkerUrl(maplibreWorkerUrl);

export default { Map, Marker };
