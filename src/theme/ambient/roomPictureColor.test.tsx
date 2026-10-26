import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbientProvider } from './AmbientProvider';
import { extractPictureColor, useRoomPictureColor } from './roomPictureColor';

function Probe({ areaId, picture }: { areaId: string; picture: string }) {
  const color = useRoomPictureColor(areaId, picture);
  return <span data-testid="color">{color ?? 'none'}</span>;
}

/** An image element that fails to load, as a foreign picture without CORS would. */
class FailingImage {
  crossOrigin = '';
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('the colour of a room picture', () => {
  it('is null, silently, when the picture cannot be read', async () => {
    vi.stubGlobal('Image', FailingImage);
    await expect(extractPictureColor('https://elsewhere.example/room.jpg')).resolves.toBeNull();
  });

  it('is remembered per area and picture, and read back without loading the image again', async () => {
    window.localStorage.setItem('domusui.ambient.room.v1:kitchen:https://ha.local/api/image/serve/k/512x512', '#12A4F0');
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    render(
      <AmbientProvider enabled resolveAssetUrl={(value) => `https://ha.local${value}`}>
        <Probe areaId="kitchen" picture="/api/image/serve/k/512x512" />
      </AmbientProvider>,
    );
    expect(screen.getByTestId('color').textContent).toBe('#12A4F0');
    expect(image).not.toHaveBeenCalled();
  });

  it('remembers a picture that gave nothing, so it is not read again', async () => {
    vi.stubGlobal('Image', FailingImage);
    render(<Probe areaId="garage" picture="https://elsewhere.example/garage.jpg" />);
    await waitFor(() =>
      expect(window.localStorage.getItem('domusui.ambient.room.v1:garage:https://elsewhere.example/garage.jpg')).toBe('none'),
    );
    expect(screen.getByTestId('color').textContent).toBe('none');
  });
});
