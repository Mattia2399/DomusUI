import { describe, expect, it } from 'vitest';
import { translateClimateStatus } from './climateControlLabels';

describe('translateClimateStatus', () => {
  it('normalizes Home Assistant climate states without UI dependencies', () => {
    expect(translateClimateStatus('heat', 'Fallback')).toBe('Riscaldamento');
    expect(translateClimateStatus('fan only', 'Fallback')).toBe('Ventilazione');
    expect(translateClimateStatus(undefined, 'Fallback')).toBe('Fallback');
    expect(translateClimateStatus('Custom state', 'Fallback')).toBe('Custom state');
  });
});
