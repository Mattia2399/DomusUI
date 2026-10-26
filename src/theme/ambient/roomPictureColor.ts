import { useEffect, useState } from 'react';
import { dominantGlowColor } from './ambientModel';
import { useAmbientAssetUrl } from './AmbientProvider';

const STORAGE_PREFIX = 'domusui.ambient.room.v1:';
// A colour per area and picture, computed once: "none" remembers a picture that gave nothing.
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function cacheKey(areaId: string, url: string) {
  return `${STORAGE_PREFIX}${areaId}:${url}`;
}

function readCache(key: string): string | null | undefined {
  if (memory.has(key)) return memory.get(key) === 'none' ? null : memory.get(key);
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      memory.set(key, stored);
      return stored === 'none' ? null : stored;
    }
  } catch {
    // Storage blocked: compute again, keep it in memory only.
  }
  return undefined;
}

function writeCache(key: string, color: string | null) {
  const value = color ?? 'none';
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full: the memory copy is enough for this session.
  }
}

/**
 * The glow colour of an image, from a 32×32 copy drawn on a canvas off screen.
 * Null, silently, when the image does not load or the canvas is tainted (CORS).
 */
export function extractPictureColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, 32, 32);
        resolve(dominantGlowColor(context.getImageData(0, 0, 32, 32).data));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** The colour of a room's picture, or null while it is being read, when there is none, or when it cannot be read. */
export function useRoomPictureColor(areaId: string | null | undefined, picture: string | null | undefined) {
  const resolveAssetUrl = useAmbientAssetUrl();
  const url = areaId && picture ? resolveAssetUrl(picture) : undefined;
  const key = areaId && url ? cacheKey(areaId, url) : null;
  const [color, setColor] = useState<string | null>(() => (key ? readCache(key) ?? null : null));

  useEffect(() => {
    if (!key || !url) {
      setColor(null);
      return undefined;
    }
    const cached = readCache(key);
    if (cached !== undefined) {
      setColor(cached);
      return undefined;
    }
    setColor(null);
    let active = true;
    const job = pending.get(key) ?? extractPictureColor(url);
    pending.set(key, job);
    void job.then((extracted) => {
      pending.delete(key);
      writeCache(key, extracted);
      if (active) setColor(extracted);
    });
    return () => {
      active = false;
    };
  }, [key, url]);

  return color;
}
