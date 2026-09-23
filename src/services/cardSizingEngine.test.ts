import { describe, expect, it } from 'vitest';
import {
  CARD_SIZING_ENGINE_STORAGE_KEY,
  readStoredCardSizingEngine,
  supportsAdaptiveSizing,
  writeStoredCardSizingEngine,
} from './cardSizingEngine';

describe('cardSizingEngine preferences', () => {
  it('defaults to Adaptive when no storage is available', () => {
    expect(readStoredCardSizingEngine()).toBe('adaptive');
  });

  it('reads saved Legacy and Adaptive values', () => {
    const storage = new MapStorage();

    storage.setItem(CARD_SIZING_ENGINE_STORAGE_KEY, 'legacy');
    expect(readStoredCardSizingEngine(storage)).toBe('legacy');

    storage.setItem(CARD_SIZING_ENGINE_STORAGE_KEY, 'adaptive');
    expect(readStoredCardSizingEngine(storage)).toBe('adaptive');
  });

  it('falls back to Adaptive for invalid stored values', () => {
    const storage = new MapStorage();

    storage.setItem(CARD_SIZING_ENGINE_STORAGE_KEY, 'broken');

    expect(readStoredCardSizingEngine(storage)).toBe('adaptive');
  });

  it('persists toggle changes locally', () => {
    const storage = new MapStorage();

    writeStoredCardSizingEngine('legacy', storage);
    expect(storage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY)).toBe('legacy');

    writeStoredCardSizingEngine('adaptive', storage);
    expect(storage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY)).toBe('adaptive');
  });

  it('supports Adaptive sizing for the validated interactive device cards', () => {
    expect(supportsAdaptiveSizing('light')).toBe(true);
    expect(supportsAdaptiveSizing('cover')).toBe(true);
    expect(supportsAdaptiveSizing('fan')).toBe(true);
    expect(supportsAdaptiveSizing('humidifier')).toBe(true);
    expect(supportsAdaptiveSizing('switch')).toBe(false);
  });
});

class MapStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}
