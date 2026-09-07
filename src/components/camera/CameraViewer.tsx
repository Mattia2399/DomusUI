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
  VolumeX,
  WifiOff,
} from 'lucide-react';
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
  const { t } = useI18n();
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

  const controlClass = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/14 bg-black/30 text-white/82 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={t('camera.viewer.eyebrow')}
      title={activeCamera?.name ?? t('camera.fallback')}
      description={statusDescription}
      variant="fullscreen"
      zIndex={310}
      closeLabel={t('camera.viewer.close')}
      panelClassName="bg-[color:var(--ui-page-bg)]"
      bodyClassName="flex min-h-0 flex-1 overflow-hidden rounded-[1.5rem] bg-black p-0 sm:rounded-[2rem]"
    >
      <div ref={stageRef} className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black">
        {activeCamera && visualUrl && !activeCamera.isOffline ? (
          activeVideoUrl ? (
            <video
              ref={videoRef}
              src={activeVideoUrl}
              className="absolute inset-0 h-full w-full object-contain"
              autoPlay={!isPaused}
              muted={isMuted}
              playsInline
              onError={() => setStreamFailed(true)}
            />
          ) : (
            <img
              src={visualUrl}
              alt={t('camera.viewer.previewAlt', { name: activeCamera.name })}
              className="absolute inset-0 h-full w-full object-contain"
              onError={() => {
                if (activeStreamUrl) setStreamFailed(true);
                else setSnapshotFailed(true);
              }}
            />
          )
        ) : (
          <div className="flex max-w-sm flex-col items-center px-6 text-center text-white/62">
            {activeCamera?.isOffline ? <WifiOff className="h-10 w-10" /> : <Camera className="h-10 w-10" />}
            <p className="mt-4 text-sm font-semibold text-white/84">{activeCamera?.isOffline ? t('camera.events.cameraOffline') : t('camera.viewer.previewUnavailable')}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/48">{t('camera.viewer.checkConnection')}</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/24 via-transparent to-black/52" aria-hidden="true" />

        {cameras.length > 1 ? (
          <>
            <button type="button" className={`${controlClass} absolute left-3 top-1/2 z-20 -translate-y-1/2 sm:left-5`} onClick={() => selectRelativeCamera(-1)} aria-label={t('camera.viewer.previous')}><ChevronLeft size={20} /></button>
            <button type="button" className={`${controlClass} absolute right-3 top-1/2 z-20 -translate-y-1/2 sm:right-5`} onClick={() => selectRelativeCamera(1)} aria-label={t('camera.viewer.next')}><ChevronRight size={20} /></button>
          </>
        ) : null}

        {isPtzVisible && canUsePtz ? (
          <div className="absolute bottom-20 right-3 z-30 sm:bottom-24 sm:right-5">
            <CameraPtzJoystick activeDirection={activePtzDirection} onDirectionStart={startPtz} onDirectionStop={stopPtz} compact />
          </div>
        ) : null}

        <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-full border border-white/12 bg-black/28 p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
          {canUseAudio ? (
          <button type="button" className={controlClass} onClick={() => setIsMuted((value) => !value)} aria-label={isMuted ? t('camera.preview.audioOn') : t('camera.preview.audioOff')}>{isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          ) : null}
          <button type="button" className={controlClass} onClick={togglePlayback} disabled={!activeCamera || activeCamera.isOffline || (!activeCamera.streamUrl && !activeCamera.videoUrl)} aria-label={isPaused ? t('camera.preview.play') : t('camera.preview.pause')}>{isPaused ? <Play size={16} /> : <Pause size={16} />}</button>
          {activeCamera?.supportsPtz ? <button type="button" className={controlClass} onClick={() => setIsPtzVisible((value) => !value)} disabled={!canUsePtz} aria-label={isPtzVisible ? t('camera.preview.hidePtz') : t('camera.preview.showPtz')}><SlidersHorizontal size={16} /></button> : null}
          <button type="button" className={controlClass} onClick={refreshVisual} disabled={!activeCamera || activeCamera.isOffline} aria-label={t('camera.viewer.refresh')}><RefreshCw size={16} /></button>
          <button type="button" className={controlClass} onClick={() => void downloadSnapshot()} disabled={!activeCamera || activeCamera.isOffline || isSnapshotBusy} aria-label={t('camera.viewer.saveSnapshot')}><Download size={16} /></button>
          <button type="button" className={controlClass} onClick={() => void toggleNativeFullscreen()} aria-label={t('camera.viewer.nativeFullscreen')}><Expand size={16} /></button>
        </div>

        {feedback ? <div role="status" className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-white/12 bg-black/42 px-4 py-2 text-xs font-semibold text-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur-2xl">{feedback}</div> : null}
      </div>
    </GlassModal>
  );
}

export default CameraViewer;
