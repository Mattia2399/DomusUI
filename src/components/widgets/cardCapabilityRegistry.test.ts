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
  GRID_V2_WIDTH_CLASS_COLS,
  gridV2FormatSpan,
  resolveGridV2DefaultFormat,
  resolveGridV2EntityCapability,
  resolveGridV2PresetFormat,
  resolveGridV2SupportedFormats,
  resolveNearestGridV2Format,
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

  it('targets the Lock sizes of the real grid on phone, tablet and desktop', () => {
    const target = (variant: 'mini' | 'standard' | 'expanded', breakpoint: 'xl' | 'md' | 'xs', cols: number, isInsideStack = false) =>
      LOCK_CARD_CAPABILITY.resolveVariantTarget(variant, { cols, breakpoint, isInsideStack });

    expect(LOCK_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 1, h: 3 });
    expect(LOCK_CARD_CAPABILITY.defaultSpans.xl).toEqual({ w: 3, h: 3 });
    expect(target('mini', 'xs', 2)).toEqual({ w: 1, h: 2 });
    expect(target('standard', 'xs', 2)).toEqual({ w: 1, h: 3 });
    expect(target('expanded', 'xs', 2)).toEqual({ w: 2, h: 3 });
    expect(target('mini', 'xl', 12)).toEqual({ w: 1, h: 3 });
    expect(target('standard', 'xl', 12)).toEqual({ w: 3, h: 3 });
    expect(target('expanded', 'xl', 12)).toEqual({ w: 4, h: 4 });
    expect(target('expanded', 'md', 6)).toEqual({ w: 4, h: 4 });
    expect(target('expanded', 'xl', 4, true)).toEqual({ w: 2, h: 7 });
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

  it('defines the single responsive U/W/X matrix for all six breakpoints', () => {
    expect(GRID_V2_WIDTH_CLASS_COLS).toEqual({
      '2xl': { cols: 12, U: 2, W: 4, X: 8 },
      xl: { cols: 12, U: 2, W: 4, X: 8 },
      lg: { cols: 8, U: 2, W: 4, X: 8 },
      md: { cols: 6, U: 2, W: 4, X: 6 },
      sm: { cols: 4, U: 1, W: 2, X: 4 },
      xs: { cols: 2, U: 1, W: 2, X: 2 },
    });
    expect(gridV2FormatSpan('X×4', 'md')).toEqual({ w: 6, h: 4 });
    expect(gridV2FormatSpan('W×6', 'xs')).toEqual({ w: 2, h: 6 });
  });

  it('exposes the format matrix from the v2 contract, including entity capabilities', () => {
    expect(resolveGridV2SupportedFormats('light', 'light-color'))
      .toEqual(['U×2', 'U×3', 'U×4', 'W×2', 'W×3', 'W×4', 'W×6', 'X×4']);
    expect(resolveGridV2SupportedFormats('light', 'light-dimmer'))
      .toEqual(['U×2', 'U×3', 'W×2', 'W×3']);
    expect(resolveGridV2SupportedFormats('light', 'light-on-off')).toEqual(['U×2', 'W×2']);
    expect(resolveGridV2SupportedFormats('switch')).toEqual(['U×2', 'W×2']);
    expect(resolveGridV2SupportedFormats('cover', 'cover-position'))
      .toEqual(['U×2', 'U×3', 'W×2', 'W×3']);
    expect(resolveGridV2SupportedFormats('cover', 'cover-binary')).toEqual(['U×2', 'W×2']);
    expect(resolveGridV2SupportedFormats('sensor', 'sensor-numeric'))
      .toEqual(['U×2', 'U×3', 'U×4', 'W×2', 'W×3']);
    expect(resolveGridV2SupportedFormats('sensor', 'sensor-binary')).toEqual(['U×2', 'W×2']);
    expect(resolveGridV2SupportedFormats('media')).toEqual(['U×2', 'W×3', 'W×4', 'X×4']);
    expect(resolveGridV2DefaultFormat('climate')).toBe('W×4');
    expect(resolveGridV2DefaultFormat('sensor', 'sensor-numeric')).toBe('U×3');
    expect(resolveGridV2DefaultFormat('cover', 'cover-position')).toBe('U×3');
    expect(resolveGridV2DefaultFormat('media')).toBe('W×3');
    expect(resolveGridV2DefaultFormat('camera')).toBe('W×4');
    expect(LIGHT_CARD_CAPABILITY.defaultSpans.xl).toEqual({ w: 2, hOff: 1, hOn: 2 });
    expect(resolveGridV2EntityCapability({
      kind: 'light',
      rawAttributes: { supported_color_modes: ['onoff'] },
    })).toBe('light-on-off');
    expect(resolveGridV2EntityCapability({
      kind: 'light',
      rawAttributes: { supported_color_modes: ['brightness'] },
    })).toBe('light-dimmer');
  });

  it('snaps deterministically, preferring wider and taller formats on ties', () => {
    expect(resolveNearestGridV2Format({
      kind: 'climate', breakpoint: 'xl', width: 3, height: 4,
    })).toEqual({ format: 'W×4', span: { w: 4, h: 4 } });
    expect(resolveNearestGridV2Format({
      kind: 'sensor', breakpoint: 'xl', width: 2, height: 3.5,
    })).toEqual({ format: 'U×4', span: { w: 2, h: 4 } });
    expect(resolveNearestGridV2Format({
      kind: 'camera', breakpoint: 'xs', width: 2, height: 4,
    })).toEqual({ format: 'W×4', span: { w: 2, h: 4 } });
    expect(resolveNearestGridV2Format({
      kind: 'light', breakpoint: 'xl', width: 2, height: 4, entityCapability: 'light-on-off',
    })).toEqual({ format: 'U×2', span: { w: 2, h: 2 } });
    expect(resolveNearestGridV2Format({
      kind: 'climate', breakpoint: 'xl', width: 2, height: 6,
    })).toEqual({ format: 'U×4', span: { w: 2, h: 4 } });
    expect(resolveNearestGridV2Format({
      kind: 'switch', breakpoint: 'xl', width: 8, height: 4,
    })).toEqual({ format: 'W×2', span: { w: 4, h: 2 } });
  });

  it('reads a light without colour modes by its features, as the room cards do', () => {
    const plain = { state: 'on', rawAttributes: { friendly_name: 'Ingresso' } };
    expect(resolveGridV2EntityCapability({ kind: 'light', rawAttributes: plain.rawAttributes, entity: plain }))
      .toBe('light-on-off');
    const dimmable = { state: 'on', rawAttributes: { brightness: 128, supported_features: 1 } };
    expect(resolveGridV2EntityCapability({ kind: 'light', rawAttributes: dimmable.rawAttributes, entity: dimmable }))
      .not.toBe('light-on-off');
    // Without the entity nothing is known: every format stays available.
    expect(resolveGridV2EntityCapability({ kind: 'light' })).toBe('default');
  });

  it('clamps snapped spans to a narrower canvas instead of dropping formats', () => {
    expect(resolveNearestGridV2Format({
      kind: 'sensor', breakpoint: 'xl', width: 1, height: 4, maxCols: 1,
    }).span).toEqual({ w: 1, h: 4 });
    expect(resolveNearestGridV2Format({
      kind: 'climate', breakpoint: 'xl', width: 8, height: 4, maxCols: 6,
    }).span).toEqual({ w: 6, h: 4 });
  });

  it('maps builder presets to the type and capability-specific v2 formats', () => {
    expect(resolveGridV2PresetFormat({
      kind: 'light', variant: 'expanded', breakpoint: 'xl', entityCapability: 'light-dimmer',
    })).toBe('W×3');
    expect(resolveGridV2PresetFormat({
      kind: 'light', variant: 'standard', breakpoint: 'xl', entityCapability: 'light-on-off',
    })).toBe('W×2');
    expect(resolveGridV2PresetFormat({ kind: 'switch', variant: 'expanded', breakpoint: 'xl' })).toBe('W×2');
    expect(resolveGridV2PresetFormat({ kind: 'sensor', variant: 'standard', breakpoint: 'xl' })).toBe('U×3');
    expect(resolveGridV2PresetFormat({ kind: 'lock', variant: 'expanded', breakpoint: 'xl' })).toBe('U×4');
    expect(resolveGridV2PresetFormat({ kind: 'climate', variant: 'expanded', breakpoint: 'xl' })).toBe('X×4');
    expect(resolveGridV2PresetFormat({
      kind: 'climate', variant: 'expanded', breakpoint: 'xl', isInsideStack: true,
    })).toBe('W×6');
    expect(resolveGridV2PresetFormat({ kind: 'camera', variant: 'expanded', breakpoint: 'xs' })).toBe('W×4');
    expect(resolveGridV2PresetFormat({ kind: 'camera', variant: 'expanded', breakpoint: 'xl' })).toBe('X×4');
    for (const breakpoint of BREAKPOINTS) {
      expect(gridV2FormatSpan('W×4', breakpoint).w).toBeLessThanOrEqual(GRID_V2_WIDTH_CLASS_COLS[breakpoint].cols);
    }
  });
});
