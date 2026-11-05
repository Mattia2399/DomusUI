import React from 'react';
import { Activity, Expand, Info, Move, RefreshCw, Video } from 'lucide-react';
import { useI18n } from '../../../../i18n/I18nProvider';
import CameraPtzJoystick, { type CameraPtzDirection } from '../../../camera/CameraPtzJoystick';
import { GlassButton } from '../../../ui/GlassButton';
import { GlassValueRows } from '../../../ui/GlassListRow';
import type { PanelControl, PanelEntry, PanelSpec } from '../registry';
import { relatedControl } from './related';
import { accentOf, ICON, PanelRows } from './shared';
import './data.css';

/*
 * A camera: its live picture in the middle, and only what Home Assistant exposes
 * around it. What is missing disappears: nothing here is a decorative control.
 */

export type CameraRelatedEntityCategory = 'detection' | 'diagnostic' | 'control' | 'action' | 'media' | 'other';

export type CameraRelatedEntity = {
  entityId: string;
  name: string;
  domain: string;
  category: CameraRelatedEntityCategory;
  state?: string;
  stateLabel?: string;
  unit?: string;
  deviceClass?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  numericValue?: number;
};

export type CameraRelatedAction = {
  entity: CameraRelatedEntity;
  action: 'toggle' | 'press' | 'select' | 'set_value';
  value?: string | number | boolean;
};

export type CameraPanelModel = {
  name: string;
  status?: string;
  entityId?: string;
  streamUrl?: string;
  snapshotUrl?: string;
  isOffline?: boolean;
  supportsPtz?: boolean;
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    swVersion?: string;
    hwVersion?: string;
  };
  relatedEntities?: CameraRelatedEntity[];
  historyEntries?: Array<{
    entityId: string;
    state: string;
    timestampMs: number;
    attributes?: Record<string, unknown>;
  }>;
  historyStatus?: 'idle' | 'loading' | 'available' | 'empty' | 'error' | 'offline';
  historyError?: string;
  onRefreshHistory?: () => void;
};

export type CameraPanelInput = {
  camera: CameraPanelModel;
  roomName?: string;
  commandsEnabled?: boolean;
  onPtzMove?: (direction: CameraPtzDirection) => void;
  onPtzStop?: () => void;
  onRelatedAction?: (request: CameraRelatedAction) => boolean | void | Promise<boolean | void>;
};

const CameraViewer = React.lazy(() => import('../../../camera/CameraViewer').then((module) => ({ default: module.CameraViewer })));

