import React from 'react';
import { LazyLoadErrorBoundary } from '../../components/common/LazyLoadBoundary';

/*
 * What the Rooms page opens only on request: the panels of the devices, the
 * section pages, the sheets and the management page. They load apart from the
 * page, and are fetched as soon as it is idle so that the first tap opens them
 * at once.
 */

const loaders = {
  light: () => import('../../components/devices/panels/LightPanel'),
  device: () => import('../../components/devices/panels/DevicePanel'),
  climate: () => import('../../components/devices/panels/ClimatePanel'),
  sensor: () => import('../../components/devices/panels/SensorPanel'),
  security: () => import('../../components/devices/panels/SecurityPanel'),
  media: () => import('../../components/devices/panels/MediaPlayer'),
  mediaSheets: () => import('./MediaSheets'),
  section: () => import('./SectionPage'),
  accessories: () => import('./AddAccessoriesSheet'),
  manage: () => import('./RoomsManagePage'),
  roomSheets: () => import('./RoomManageSheets'),
};

export const LightPanel = React.lazy(() => loaders.light().then((module) => ({ default: module.LightPanel })));
export const DevicePanel = React.lazy(() => loaders.device().then((module) => ({ default: module.DevicePanel })));
export const ClimatePanel = React.lazy(() => loaders.climate().then((module) => ({ default: module.ClimatePanel })));
export const SensorPanel = React.lazy(() => loaders.sensor().then((module) => ({ default: module.SensorPanel })));
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
  Object.values(loaders).forEach((load) => void load().catch(() => undefined));
}

/** A part that may still be loading: nothing shows until it has arrived, nor if it cannot load. */
export function Deferred({ children }: { children: React.ReactNode }) {
  const loading = React.createElement(React.Suspense, { fallback: null }, children);
  return React.createElement(LazyLoadErrorBoundary, { failure: null, children: loading });
}
