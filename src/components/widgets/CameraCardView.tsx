import { useEffect, useState } from 'react';
import { Camera, Radio } from 'lucide-react';
import type { CameraCardModel } from './cameraCardModel';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import './CameraCard.css';
import { useI18n } from '../../i18n/I18nProvider';

type CameraCardViewProps = {
  model: CameraCardModel;
  layoutVariant: WidgetDisplayVariant;
  isSelected: boolean;
  isEditMode: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
  onOpen?: () => void;
  preferStream?: boolean;
  snapshotRefreshIntervalMs?: number;
  imageLoading?: 'eager' | 'lazy';
};

function appendSnapshotRefreshKey(url: string | undefined, refreshKey: number) {
  if (!url || refreshKey === 0 || /^(?:data|blob):/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}dashboard_refresh=${refreshKey}`;
}

export function CameraCardView({
  model,
  layoutVariant,
  isSelected,
  isEditMode,
  rootRef,
  onOpen,
  preferStream = true,
  snapshotRefreshIntervalMs = 0,
  imageLoading = 'eager',
}: CameraCardViewProps) {
  const { t } = useI18n();
  const [streamFailed, setStreamFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [snapshotRefreshKey, setSnapshotRefreshKey] = useState(0);
  const streamUrl =
    preferStream && model.isAvailable && model.state !== 'off' && model.supportsStream && !streamFailed
      ? model.streamUrl
      : undefined;
  const fallbackUrl = !imageFailed
    ? appendSnapshotRefreshKey(model.imageUrl, snapshotRefreshKey)
    : undefined;
  const visualUrl = streamUrl ?? fallbackUrl;
  const hasVisual = Boolean(visualUrl);
  const hasDetails = model.isMotionEnabled || Boolean(model.brand || model.model);

  useEffect(() => {
    setStreamFailed(false);
    setImageFailed(false);
    setSnapshotRefreshKey(0);
  }, [model.entityId, model.imageUrl, model.streamUrl, model.isAvailable, preferStream]);

  useEffect(() => {
    setIsLoading(Boolean(visualUrl));
    // Refreshing a snapshot must not flash the loading veil every few seconds.
    // It is only shown when the camera or its visual source actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.entityId, model.imageUrl, streamUrl]);

  useEffect(() => {
    if (
      streamUrl ||
      !model.imageUrl ||
      snapshotRefreshIntervalMs <= 0 ||
      typeof window === 'undefined'
    ) {
      return undefined;
    }

    const refreshSnapshot = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setImageFailed(false);
      setSnapshotRefreshKey(Date.now());
    };
    const intervalId = window.setInterval(refreshSnapshot, snapshotRefreshIntervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSnapshot();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [model.imageUrl, snapshotRefreshIntervalMs, streamUrl]);

  return (
    <div
      ref={rootRef}
      className={`camera-card ${isSelected ? 'selection-corners' : ''}`}
      data-camera-tone={model.tone}
      data-camera-variant={layoutVariant}
    >
      <div className="liquid-glass-card camera-card__surface">
        <div className="camera-card__visual" aria-hidden="true">
          {hasVisual ? (
            <img
              src={visualUrl}
              alt=""
              loading={imageLoading}
              className="camera-card__image"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                if (streamUrl) {
                  setStreamFailed(true);
                  return;
                }
                setImageFailed(true);
                setIsLoading(false);
              }}
            />
          ) : (
            <div className="camera-card__placeholder">
              <Camera className="camera-card__placeholder-icon" />
              <span>{t('camera.imageUnavailable')}</span>
            </div>
          )}
          <div className="camera-card__scrim" />
        </div>

        {isLoading ? (
          <span className="camera-card__loading" aria-hidden="true">
            <span />
          </span>
        ) : null}

        <div className="camera-card__topbar">
          <span className="camera-card__status-chip" aria-label={model.statusLabel}>
            <span className="camera-card__live-dot" aria-hidden="true" />
            <span>{model.statusLabel}</span>
          </span>
        </div>

        <div className="camera-card__meta">
          <p className="camera-card__title" title={model.title}>{model.title}</p>
          <p className="camera-card__subtitle">{model.subtitle}</p>
        </div>

        {hasDetails ? (
          <div className="camera-card__details" aria-label={t('camera.details')}>
            {model.isMotionEnabled ? (
              <span className="camera-card__detail">
                <Radio />
                <span>{t('camera.motion')}</span>
              </span>
            ) : null}
            {model.brand || model.model ? (
              <span className="camera-card__detail camera-card__detail--device">
                <span>{model.model ?? model.brand}</span>
              </span>
            ) : null}
          </div>
        ) : null}

        {onOpen ? (
          <div
            role="button"
            tabIndex={0}
            className={`camera-card__open-layer widget-card-handle ${isEditMode ? 'cursor-grab' : 'cursor-pointer'}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onOpen();
              }
            }}
            aria-label={t('camera.open', { name: model.title })}
          />
        ) : null}
      </div>
    </div>
  );
}
