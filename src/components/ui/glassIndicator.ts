import type { GlassControlSize } from './glassControl';
import './glassIndicators.css';

/** The colour follows the meaning, not the device. */
export type GlassMeaning = 'ok' | 'warn' | 'bad' | 'info' | 'off';

export type GlassIndicatorProps = {
  size?: GlassControlSize;
  className?: string;
};

export const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
