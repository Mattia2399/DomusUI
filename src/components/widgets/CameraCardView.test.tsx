import { act, cleanup, render as renderUi } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraCardView } from './CameraCardView';
import type { CameraCardModel } from './cameraCardModel';
import { I18nProvider } from '../../i18n/I18nProvider';

const render = (ui: React.ReactElement) => renderUi(<I18nProvider>{ui}</I18nProvider>);

const cameraModel: CameraCardModel = {
  title: 'Ingresso',
  entityId: 'camera.ingresso',
  state: 'idle',
  statusLabel: 'Idle',
  subtitle: 'Snapshot disponibile',
  tone: 'idle',
  isAvailable: true,
  isLive: false,
  isRecording: false,
  isStreaming: false,
  isMotionEnabled: false,
  supportsStream: true,
  supportsOnOff: false,
  imageUrl: '/api/camera_proxy/camera.ingresso',
  streamUrl: '/api/camera_proxy_stream/camera.ingresso',
};

describe('CameraCardView snapshot previews', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses the shared card with a bounded snapshot refresh when streaming is disabled', () => {
    const { container, queryByRole } = render(
      <CameraCardView
        model={cameraModel}
        layoutVariant="compact"
        isSelected={false}
        isEditMode={false}
        preferStream={false}
        snapshotRefreshIntervalMs={10_000}
      />,
    );

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/api/camera_proxy/camera.ingresso');
    expect(queryByRole('button')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(image?.getAttribute('src')).toContain('/api/camera_proxy/camera.ingresso?dashboard_refresh=');
    expect(image?.getAttribute('src')).not.toContain('camera_proxy_stream');
  });
});
