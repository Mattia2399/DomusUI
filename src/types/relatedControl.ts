/*
 * A control of a card that shows or commands another entity of Home Assistant.
 * It takes the same place, look and order of the controls of the device: they are one list.
 */

export type RelatedPlace = 'main' | 'more' | 'hidden';

/** How the slider sends its value: while it moves, or when it is let go. */
export type RelatedCommitOptions = { commit: 'live' | 'release' };
/** Where a page button goes: only inside the app. */
export type RelatedPageOptions = { path: string };

export type RelatedSliderLook = 'bar' | 'bar-value';
export type RelatedPlainLook =
  // Choosing
  | 'segmented' | 'menu' | 'list' | 'radio' | 'arrows' | 'tiles'
  // Numbers
  | 'stepper' | 'number-input' | 'levels' | 'ring-slider' | 'keypad'
  // Yes or no
  | 'toggle-row' | 'icon-toggle' | 'toggle-card' | 'led-row'
  // Actions
  | 'push' | 'momentary' | 'hold' | 'running' | 'result' | 'pill'
  // Readings
  | 'value' | 'value-pill' | 'badge' | 'led' | 'glow' | 'gauge' | 'radial' | 'mini-ring' | 'progress'
  | 'progress-vertical' | 'battery' | 'temperature' | 'humidity' | 'level' | 'connection' | 'trend' | 'icon-status'
  // Charts
  | 'sparkline' | 'chart-line' | 'chart-area' | 'chart-bar' | 'chart-stats'
  // Text and dates
  | 'text' | 'textarea' | 'date' | 'time' | 'datetime' | 'password'
  // Time left
  | 'countdown';
export type RelatedLook = RelatedSliderLook | RelatedPlainLook | 'page';

type RelatedBase = {
  id: string;
  entityId: string;
  /** Without one, the name of the entity. */
  name?: string;
  icon?: string;
  place: RelatedPlace;
  order: number;
};

export type RelatedControl = RelatedBase &
  (
    | { look: RelatedSliderLook; options?: RelatedCommitOptions }
    | { look: 'page'; options: RelatedPageOptions }
    | { look: RelatedPlainLook; options?: never }
  );