const appendNonce = (url: string, nonce: number) => {
  if (nonce === 0 || /^(?:data|blob):/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}_domus=${nonce}`;
};

function useCameraSpec({ camera, roomName, commandsEnabled = true, onPtzMove, onPtzStop, onRelatedAction }: CameraPanelInput): PanelSpec {
  const { t, locale } = useI18n();
  const [nonce, setNonce] = React.useState(0);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [ptzDirection, setPtzDirection] = React.useState<CameraPtzDirection | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(
    () => () => {
      if (ptzDirection) onPtzStop?.();
    },
    [onPtzStop, ptzDirection],
  );
  React.useEffect(() => {
    setImageFailed(false);
    setNonce(0);
    setViewerOpen(false);
  }, [camera.entityId]);

  const visual = camera.snapshotUrl ?? camera.streamUrl ?? null;
  const visualUrl = visual ? appendNonce(visual, nonce) : null;
  const status = [roomName, camera.isOffline ? t('camera.unreachable') : camera.status?.trim() || t('camera.online')].filter(Boolean).join(' · ');
  const related = camera.relatedEntities ?? [];
  const relatedById = new Map(related.map((entity) => [entity.entityId.toLowerCase(), entity]));
  const canPtz = Boolean(commandsEnabled && camera.supportsPtz && onPtzMove);

  const run = async (request: CameraRelatedAction) => {
    if (!commandsEnabled || !onRelatedAction || busyId) return;
    setBusyId(request.entity.entityId);
    try {
      await onRelatedAction(request);
    } finally {
      setBusyId(null);
    }
  };

  const controls: PanelControl[] = [];
  if (canPtz) {
    const joystick = (size: 'default' | 'hero') => (
      <CameraPtzJoystick
        size={size}
        activeDirection={ptzDirection}
        onDirectionStart={(direction) => {
          setPtzDirection(direction);
          onPtzMove?.(direction);
        }}
        onDirectionStop={() => {
          setPtzDirection(null);
          onPtzStop?.();
        }}
      />
    );
    controls.push({ id: 'ptz', icon: <Move {...ICON} />, label: t('camera.preview.showPtzShort'), looks: ['pad'], big: () => joystick('hero'), group: joystick('default') });
  }
  const events = (camera.historyEntries ?? []).slice(0, 6);
  if (events.length > 0 || camera.historyStatus === 'loading' || camera.historyStatus === 'error' || camera.historyStatus === 'offline') {
    const eventRows = events.map((event) => [
      relatedById.get(event.entityId.toLowerCase())?.name ?? event.state,
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(event.timestampMs),
    ] as const);
    const noEvents = camera.historyStatus === 'loading' ? (
      <p className="panel-screen-note">{t('camera.events.loading')}</p>
    ) : (
      <>
        <p className="panel-screen-note">{camera.historyError || t('camera.events.historyUnavailable')}</p>
        {camera.onRefreshHistory ? (
          <GlassButton variant="soft" className="panel-group-action" onClick={camera.onRefreshHistory}>
            {t('camera.events.retry')}
          </GlassButton>
        ) : null}
      </>
    );
    controls.push({
      id: 'events',
      icon: <Activity {...ICON} />,
      label: t('camera.events.title'),
      value: events.length > 0 ? events.length : undefined,
      looks: ['rows'],
      big: () => (events.length > 0 ? <GlassValueRows size="hero" rows={eventRows.map(([title, value], index) => ({ key: String(index), title, value }))} /> : noEvents),
      group: events.length > 0 ? <PanelRows rows={eventRows} /> : noEvents,
    });
  }
  if (commandsEnabled && onRelatedAction) {
    let shown = 0;
    for (const entity of related) {
      if (entity.category !== 'control' && entity.category !== 'action') continue;
      const control = relatedControl(entity, {
        runLabel: t('camera.action.run'),
        busy: busyId === entity.entityId,
        // The first two stand in the row; the others wait in Altro.
        place: shown < 2 ? 'main' : 'more',
        commands: {
          toggle: () => void run({ entity, action: 'toggle' }),
          press: () => void run({ entity, action: 'press' }),
          select: (value) => void run({ entity, action: 'select', value }),
          number: (value) => void run({ entity, action: 'set_value', value }),
        },
      });
      if (control) {
        controls.push(control);
        shown += 1;
      }
    }
  }
  const info = [
    [t('camera.info.manufacturer'), camera.deviceInfo?.manufacturer],
    [t('camera.info.model'), camera.deviceInfo?.model],
    [t('camera.info.firmware'), camera.deviceInfo?.swVersion],
    [t('camera.info.hardware'), camera.deviceInfo?.hwVersion],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (info.length > 0) {
    controls.push({
      id: 'info',
      icon: <Info {...ICON} />,
      label: t('camera.settings.info'),
      looks: ['rows'],
      big: () => <GlassValueRows size="hero" rows={info.map(([title, value]) => ({ key: title, title, value }))} />,
      group: <PanelRows rows={info} />,
    });
  }

  const entityId = camera.entityId ?? 'camera.preview';
  return {
    owner: entityId,
    name: camera.name,
    status,
    layout: 'camera',
    heroName: status,
    accent: accentOf('255 69 58'),
    tint: !camera.isOffline,
    heroKind: 'data',
    hero: (
      <div className="panel-camera">
        {visualUrl && !imageFailed ? (
          <img src={visualUrl} alt={camera.name} onError={() => setImageFailed(true)} />
        ) : (
          <span className="panel-camera-empty">
            <Video size={28} aria-hidden="true" />
            {t('camera.preview.streamUnavailable')}
          </span>
        )}
        {visual && !camera.isOffline ? (
          <span className="panel-camera-live">
            <i />
            LIVE
          </span>
        ) : null}
        {visual ? (
          <span className="panel-camera-tools">
            <button
              type="button"
              aria-label={t('camera.viewer.refresh')}
              onClick={() => {
                setImageFailed(false);
                setNonce((value) => value + 1);
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label={t('camera.preview.fullscreen')} onClick={() => setViewerOpen(true)}>
              <Expand size={16} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        {viewerOpen ? (
          <React.Suspense fallback={null}>
            <CameraViewer
              isOpen
              cameras={[{ entityId, name: camera.name, statusLabel: camera.status ?? '', streamUrl: camera.streamUrl, snapshotUrl: camera.snapshotUrl, isOffline: camera.isOffline, supportsPtz: canPtz }]}
              activeEntityId={entityId}
              onActiveEntityChange={() => undefined}
              onClose={() => setViewerOpen(false)}
              commandsEnabled={canPtz}
              onPtzMove={onPtzMove ? (_entityId, direction) => onPtzMove(direction) : undefined}
              onPtzStop={onPtzStop}
            />
          </React.Suspense>
        ) : null}
      </div>
    ),
    controls,
  };
}

export const cameraEntry: PanelEntry<CameraPanelInput> = { useSpec: useCameraSpec };
