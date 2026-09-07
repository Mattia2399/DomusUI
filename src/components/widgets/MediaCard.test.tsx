import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { MEDIA_FEATURE_PAUSE, MEDIA_FEATURE_PLAY, MEDIA_FEATURE_TURN_ON } from './mediaCardModel';
import { MediaCard } from './MediaCard';

const widget: Widget = {
  id: 'media-card-test',
  kind: 'media',
  title: 'Living Room TV',
  entityId: 'media_player.living_room_tv',
  status: 'idle',
  isOn: true,
  value: 0,
  layout: { i: 'media-card-test', x: 0, y: 0, w: 2, h: 3 },
};

describe('MediaCard', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps on state idle-like and disables controls not exposed by supported_features', () => {
    const { getByLabelText, container } = render(
      <MediaCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onTogglePlayback={() => undefined}
        onPreviousTrack={() => undefined}
        onNextTrack={() => undefined}
        onSeek={() => undefined}
        onShuffle={() => undefined}
        onRepeat={() => undefined}
        displayVariant="standard"
        liveEntity={{
          state: 'on',
          supportedFeatures: MEDIA_FEATURE_PLAY | MEDIA_FEATURE_PAUSE,
          rawAttributes: {
            app_name: 'YouTube',
            media_title: 'Home screen',
            media_artist: 'Dashboard Artist',
            media_content_type: 'app',
          },
        }}
      />,
    );

    expect(container.querySelector('[data-media-variant="standard"]')).not.toBeNull();
    expect(container.querySelector('.ha-media-card__name')?.textContent).toContain('Home screen');
    expect(container.querySelector('.ha-media-card__status')?.textContent).toContain('Dashboard Artist \u2022 Living Room TV');
    expect(container.querySelector('.ha-media-card__track')).toBeNull();
    expect((getByLabelText('Riproduci') as HTMLButtonElement).disabled).toBe(false);
    expect((getByLabelText('Traccia precedente') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Traccia successiva') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Riproduzione casuale') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Ripeti: disattivato') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps transport controls visible for powered-off players with turn-on support', () => {
    const { getByLabelText, container } = render(
      <MediaCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onTogglePlayback={() => undefined}
        onPreviousTrack={() => undefined}
        onNextTrack={() => undefined}
        onSeek={() => undefined}
        onShuffle={() => undefined}
        onRepeat={() => undefined}
        displayVariant="standard"
        liveEntity={{
          state: 'off',
          supportedFeatures: MEDIA_FEATURE_TURN_ON,
          rawAttributes: {
            friendly_name: 'TV soggiorno',
            device_class: 'tv',
          },
        }}
      />,
    );

    expect(container.querySelector('.ha-media-card__transport')).not.toBeNull();
    expect((getByLabelText('Riproduci') as HTMLButtonElement).disabled).toBe(false);
    expect((getByLabelText('Traccia precedente') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Traccia successiva') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Riproduzione casuale') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Ripeti: disattivato') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps title and subtitle visible in the mini media layout', () => {
    const { container } = render(
      <MediaCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onTogglePlayback={() => undefined}
        displayVariant="mini"
        liveEntity={{
          state: 'playing',
          supportedFeatures: MEDIA_FEATURE_PLAY | MEDIA_FEATURE_PAUSE,
          rawAttributes: {
            media_title: 'Titolo brano molto lungo per mini card',
            media_artist: 'Artista lungo',
          },
        }}
      />,
    );

    expect(container.querySelector('[data-media-variant="mini"]')).not.toBeNull();
    expect(container.querySelector('.ha-media-card__name')?.textContent).toContain('Titolo brano molto lungo per mini card');
    expect(container.querySelector('.ha-media-card__status')?.textContent).toContain('Artista lungo \u2022 Living Room TV');
    expect(container.querySelector('.ha-media-card__status-marquee')).not.toBeNull();
  });

  it('reports the variant derived from its measured border box', async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const onDisplayMetricsChange = vi.fn();
    const { container } = render(
      <MediaCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        displayVariant="mini"
        onDisplayMetricsChange={onDisplayMetricsChange}
      />,
    );

    act(() => {
      const callback = resizeCallback as ResizeObserverCallback | null;
      if (!callback) throw new Error('ResizeObserver callback not registered');
      callback([{
        borderBoxSize: [{ inlineSize: 232, blockSize: 156 }],
        contentRect: { width: 232, height: 156 },
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });

    await waitFor(() => expect(container.querySelector('[data-media-variant="standard"]')).not.toBeNull());
    await waitFor(() => expect(onDisplayMetricsChange).toHaveBeenLastCalledWith({
      widgetId: widget.id,
      width: 232,
      height: 156,
      variant: 'standard',
    }));
  });
});
