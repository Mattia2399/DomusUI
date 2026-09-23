import { describe, expect, it } from 'vitest';
import {
  ALARM_CARD_CAPABILITY,
  CALENDAR_CARD_CAPABILITY,
  CAMERA_CARD_CAPABILITY,
  CLIMATE_CARD_CAPABILITY,
  COVER_CARD_CAPABILITY,
  FAN_CARD_CAPABILITY,
  getCardCapability,
  LIGHT_CARD_CAPABILITY,
  HUMIDIFIER_CARD_CAPABILITY,
  LOCK_CARD_CAPABILITY,
  MEMBERS_CARD_CAPABILITY,
  MEDIA_CARD_CAPABILITY,
  resolveCardLayoutVariant,
  SENSOR_CARD_CAPABILITY,
  SWITCH_CARD_CAPABILITY,
  VACUUM_CARD_CAPABILITY,
} from './cardCapabilityRegistry';

const BREAKPOINTS = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'] as const;

describe('cardCapabilityRegistry', () => {
  it('exposes exactly Mini, Standard and Expanded while keeping pixel densities internal', () => {
    const capabilities = [
      SENSOR_CARD_CAPABILITY,
      LIGHT_CARD_CAPABILITY,
      SWITCH_CARD_CAPABILITY,
      CLIMATE_CARD_CAPABILITY,
      ALARM_CARD_CAPABILITY,
      LOCK_CARD_CAPABILITY,
      COVER_CARD_CAPABILITY,
      MEDIA_CARD_CAPABILITY,
      CAMERA_CARD_CAPABILITY,
      VACUUM_CARD_CAPABILITY,
      MEMBERS_CARD_CAPABILITY,
      CALENDAR_CARD_CAPABILITY,
    ];

    capabilities.forEach((capability) => {
      expect(capability.variants.map((variant) => variant.id)).toEqual([
        'mini',
        'standard',
        'expanded',
      ]);
      expect(resolveCardLayoutVariant(capability, 'full')).toBe('expanded');
    });

    expect(resolveCardLayoutVariant(LIGHT_CARD_CAPABILITY, 'compact')).toBe('standard');
    expect(resolveCardLayoutVariant(CLIMATE_CARD_CAPABILITY, 'compact')).toBe('mini');
  });

  it('registers the migrated cards while leaving the remaining cards on the legacy fallback', () => {
    expect(getCardCapability('sensor')).toBe(SENSOR_CARD_CAPABILITY);
    expect(getCardCapability('light')).toBe(LIGHT_CARD_CAPABILITY);
    expect(getCardCapability('switch')).toBe(SWITCH_CARD_CAPABILITY);
    expect(getCardCapability('climate')).toBe(CLIMATE_CARD_CAPABILITY);
    expect(getCardCapability('alarm')).toBe(ALARM_CARD_CAPABILITY);
    expect(getCardCapability('lock')).toBe(LOCK_CARD_CAPABILITY);
    expect(getCardCapability('cover')).toBe(COVER_CARD_CAPABILITY);
    expect(getCardCapability('camera')).toBe(CAMERA_CARD_CAPABILITY);
    expect(getCardCapability('media')).toBe(MEDIA_CARD_CAPABILITY);
    expect(getCardCapability('vacuum')).toBe(VACUUM_CARD_CAPABILITY);
    expect(getCardCapability('members')).toBe(MEMBERS_CARD_CAPABILITY);
    expect(getCardCapability('calendar')).toBe(CALENDAR_CARD_CAPABILITY);
  });

  it('keeps the Calendar responsive matrix deterministic', () => {
    expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('mini', { breakpoint: 'xs', cols: 2, isInsideStack: false })).toEqual({ w: 1, h: 1 });
    expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('standard', { breakpoint: 'xs', cols: 2, isInsideStack: false })).toEqual({ w: 1, h: 3 });
    expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('expanded', { breakpoint: 'xs', cols: 2, isInsideStack: false })).toEqual({ w: 2, h: 3 });
    expect(CALENDAR_CARD_CAPABILITY.resolveDisplayVariant({ breakpoint: 'xs', layout: { w: 1, h: 3 }, isInsideStack: false })).toBe('standard');
    expect(CALENDAR_CARD_CAPABILITY.resolveDisplayVariant({ breakpoint: 'xs', layout: { w: 2, h: 3 }, isInsideStack: false })).toBe('full');
    expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('mini', { breakpoint: 'sm', cols: 4, isInsideStack: false })).toEqual({ w: 1, h: 1 });
    expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('standard', { breakpoint: 'sm', cols: 4, isInsideStack: false })).toEqual({ w: 2, h: 3 });
    expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('expanded', { breakpoint: 'sm', cols: 4, isInsideStack: false })).toEqual({ w: 4, h: 4 });
    expect(CALENDAR_CARD_CAPABILITY.resolveDisplayVariant({ breakpoint: 'sm', layout: { w: 2, h: 3 }, isInsideStack: false })).toBe('standard');
    expect(CALENDAR_CARD_CAPABILITY.resolveDisplayVariant({ breakpoint: 'sm', layout: { w: 4, h: 4 }, isInsideStack: false })).toBe('full');
    (['md', 'lg', 'xl', '2xl'] as const).forEach((breakpoint) => {
      expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('mini', { breakpoint, cols: 12, isInsideStack: false })).toEqual({ w: 1, h: 1 });
      expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('standard', { breakpoint, cols: 12, isInsideStack: false })).toEqual({ w: 2, h: 3 });
      expect(CALENDAR_CARD_CAPABILITY.resolveVariantTarget('expanded', { breakpoint, cols: 12, isInsideStack: false })).toEqual({ w: 4, h: 4 });
      expect(CALENDAR_CARD_CAPABILITY.resolveDisplayVariant({ breakpoint, layout: { w: 2, h: 3 }, isInsideStack: false })).toBe('standard');
      expect(CALENDAR_CARD_CAPABILITY.resolveDisplayVariant({ breakpoint, layout: { w: 4, h: 4 }, isInsideStack: false })).toBe('full');
    });
  });

  it('falls back safely when a shared layout contains a widget kind from a newer build', () => {
    const capability = getCardCapability('future-widget' as never);

    expect(capability).toBe(SENSOR_CARD_CAPABILITY);
    expect(
      capability.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 2, h: 2 },
        isInsideStack: false,
      }),
    ).toBe('standard');
  });

  it('keeps the existing default Sensor spans for every breakpoint', () => {
    expect(SENSOR_CARD_CAPABILITY.defaultSpans).toEqual({
      '2xl': { w: 2, h: 3 },
      xl: { w: 2, h: 3 },
      lg: { w: 2, h: 2 },
      md: { w: 2, h: 3 },
      sm: { w: 1, h: 2 },
      xs: { w: 1, h: 1 },
    });
  });

  it('keeps Light auto expansion enabled and breakpoint-aware', () => {
    BREAKPOINTS.forEach((breakpoint) => {
      const span = LIGHT_CARD_CAPABILITY.defaultSpans[breakpoint];
      expect(span.hOn).toBe(2);
      expect(span.hOff).toBe(1);
      expect(span.w).toBe(breakpoint === 'sm' || breakpoint === 'xs' ? 1 : 2);
    });
  });

  it('reports the new Light full threshold to the Builder without choosing the card DOM', () => {
    expect(LIGHT_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: 319, height: 104 })).toBe('standard');
    expect(LIGHT_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: 320, height: 104 })).toBe('full');
    expect(LIGHT_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: 176, height: 160 })).toBe('full');
  });

  it('keeps Fan and Humidifier Standard at one column and two rows on xs in both sizing engines', () => {
    for (const capability of [FAN_CARD_CAPABILITY, HUMIDIFIER_CARD_CAPABILITY]) {
      expect(capability.defaultSpans.xs).toEqual({ w: 1, h: 2 });
      expect(capability.resolveVariantTarget('standard', {
        cols: 2,
        breakpoint: 'xs',
        isInsideStack: false,
      })).toEqual({ w: 1, h: 2 });
      expect(capability.resolveDisplayVariant({
        breakpoint: 'xs',
        layout: { w: 1, h: 2 },
        isInsideStack: false,
      })).toBe('standard');
      expect(capability.resolvePixelDisplayVariant({ width: 142, height: 112 })).toBe('standard');
    }
  });

  it('resolves Sensor targets without offering a root-only full width inside a stack', () => {
    expect(
      SENSOR_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 2 });
    expect(
      SENSOR_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 3 });
  });

  it('resolves Light targets without offering a root-only full width inside a stack', () => {
    expect(
      LIGHT_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 2 });
    expect(
      LIGHT_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 3 });
  });

  it('keeps the established grid variants for Sensor and Light', () => {
    expect(
      SENSOR_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 2, h: 3 },
        isInsideStack: false,
      }),
    ).toBe('full');
    expect(
      SENSOR_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xs',
        layout: { w: 2, h: 3 },
        isInsideStack: false,
      }),
    ).toBe('standard');
    expect(
      LIGHT_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 2, h: 1 },
        isInsideStack: false,
      }),
    ).toBe('mini');
    expect(
      LIGHT_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 3, h: 2 },
        isInsideStack: false,
      }),
    ).toBe('full');
  });

  it('keeps Switch aligned with Light without enabling auto expansion', () => {
    expect(SWITCH_CARD_CAPABILITY.supportsAutoExpand).toBe(false);
    expect(SWITCH_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 1 });
    expect(
      SWITCH_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 3 });
    expect(
      SWITCH_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 2, h: 2 },
        isInsideStack: false,
      }),
    ).toBe('standard');
  });

  it('keeps Climate wide enough for its controls on desktop and mobile', () => {
    expect(CLIMATE_CARD_CAPABILITY.variants.map((variant) => variant.id)).toEqual([
      'mini',
      'standard',
      'expanded',
    ]);
    expect(CLIMATE_CARD_CAPABILITY.defaultSpans.xl).toEqual({ w: 3, h: 3 });
    expect(CLIMATE_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 3 });
    expect(
      CLIMATE_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 4 });
    expect(
      CLIMATE_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 2,
        breakpoint: 'xs',
        isInsideStack: false,
      }),
    ).toEqual({ w: 2, h: 4 });
  });

  it('keeps Alarm aligned with the safe Climate compositions', () => {
    expect(ALARM_CARD_CAPABILITY.variants.map((variant) => variant.id)).toEqual([
      'mini',
      'standard',
      'expanded',
    ]);
    expect(ALARM_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 3 });
    expect(
      ALARM_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 3, h: 3 },
        isInsideStack: false,
      }),
    ).toBe('standard');
  });

  it('preserves the narrow Lock composition and root-only expanded target', () => {
    expect(LOCK_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 1, h: 1 });
    expect(
      LOCK_CARD_CAPABILITY.resolveVariantTarget('mini', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 1, h: 2 });
    expect(
      LOCK_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 2 });
    expect(
      LOCK_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 4 });
  });

  it('preserves Cover targets across desktop, mobile and stacks', () => {
    expect(
      COVER_CARD_CAPABILITY.resolveVariantTarget('mini', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 2, h: 1 });
    expect(
      COVER_CARD_CAPABILITY.resolveVariantTarget('standard', {
        cols: 2,
        breakpoint: 'xs',
        isInsideStack: false,
      }),
    ).toEqual({ w: 1, h: 2 });
    expect(
      COVER_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 4 });
  });

  it('keeps Media controls wider on XS than on SM', () => {
    expect(MEDIA_CARD_CAPABILITY.defaultSpans.sm).toEqual({ w: 1, h: 3 });
    expect(MEDIA_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 3 });
    expect(
      MEDIA_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 4 });
    expect(
      MEDIA_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 2,
        breakpoint: 'xs',
        isInsideStack: false,
      }),
    ).toEqual({ w: 2, h: 4 });
  });

  it('keeps the large Camera preview root-only', () => {
    expect(
      CAMERA_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 4, h: 4 });
    expect(
      CAMERA_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 3, h: 4 });
    expect(
      CAMERA_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 5, h: 3 },
        isInsideStack: false,
      }),
    ).toBe('full');
  });

  it('preserves Vacuum compact targets and expanded map space', () => {
    expect(
      VACUUM_CARD_CAPABILITY.resolveVariantTarget('standard', {
        cols: 2,
        breakpoint: 'xs',
        isInsideStack: false,
      }),
    ).toEqual({ w: 2, h: 3 });
    expect(
      VACUUM_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 4 });
    expect(
      VACUUM_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 6,
        breakpoint: 'xl',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 5 });
  });

  it('registers Members with the former generic variant behavior', () => {
    expect(MEMBERS_CARD_CAPABILITY.defaultSpans.xl).toEqual({ w: 3, h: 2 });
    expect(MEMBERS_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 2 });
    expect(
      MEMBERS_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xl',
        layout: { w: 3, h: 2 },
        isInsideStack: false,
      }),
    ).toBe('full');
    expect(
      MEMBERS_CARD_CAPABILITY.resolveDisplayVariant({
        breakpoint: 'xs',
        layout: { w: 2, h: 2 },
        isInsideStack: false,
      }),
    ).toBe('standard');
  });
});
