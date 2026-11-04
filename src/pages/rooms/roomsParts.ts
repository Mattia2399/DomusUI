import React from 'react';
import { LazyLoadErrorBoundary } from '../../components/common/LazyLoadBoundary';
import { onceLoaded } from '../../components/common/onceLoaded';
import { loadMediaPlayer } from '../../components/devices/panels/registry';

/*
 * What the Rooms page opens only on request: the panels of the devices, the
 * section pages, the sheets and the management page. They load apart from the
 * page, and are fetched as soon as it is idle so that the first tap opens them
 * at once.
 */

const loaders = {
  panel: onceLoaded(() => import('../../components/devices/panels/Panel')),
  live: onceLoaded(() => import('../../components/devices/panels/PanelLiveGate')),
  security: onceLoaded(() => import('../../components/devices/panels/SecurityPanel')),
  media: loadMediaPlayer,
  mediaSheets: onceLoaded(() => import('./MediaSheets')),
  section: onceLoaded(() => import('./SectionPage')),
  accessories: onceLoaded(() => import('./AddAccessoriesSheet')),
  manage: onceLoaded(() => import('./RoomsManagePage')),
  roomSheets: onceLoaded(() => import('./RoomManageSheets')),
};

export const Panel = React.lazy(() => loaders.panel().then((module) => ({ default: module.Panel })));
// The panels shared with the Home bring the reading of every sensor family and the camera viewer:
// they load when one opens, not while the page is idle.
export const SensorFamilyPanel = React.lazy(() => import('../../components/devices/panels/SensorFamilyPanel').then((module) => ({ default: module.SensorFamilyPanel })));
export const PanelLiveGate = React.lazy(() => loaders.live().then((module) => ({ default: module.PanelLiveGate })));
export const SecurityPanel = React.lazy(() => loaders.security().then((module) => ({ default: module.SecurityPanel })));
export const MediaPlayer = React.lazy(() => loaders.media().then((module) => ({ default: module.MediaPlayer })));
export const MediaPickPanel = React.lazy(() => loaders.mediaSheets().then((module) => ({ default: module.MediaPickPanel })));
export const MediaStartPanel = React.lazy(() => loaders.mediaSheets().then((module) => ({ default: module.MediaStartPanel })));
export const SectionPage = React.lazy(() => loaders.section().then((module) => ({ default: module.SectionPage }))) as unknown as typeof import('./SectionPage').SectionPage;
export const AddAccessoriesSheet = React.lazy(() => loaders.accessories().then((module) => ({ default: module.AddAccessoriesSheet })));
export const RoomsManagePage = React.lazy(() => loaders.manage().then((module) => ({ default: module.RoomsManagePage })));
export const RoomEditPanel = React.lazy(() => loaders.roomSheets().then((module) => ({ default: module.RoomEditPanel })));

/** Fetch every part once the page is idle; a part that fails here is asked again when it opens. */
export function preloadRoomsParts() {
  Object.values(loaders).forEach((load) => void Promise.resolve(load()).catch(() => undefined));
}

/** A part that may still be loading: nothing shows until it has arrived, nor if it cannot load. */
export function Deferred({ children }: { children: React.ReactNode }) {
  const loading = React.createElement(React.Suspense, { fallback: null }, children);
  return React.createElement(LazyLoadErrorBoundary, { failure: null, children: loading });
}
