import type { WidgetKind } from '../types/dashboardModels';

export type CardSizingEngine = 'legacy' | 'adaptive';

export const DEFAULT_CARD_SIZING_ENGINE: CardSizingEngine = 'adaptive';
export const CARD_SIZING_ENGINE_STORAGE_KEY = 'ha.dashboard.cardSizingEngine';

export function normalizeCardSizingEngine(value: unknown): CardSizingEngine {
  return value === 'legacy' || value === 'adaptive'
    ? value
    : DEFAULT_CARD_SIZING_ENGINE;
}

export function readStoredCardSizingEngine(storage?: Storage): CardSizingEngine {
  if (!storage) {
    return DEFAULT_CARD_SIZING_ENGINE;
  }
  return normalizeCardSizingEngine(storage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY));
}

export function writeStoredCardSizingEngine(
  engine: CardSizingEngine,
  storage?: Storage,
) {
  if (!storage) {
    return;
  }
  storage.setItem(CARD_SIZING_ENGINE_STORAGE_KEY, normalizeCardSizingEngine(engine));
}

export function supportsAdaptiveSizing(kind: WidgetKind) {
  return kind === 'light' || kind === 'cover' || kind === 'fan' || kind === 'humidifier';
}
