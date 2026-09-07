import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import './HaCameraCard.css';
import { useI18n } from '../../i18n/I18nProvider';

export interface HaCameraCardProps {
  entityId?: string;
  name: string;
  attributes?: Record<string, unknown>;
  onLongPress?: (entityId: string) => void;
  compact?: boolean;
  isLive?: boolean;
}

function resolveStringAttribute(attributes: Record<string, unknown> | undefined, key: string) {
  const value = attributes?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

export function HaCameraCard({
  entityId,
  name,
  attributes = {},
  onLongPress,
  compact = false,
  isLive = true,
}: HaCameraCardProps) {
  const { t } = useI18n();
  const longPressTimerRef = useRef<number | null>(null);
  const [streamFailed, setStreamFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [lastFrameImage, setLastFrameImage] = useState('');
  const [isVisualLoading, setIsVisualLoading] = useState(false);
  const supportsLongPress = Boolean(onLongPress && entityId);

  const cameraEntityId = useMemo(() => {
    const attributeEntity =
      resolveStringAttribute(attributes, 'camera_entity_id') ||
      resolveStringAttribute(attributes, 'entity_id');
    return attributeEntity || entityId || '';
  }, [attributes, entityId]);

  const streamUrl = cameraEntityId
    ? `/api/camera_proxy_stream/${encodeURIComponent(cameraEntityId)}`
    : '';
  const fallbackImage =
    resolveStringAttribute(attributes, 'entity_picture') ||
    resolveStringAttribute(attributes, 'cameraUrl');
  const activeStreamUrl = streamFailed || !isLive ? '' : streamUrl;
  const currentFallbackImage = fallbackFailed ? '' : fallbackImage;
  const offlineFrameImage = currentFallbackImage || lastFrameImage;
  const visualUrl = activeStreamUrl || offlineFrameImage;
  const hasVisual = visualUrl.length > 0;
  const isShowingFallback = !activeStreamUrl && visualUrl.length > 0 && visualUrl === currentFallbackImage;
  const isShowingLastFrame = !activeStreamUrl && visualUrl.length > 0 && visualUrl === lastFrameImage && !isShowingFallback;
  const showLoadingOverlay = hasVisual && isVisualLoading;
  const statusClass = showLoadingOverlay
    ? 'ha-camera-card__status--loading'
    : isLive
      ? ''
      : 'ha-camera-card__status--offline';
  const dotStateClass = showLoadingOverlay
    ? 'ha-camera-card__live-dot--loading'
    : isLive
      ? ''
      : 'ha-camera-card__live-dot--offline';
  const statusLabel = showLoadingOverlay ? t('camera.events.loading') : isLive ? t('camera.online') : t('camera.disconnected');

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (!supportsLongPress) {
      return;
    }
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      onLongPress?.(entityId!);
    }, 500);
  };

  const stopLongPress = () => {
    clearLongPressTimer();
  };

  useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [],
  );

  useEffect(() => {
    setStreamFailed(false);
    setFallbackFailed(false);
  }, [cameraEntityId, streamUrl, fallbackImage, isLive]);

  useEffect(() => {
    setLastFrameImage('');
  }, [cameraEntityId]);

  useEffect(() => {
    setIsVisualLoading(hasVisual);
  }, [hasVisual, visualUrl]);

  return (
    <div className={`ha-camera-card ${compact ? 'ha-camera-card--compact' : ''}`}>
      <div
        className="ha-camera-card__surface"
        onPointerDown={startLongPress}
        onPointerUp={stopLongPress}
        onPointerLeave={stopLongPress}
        onPointerCancel={stopLongPress}
      >
        <div className="ha-camera-card__glow" aria-hidden="true" />
        {hasVisual ? (
          <img
            src={visualUrl}
            alt={name || 'Camera stream'}
            className="ha-camera-card__stream"
            onLoad={() => {
              setIsVisualLoading(false);
              if (isShowingFallback && currentFallbackImage) {
                setLastFrameImage(currentFallbackImage);
              }
            }}
            onError={() => {
              if (activeStreamUrl) {
                setStreamFailed(true);
                return;
              }
              if (isShowingFallback) {
                setFallbackFailed(true);
                return;
              }
              if (isShowingLastFrame) {
                setLastFrameImage('');
              }
              setIsVisualLoading(false);
            }}
          />
        ) : (
          <div className="ha-camera-card__placeholder">
            <Camera className="ha-camera-card__placeholder-icon" />
            <div className="ha-camera-card__placeholder-text">{t('camera.imageUnavailable')}</div>
          </div>
        )}

        {showLoadingOverlay ? (
          <div className="ha-camera-card__loading" aria-hidden="true">
            <span className="ha-camera-card__loading-spinner" />
          </div>
        ) : null}

        <div className="ha-camera-card__scrim" aria-hidden="true" />

        <div className="ha-camera-card__footer">
          <div className="ha-camera-card__name">{name || cameraEntityId || t('camera.fallback')}</div>
          <div className={`ha-camera-card__status ${statusClass}`} aria-label={t('card.cameraStatus', { status: statusLabel })}>
            <span className={`ha-camera-card__live-dot ${dotStateClass}`} aria-hidden="true" />
            <span className="ha-camera-card__status-label">{statusLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HaCameraCard;
