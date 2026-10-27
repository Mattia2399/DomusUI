import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Volume2,
  Video,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import GlassModal from '../ui/GlassModal';
import CameraPtzJoystick, { type CameraPtzDirection } from './CameraPtzJoystick';
import { useI18n } from '../../i18n/I18nProvider';

export type CameraViewerItem = {
  entityId: string;
  name: string;
  statusLabel?: string;
  subtitle?: string;
  streamUrl?: string;
  snapshotUrl?: string;
  videoUrl?: string;
  isOffline?: boolean;
  supportsAudio?: boolean;
  supportsPtz?: boolean;
};

type CameraViewerProps = {
  isOpen: boolean;
  cameras: CameraViewerItem[];
  activeEntityId: string | null;
  onActiveEntityChange: (entityId: string) => void;
  onClose: () => void;
  commandsEnabled?: boolean;
  onPtzMove?: (entityId: string, direction: CameraPtzDirection) => void;
  onPtzStop?: (entityId: string) => void;
};

function appendRefreshKey(url: string | undefined, nonce: number) {
  if (!url || nonce === 0 || /^(?:data|blob):/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}domusos_refresh=${nonce}`;
}

function safeFileName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'camera';
}

export function CameraViewer({
  isOpen,
  cameras,
  activeEntityId,
  onActiveEntityChange,
  onClose,
  commandsEnabled = true,
  onPtzMove,
  onPtzStop,
}: CameraViewerProps) {
  const { t, locale } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPtzVisible, setIsPtzVisible] = useState(false);
  const [activePtzDirection, setActivePtzDirection] = useState<CameraPtzDirection | null>(null);
  const [streamFailed, setStreamFailed] = useState(false);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSnapshotBusy, setIsSnapshotBusy] = useState(false);
  // The time on the picture, as on the board, every second while the sheet is open.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isOpen) return undefined;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const activeIndex = Math.max(0, cameras.findIndex((camera) => camera.entityId === activeEntityId));
  const activeCamera = cameras[activeIndex] ?? null;
  const canUsePtz = Boolean(
    activeCamera?.supportsPtz && commandsEnabled && onPtzMove && onPtzStop && !activeCamera.isOffline,
  );
  const canUseAudio = Boolean(activeCamera?.videoUrl && activeCamera.supportsAudio);
  const activeVideoUrl = !isPaused ? appendRefreshKey(activeCamera?.videoUrl, refreshNonce) : undefined;
  const activeStreamUrl = !isPaused && !streamFailed
    ? appendRefreshKey(activeCamera?.streamUrl, refreshNonce)
    : undefined;
  const activeSnapshotUrl = !snapshotFailed
    ? appendRefreshKey(activeCamera?.snapshotUrl, refreshNonce)
    : undefined;
  const visualUrl = activeVideoUrl ?? activeStreamUrl ?? activeSnapshotUrl;

  useEffect(() => {
    setIsPaused(false);
    setIsMuted(true);
    setIsPtzVisible(false);
    setActivePtzDirection(null);
    setStreamFailed(false);
    setSnapshotFailed(false);
    setRefreshNonce(0);
    setFeedback('');
  }, [activeCamera?.entityId]);

  useEffect(() => {
    if (!feedback || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setFeedback(''), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (canUsePtz) return;
    setIsPtzVisible(false);
    setActivePtzDirection(null);
  }, [canUsePtz]);

  useEffect(() => {
    if (!isOpen || !activeEntityId || cameras.some((camera) => camera.entityId === activeEntityId)) return;
    if (cameras[0]) onActiveEntityChange(cameras[0].entityId);
    else onClose();
  }, [activeEntityId, cameras, isOpen, onActiveEntityChange, onClose]);

  const cameraPositionLabel = cameras.length > 1 ? t('camera.viewer.position', { current: activeIndex + 1, total: cameras.length }) : undefined;
  const statusDescription = useMemo(() => {
    if (!activeCamera) return undefined;
    return [activeCamera.statusLabel, activeCamera.subtitle, cameraPositionLabel].filter(Boolean).join(' · ');
  }, [activeCamera, cameraPositionLabel]);

  const selectRelativeCamera = (offset: number) => {
    if (cameras.length < 2) return;
    const nextIndex = (activeIndex + offset + cameras.length) % cameras.length;
    onActiveEntityChange(cameras[nextIndex].entityId);
  };

  const togglePlayback = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (activeVideoUrl && videoRef.current) {
      if (nextPaused) videoRef.current.pause();
      else void videoRef.current.play().catch(() => setFeedback(t('camera.viewer.playbackUnavailable')));
    }
  };

  const refreshVisual = () => {
    setStreamFailed(false);
    setSnapshotFailed(false);
    setRefreshNonce(Date.now());
    setFeedback(t('camera.viewer.refreshed'));
  };

  const toggleNativeFullscreen = async () => {
    const target = stageRef.current;
    if (!target || typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await target.requestFullscreen?.();
    } catch {
      setFeedback(t('camera.viewer.fullscreenUnavailable'));
    }
  };

  const downloadSnapshot = async () => {
    const url = activeCamera?.snapshotUrl ?? activeCamera?.streamUrl;
    if (!url || !activeCamera || isSnapshotBusy) {
      setFeedback(t('camera.viewer.snapshotUnavailable'));
      return;
    }
    setIsSnapshotBusy(true);
    try {
      const response = await fetch(appendRefreshKey(url, Date.now()) ?? url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(activeCamera.name)}-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      link.rel = 'noopener';
      link.click();
      URL.revokeObjectURL(objectUrl);
      setFeedback(t('camera.viewer.snapshotSaved'));
    } catch {
      setFeedback(t('camera.viewer.snapshotUnavailable'));
    } finally {
      setIsSnapshotBusy(false);
    }
  };

  const stopPtz = () => {
    if (!activeCamera || !canUsePtz) return;
    setActivePtzDirection(null);
    onPtzStop?.(activeCamera.entityId);
  };

  const startPtz = (direction: CameraPtzDirection) => {
    if (!activeCamera || !canUsePtz) return;
    setActivePtzDirection(direction);
    onPtzMove?.(activeCamera.entityId, direction);
  };

  const isLive = Boolean(activeCamera && !activeCamera.isOffline && !isPaused && (activeVideoUrl || activeStreamUrl));
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
  const arrowClass =
    'absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60';

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      icon={
        <span className="glass-confirm-mark is-accent !h-12 !w-12">
          {activeCamera?.isOffline ? <WifiOff size={22} strokeWidth={2} /> : <Video size={22} strokeWidth={2} />}
        </span>
      }
      title={activeCamera?.name ?? t('camera.fallback')}
      description={statusDescription}
      size="xl"
      zIndex={310}
      closeLabel={t('camera.viewer.close')}
      panelClassName="!max-w-[640px]"
      bodyClassName="flex flex-col gap-3.5"
    >
      <div ref={stageRef} className="camera-frame">
        {activeCamera && visualUrl && !activeCamera.isOffline ? (
          activeVideoUrl ? (
            <video
              ref={videoRef}
              src={activeVideoUrl}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay={!isPaused}
              muted={isMuted}
              playsInline
              onError={() => setStreamFailed(true)}
            />
          ) : (
            <img
              src={visualUrl}
              alt={t('camera.viewer.previewAlt', { name: activeCamera.name })}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => {
                if (activeStreamUrl) setStreamFailed(true);
                else setSnapshotFailed(true);
              }}
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center text-white/70">
            {activeCamera?.isOffline ? <WifiOff className="h-9 w-9" /> : <Camera className="h-9 w-9" />}
            <p className="m-0 mt-2 text-base font-bold text-white/85">
              {activeCamera?.isOffline ? t('camera.events.cameraOffline') : t('camera.viewer.previewUnavailable')}
            </p>
            <p className="m-0 text-[13px] font-medium text-white/60">{t('camera.viewer.checkConnection')}</p>
          </div>
        )}

        {isLive ? (
          <span className="camera-live">
            <i aria-hidden="true" />
            LIVE
          </span>
        ) : null}
        {activeCamera && !activeCamera.isOffline ? (
          <span className="camera-clock" aria-hidden="true">
            {clock}
          </span>
        ) : null}

        {cameras.length > 1 ? (
          <>
            <button type="button" className={`${arrowClass} left-3`} onClick={() => selectRelativeCamera(-1)} aria-label={t('camera.viewer.previous')}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" className={`${arrowClass} right-3`} onClick={() => selectRelativeCamera(1)} aria-label={t('camera.viewer.next')}>
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}

        {isPtzVisible && canUsePtz ? (
          <div className="absolute bottom-10 right-3 z-30">
            <CameraPtzJoystick activeDirection={activePtzDirection} onDirectionStart={startPtz} onDirectionStop={stopPtz} compact />
          </div>
        ) : null}

        {feedback ? (
          <div role="status" className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">
            {feedback}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="glass-button min-h-10"
          onClick={togglePlayback}
          disabled={!activeCamera || activeCamera.isOffline || (!activeCamera.streamUrl && !activeCamera.videoUrl)}
        >
          {isPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          {isPaused ? t('camera.preview.play') : t('camera.preview.pause')}
        </button>
        <button type="button" className="glass-button min-h-10" onClick={refreshVisual} disabled={!activeCamera || activeCamera.isOffline} aria-label={t('camera.viewer.refresh')}>
          <RefreshCw size={16} aria-hidden="true" />
          {t('camera.viewer.refreshShort')}
        </button>
        <button
          type="button"
          className="glass-button min-h-10"
          onClick={() => void downloadSnapshot()}
          disabled={!activeCamera || activeCamera.isOffline || isSnapshotBusy}
          aria-label={t('camera.viewer.saveSnapshot')}
        >
          <Download size={16} aria-hidden="true" />
          {t('camera.viewer.snapshotShort')}
        </button>
        <button type="button" className="glass-button min-h-10" onClick={() => void toggleNativeFullscreen()} aria-label={t('camera.viewer.nativeFullscreen')}>
          <Expand size={16} aria-hidden="true" />
          {t('camera.preview.fullscreen')}
        </button>
        {activeCamera?.supportsPtz ? (
          <button
            type="button"
            className={clsx('glass-button min-h-10', isPtzVisible && 'glass-button-primary')}
            onClick={() => setIsPtzVisible((value) => !value)}
            disabled={!canUsePtz}
            aria-pressed={isPtzVisible}
            aria-label={isPtzVisible ? t('camera.preview.hidePtz') : t('camera.preview.showPtz')}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t('camera.preview.ptz')}
          </button>
        ) : null}
        {canUseAudio ? (
          <button type="button" className={clsx('glass-button min-h-10', !isMuted && 'glass-button-primary')} onClick={() => setIsMuted((value) => !value)} aria-pressed={!isMuted}>
            {isMuted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
            {isMuted ? t('camera.preview.audioOn') : t('camera.preview.audioOff')}
          </button>
        ) : null}
      </div>
    </GlassModal>
  );
}

export default CameraViewer;
