import React, { useMemo, useState } from 'react';
import { Activity, Camera, Expand, RefreshCw, Video, Webcam } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';
import CameraPtzJoystick, { type CameraPtzDirection } from '../../camera/CameraPtzJoystick';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import GlassToggle from '../../ui/GlassToggle';
import { PanelShell, type PanelLive } from './PanelShell';
import '../theme/panels.css';

/*
 * The shared camera panel. It deliberately renders only capabilities that Home
 * Assistant actually exposes: a visual, PTZ, supported related controls and
 * real event/history rows. Missing capabilities disappear instead of becoming
 * decorative disabled controls.
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

export type CameraPanelProps = {
  camera: CameraPanelModel;
  roomName?: string;
  commandsEnabled?: boolean;
  embedded?: boolean;
  live?: PanelLive;
  onPtzMove?: (direction: CameraPtzDirection) => void;
  onPtzStop?: () => void;
  onRelatedAction?: (request: CameraRelatedAction) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
};

const normalized = (value: string | undefined) => `${value ?? ''}`.trim().toLowerCase();
const isOn = (entity: CameraRelatedEntity) => ['on', 'open', 'playing', 'recording', 'active'].includes(normalized(entity.state));
const isAway = (entity: CameraRelatedEntity) => ['unavailable', 'unknown', ''].includes(normalized(entity.state ?? entity.stateLabel));
const isToggle = (entity: CameraRelatedEntity) => ['switch', 'input_boolean', 'light', 'fan', 'siren'].includes(entity.domain);
const isButton = (entity: CameraRelatedEntity) => entity.domain === 'button' || entity.domain === 'input_button';
const isSelect = (entity: CameraRelatedEntity) =>
  (entity.domain === 'select' || entity.domain === 'input_select') && Boolean(entity.options?.length);
const isNumber = (entity: CameraRelatedEntity) =>
  (entity.domain === 'number' || entity.domain === 'input_number') && typeof entity.numericValue === 'number';

const appendNonce = (url: string, nonce: number) => {
  if (nonce === 0 || /^(?:data|blob):/i.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_domus=${nonce}`;
};

export function CameraPanel({
  camera,
  roomName,
  commandsEnabled = true,
  embedded,
  live,
  onPtzMove,
  onPtzStop,
  onRelatedAction,
  onClose,
}: CameraPanelProps) {
  const { t, locale } = useI18n();
  const [nonce, setNonce] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [ptzOpen, setPtzOpen] = useState(false);
  const [ptzDirection, setPtzDirection] = useState<CameraPtzDirection | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visual = camera.snapshotUrl ?? camera.streamUrl ?? null;
  const visualUrl = visual ? appendNonce(visual, nonce) : null;
  const subtitle = [roomName, camera.isOffline ? t('camera.unreachable') : camera.status?.trim() || t('camera.online')]
    .filter(Boolean)
    .join(' · ');
  const related = camera.relatedEntities ?? [];
  const controls = related.filter(
    (entity) =>
      (entity.category === 'control' || entity.category === 'action') &&
      (isToggle(entity) || isButton(entity) || isSelect(entity) || isNumber(entity)),
  );
  const relatedById = useMemo(() => new Map(related.map((entity) => [entity.entityId.toLowerCase(), entity])), [related]);
  const events = (camera.historyEntries ?? []).slice(0, 6);
  const canPtz = commandsEnabled && camera.supportsPtz && Boolean(onPtzMove);
  const info = [
    [t('camera.info.manufacturer'), camera.deviceInfo?.manufacturer],
    [t('camera.info.model'), camera.deviceInfo?.model],
    [t('camera.info.firmware'), camera.deviceInfo?.swVersion],
    [t('camera.info.hardware'), camera.deviceInfo?.hwVersion],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const run = async (request: CameraRelatedAction) => {
    if (!commandsEnabled || !onRelatedAction || busyId) return;
    setBusyId(request.entity.entityId);
    try {
      await onRelatedAction(request);
    } finally {
      setBusyId(null);
    }
  };

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
    setPtzOpen(false);
  }, [camera.entityId]);

  return (
    <PanelShell
      icon={<Webcam size={23} strokeWidth={2} />}
      iconClassName={camera.isOffline ? 'bg-[color:var(--dv-icon-off)] dv-t3' : 'bg-[rgb(100_210_255/0.18)] text-[#64d2ff]'}
      name={camera.name}
      subtitle={subtitle}
      liveSubtitle
      embedded={embedded}
      live={live}
      onClose={onClose}
    >
      <div className="dv-camera-panel-preview">
        {visualUrl && !imageFailed ? (
          <img src={visualUrl} alt={camera.name} onError={() => setImageFailed(true)} />
        ) : (
          <span className="dv-camera-panel-empty"><Video size={28} aria-hidden="true" />{t('camera.preview.streamUnavailable')}</span>
        )}
        {visual && !camera.isOffline ? <span className="dv-camera-panel-live"><i />LIVE</span> : null}
        {visual ? (
          <span className="dv-camera-panel-tools">
            <button type="button" aria-label={t('camera.viewer.refresh')} onClick={() => { setImageFailed(false); setNonce((value) => value + 1); }}>
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label={t('camera.preview.fullscreen')} onClick={() => setViewerOpen(true)}>
              <Expand size={16} aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>

      {canPtz ? (
        <div className="flex flex-col gap-3">
          <button type="button" className="dv-pn-sm self-start" aria-expanded={ptzOpen} onClick={() => setPtzOpen((open) => !open)}>
            {ptzOpen ? t('camera.preview.hidePtzShort') : t('camera.preview.showPtzShort')}
          </button>
          {ptzOpen ? (
            <CameraPtzJoystick
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
          ) : null}
        </div>
      ) : null}

      {controls.length > 0 && commandsEnabled && onRelatedAction ? (
        <>
          <div className="dv-pn-label">{t('camera.settings.controls')}</div>
          <div className="dv-card dv-pn-rows">
            {controls.map((entity) => (
              <div key={entity.entityId} className="dv-pn-row">
                <span className="dv-pn-row-ic" aria-hidden="true"><Camera size={17} /></span>
                <span className="dv-pn-rt"><b>{entity.name}</b>{entity.stateLabel ? <span className="dv-t2">{entity.stateLabel}</span> : null}</span>
                {isToggle(entity) ? (
                  <GlassToggle
                    checked={isOn(entity)}
                    disabled={isAway(entity) || busyId === entity.entityId}
                    label={entity.name}
                    onChange={() => void run({ entity, action: 'toggle' })}
                    size="compact"
                  />
                ) : isButton(entity) ? (
                  <button type="button" className="dv-pn-pill" disabled={busyId === entity.entityId} onClick={() => void run({ entity, action: 'press' })}>
                    {t('camera.action.run')}
                  </button>
                ) : isSelect(entity) ? (
                  <GlassSegmentSelect
                    ariaLabel={entity.name}
                    options={(entity.options ?? []).map((option) => ({ value: option, label: option }))}
                    value={(entity.options ?? []).includes(entity.state ?? '') ? entity.state : undefined}
                    onChange={(value) => void run({ entity, action: 'select', value })}
                    scrollable
                  />
                ) : isNumber(entity) ? (
                  <input
                    className="dv-camera-panel-range"
                    type="range"
                    min={entity.min ?? 0}
                    max={entity.max ?? 100}
                    step={entity.step ?? 1}
                    value={entity.numericValue}
                    aria-label={entity.name}
                    onChange={(event) => void run({ entity, action: 'set_value', value: Number(event.target.value) })}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {events.length > 0 ? (
        <>
          <div className="dv-pn-label">{t('camera.events.title')}</div>
          <div className="dv-card dv-pn-rows">
            {events.map((event, index) => {
              const entity = relatedById.get(event.entityId.toLowerCase());
              return (
                <div key={`${event.entityId}-${event.timestampMs}-${index}`} className="dv-pn-row">
                  <span className="dv-pn-row-ic" aria-hidden="true"><Activity size={17} /></span>
                  <span className="dv-pn-rt"><b>{entity?.name ?? event.state}</b><span className="dv-t2">{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(event.timestampMs)}</span></span>
                  {entity && event.state !== entity.name ? <span className="dv-pn-tm dv-t2">{event.state}</span> : null}
                </div>
              );
            })}
          </div>
        </>
      ) : camera.historyStatus === 'loading' ? (
        <p className="dv-t2 m-0 text-sm">{t('camera.events.loading')}</p>
      ) : camera.historyStatus === 'error' || camera.historyStatus === 'offline' ? (
        <div className="dv-card flex items-center justify-between gap-3">
          <span className="dv-t2 text-sm">{camera.historyError || t('camera.events.historyUnavailable')}</span>
          {camera.onRefreshHistory ? <button type="button" className="dv-pn-pill" onClick={camera.onRefreshHistory}>{t('camera.events.retry')}</button> : null}
        </div>
      ) : null}

      {info.length > 0 ? (
        <>
          <div className="dv-pn-label">{t('camera.settings.info')}</div>
          <div className="dv-card dv-pn-rows">
            {info.map(([label, value]) => <div key={label} className="dv-pn-row"><span className="dv-pn-rt"><b>{label}</b></span><span className="dv-pn-tm dv-t2">{value}</span></div>)}
          </div>
        </>
      ) : null}

      {viewerOpen ? (
        <React.Suspense fallback={null}>
          <CameraViewerBridge camera={camera} canPtz={canPtz} onPtzMove={onPtzMove} onPtzStop={onPtzStop} onClose={() => setViewerOpen(false)} />
        </React.Suspense>
      ) : null}
    </PanelShell>
  );
}

const CameraViewer = React.lazy(() => import('../../camera/CameraViewer').then((module) => ({ default: module.CameraViewer })));

function CameraViewerBridge({
  camera,
  canPtz,
  onPtzMove,
  onPtzStop,
  onClose,
}: {
  camera: CameraPanelModel;
  canPtz: boolean;
  onPtzMove?: (direction: CameraPtzDirection) => void;
  onPtzStop?: () => void;
  onClose: () => void;
}) {
  const entityId = camera.entityId ?? 'camera.preview';
  return (
    <CameraViewer
      isOpen
      cameras={[{
        entityId,
        name: camera.name,
        statusLabel: camera.status ?? '',
        streamUrl: camera.streamUrl,
        snapshotUrl: camera.snapshotUrl,
        isOffline: camera.isOffline,
        supportsPtz: canPtz,
      }]}
      activeEntityId={entityId}
      onActiveEntityChange={() => undefined}
      onClose={onClose}
      commandsEnabled={canPtz}
      onPtzMove={onPtzMove ? (_entityId, direction) => onPtzMove(direction) : undefined}
      onPtzStop={onPtzStop}
    />
  );
}

export default CameraPanel;
