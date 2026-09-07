import type { GridItem, WidgetKind } from '../../types/dashboardModels';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import type { TranslationKey } from '../../i18n/translations';

export type CardCapabilityBreakpoint = '2xl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';
export type CardLayoutVariant = 'mini' | 'standard' | 'expanded';

export type CardVariantOption = {
  id: CardLayoutVariant;
  previewVariant: WidgetDisplayVariant;
  label: string;
  descriptionKey: TranslationKey;
};

export type CardVariantTargetContext = {
  cols: number;
  breakpoint: CardCapabilityBreakpoint;
  isInsideStack: boolean;
};

export type CardDisplayVariantContext = {
  breakpoint?: CardCapabilityBreakpoint;
  layout: Pick<GridItem, 'w' | 'h'>;
  isInsideStack: boolean;
};

export type CardPixelVariantContext = {
  width: number;
  height: number;
  previousVariant?: WidgetDisplayVariant;
};

export type CardStaticSpan = {
  w: number;
  h: number;
};

export type CardExpandableSpan = {
  w: number;
  hOff: number;
  hOn: number;
  autoExpand?: boolean;
};

type CardCapabilityBase = {
  kind: WidgetKind;
  variants: readonly CardVariantOption[];
  skeleton: WidgetKind;
  supportsAutoExpand: boolean;
  resolveVariantTarget: (
    variant: CardLayoutVariant,
    context: CardVariantTargetContext,
  ) => CardStaticSpan;
  resolveDisplayVariant: (context: CardDisplayVariantContext) => WidgetDisplayVariant;
  resolvePixelDisplayVariant: (context: CardPixelVariantContext) => WidgetDisplayVariant;
};

export type StaticCardCapability = CardCapabilityBase & {
  supportsAutoExpand: false;
  defaultSpans: Readonly<Record<CardCapabilityBreakpoint, CardStaticSpan>>;
};

export type ExpandableCardCapability = CardCapabilityBase & {
  supportsAutoExpand: true;
  defaultSpans: Readonly<Record<CardCapabilityBreakpoint, CardExpandableSpan>>;
};

export type CardCapability = StaticCardCapability | ExpandableCardCapability;

export function resolveCardLayoutVariant(
  capability: CardCapability,
  displayVariant: WidgetDisplayVariant,
): CardLayoutVariant {
  const exactOption = capability.variants.find(
    (option) => option.previewVariant === displayVariant,
  );
  if (exactOption) return exactOption.id;
  if (displayVariant === 'full') return 'expanded';
  if (displayVariant === 'mini') return 'mini';
  return 'standard';
}

function toGridUnits(value: number | undefined, fallback = 1) {
  return Math.max(1, Math.round(value ?? fallback));
}

const SENSOR_PIXEL_VARIANT_RANK: Record<WidgetDisplayVariant, number> = {
  mini: 0,
  compact: 1,
  standard: 2,
  full: 3,
};

const SENSOR_PIXEL_HYSTERESIS_WIDTH = 8;
const SENSOR_PIXEL_HYSTERESIS_HEIGHT = 4;

function fitsSensorPixelVariant(
  variant: WidgetDisplayVariant,
  width: number,
  height: number,
  direction: -1 | 0 | 1 = 0,
) {
  const widthMargin = SENSOR_PIXEL_HYSTERESIS_WIDTH * direction;
  const heightMargin = SENSOR_PIXEL_HYSTERESIS_HEIGHT * direction;

  if (variant === 'mini') return true;
  if (variant === 'compact') {
    return (
      (width >= 132 + widthMargin && height >= 44 + heightMargin) ||
      (width >= 88 + widthMargin && height >= 96 + heightMargin)
    );
  }
  if (variant === 'standard') {
    return width >= 170 + widthMargin && height >= 104 + heightMargin;
  }
  return (
    (width >= 260 + widthMargin && height >= 104 + heightMargin) ||
    (width >= 176 + widthMargin && height >= 160 + heightMargin)
  );
}

function resolveSensorPixelVariantWithoutHysteresis(width: number, height: number): WidgetDisplayVariant {
  if (fitsSensorPixelVariant('full', width, height)) return 'full';
  if (fitsSensorPixelVariant('standard', width, height)) return 'standard';
  if (fitsSensorPixelVariant('compact', width, height)) return 'compact';
  return 'mini';
}

export const SENSOR_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'sensor',
  skeleton: 'sensor',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.sensor.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.sensor.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.sensor.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 3 },
    xl: { w: 2, h: 3 },
    lg: { w: 2, h: 2 },
    md: { w: 2, h: 3 },
    sm: { w: 1, h: 2 },
    xs: { w: 1, h: 1 },
  },
  resolveVariantTarget(variant, { cols, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (variant === 'mini') return { w: 1, h: 1 };
    if (variant === 'standard') return { w: Math.min(safeCols, 2), h: 2 };
    if (!isInsideStack && safeCols >= 3) return { w: 3, h: 2 };
    return { w: Math.min(safeCols, 2), h: 3 };
  },
  resolveDisplayVariant({ breakpoint, layout, isInsideStack }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const area = width * height;
    const isMobile = breakpoint === 'xs' || breakpoint === 'sm';

    if (width <= 1 && height <= 1) return 'mini';
    if (height <= 1 || width <= 1 || area <= 2) return 'compact';
    if (width >= 2 && height >= 3 && !isMobile) return 'full';
    if (width >= 3 && height >= 2 && !isInsideStack) return 'full';
    return 'standard';
  },
  resolvePixelDisplayVariant({ width, height, previousVariant }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    const nextVariant = resolveSensorPixelVariantWithoutHysteresis(safeWidth, safeHeight);

    if (!previousVariant || nextVariant === previousVariant) return nextVariant;

    const isPromotion =
      SENSOR_PIXEL_VARIANT_RANK[nextVariant] > SENSOR_PIXEL_VARIANT_RANK[previousVariant];
    if (isPromotion) {
      return fitsSensorPixelVariant(nextVariant, safeWidth, safeHeight, 1)
        ? nextVariant
        : previousVariant;
    }

    return fitsSensorPixelVariant(previousVariant, safeWidth, safeHeight, -1)
      ? previousVariant
      : nextVariant;
  },
};

export const LIGHT_CARD_CAPABILITY: ExpandableCardCapability = {
  kind: 'light',
  skeleton: 'light',
  supportsAutoExpand: true,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.light.mini' },
    { id: 'standard', previewVariant: 'compact', label: 'Standard', descriptionKey: 'builder.variant.light.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.light.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, hOff: 1, hOn: 2 },
    xl: { w: 2, hOff: 1, hOn: 2 },
    lg: { w: 2, hOff: 1, hOn: 2 },
    md: { w: 2, hOff: 1, hOn: 2 },
    sm: { w: 1, hOff: 1, hOn: 2 },
    xs: { w: 1, hOff: 1, hOn: 2 },
  },
  resolveVariantTarget(variant, { cols, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (variant === 'mini') return { w: 1, h: 1 };
    if (variant === 'standard') {
      return safeCols >= 2 ? { w: 2, h: 1 } : { w: 1, h: 2 };
    }
    return !isInsideStack && safeCols >= 3
      ? { w: 3, h: 2 }
      : { w: Math.min(safeCols, 2), h: 3 };
  },
  resolveDisplayVariant({ breakpoint, layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const area = width * height;
    const isMobile = breakpoint === 'xs' || breakpoint === 'sm';

    if (width <= 1 && height <= 1) return 'mini';
    if (height <= 1 || width <= 1 || area <= 2) return 'compact';
    if (isMobile || area <= 4) return 'standard';
    return 'full';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 260 && safeHeight >= 104) || (safeWidth >= 176 && safeHeight >= 160)) {
      return 'full';
    }
    if (safeWidth >= 170 && safeHeight >= 104) return 'standard';
    if ((safeWidth >= 132 && safeHeight >= 44) || (safeWidth >= 88 && safeHeight >= 96)) {
      return 'compact';
    }
    return 'mini';
  },
};

export const SWITCH_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'switch',
  skeleton: 'switch',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.switch.mini' },
    { id: 'standard', previewVariant: 'compact', label: 'Standard', descriptionKey: 'builder.variant.switch.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.switch.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 1 },
    xl: { w: 2, h: 1 },
    lg: { w: 2, h: 1 },
    md: { w: 2, h: 1 },
    sm: { w: 2, h: 1 },
    xs: { w: 2, h: 1 },
  },
  resolveVariantTarget(variant, context) {
    return LIGHT_CARD_CAPABILITY.resolveVariantTarget(variant, context);
  },
  resolveDisplayVariant({ breakpoint, layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const area = width * height;
    const isMobile = breakpoint === 'xs' || breakpoint === 'sm';

    if (width <= 1 && height <= 1) return 'mini';
    if (height <= 1 || width <= 1 || area <= 2) return 'compact';
    if (isMobile || area <= 4) return 'standard';
    return 'full';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 260 && safeHeight >= 104) || (safeWidth >= 176 && safeHeight >= 160)) {
      return 'full';
    }
    if (safeWidth >= 170 && safeHeight >= 104) return 'standard';
    if ((safeWidth >= 132 && safeHeight >= 44) || (safeWidth >= 88 && safeHeight >= 96)) {
      return 'compact';
    }
    return 'mini';
  },
};

export const CLIMATE_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'climate',
  skeleton: 'climate',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'compact', label: 'Mini', descriptionKey: 'builder.variant.climate.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.climate.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.climate.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 3, h: 3 },
    xl: { w: 3, h: 3 },
    lg: { w: 3, h: 3 },
    md: { w: 3, h: 3 },
    sm: { w: 2, h: 3 },
    xs: { w: 2, h: 3 },
  },
  resolveVariantTarget(variant, { cols, breakpoint }) {
    const safeCols = Math.max(1, Math.round(cols));
    const isMobile = breakpoint === 'sm' || breakpoint === 'xs';
    const targetWidth = isMobile ? 2 : 3;
    if (variant === 'mini') {
      return { w: Math.min(safeCols, 2), h: 2 };
    }
    if (variant === 'standard') {
      return { w: Math.min(safeCols, targetWidth), h: 3 };
    }
    return { w: Math.min(safeCols, targetWidth), h: 4 };
  },
  resolveDisplayVariant({ layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if (width >= 2 && height >= 4) return 'full';
    if (width >= 2 && height >= 3) return 'standard';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if (safeWidth >= 260 && safeHeight >= 212) return 'full';
    if (safeWidth >= 200 && safeHeight >= 148) return 'standard';
    return 'compact';
  },
};

export const ALARM_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'alarm',
  skeleton: 'alarm',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'compact', label: 'Mini', descriptionKey: 'builder.variant.alarm.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.alarm.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.alarm.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 3, h: 3 },
    xl: { w: 3, h: 3 },
    lg: { w: 3, h: 3 },
    md: { w: 3, h: 3 },
    sm: { w: 2, h: 3 },
    xs: { w: 2, h: 3 },
  },
  resolveVariantTarget(variant, context) {
    return CLIMATE_CARD_CAPABILITY.resolveVariantTarget(variant, context);
  },
  resolveDisplayVariant({ layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if (width >= 2 && height >= 4) return 'full';
    if (width >= 2 && height >= 3) return 'standard';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if (safeWidth >= 260 && safeHeight >= 212) return 'full';
    if (safeWidth >= 200 && safeHeight >= 148) return 'standard';
    return 'compact';
  },
};

export const LOCK_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'lock',
  skeleton: 'lock',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.lock.mini' },
    { id: 'standard', previewVariant: 'compact', label: 'Standard', descriptionKey: 'builder.variant.lock.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.lock.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 3 },
    xl: { w: 2, h: 3 },
    lg: { w: 2, h: 2 },
    md: { w: 2, h: 2 },
    sm: { w: 1, h: 2 },
    xs: { w: 1, h: 1 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    const isMobile = breakpoint === 'sm' || breakpoint === 'xs';
    if (variant === 'mini') return { w: 1, h: breakpoint === 'xs' ? 1 : 2 };
    if (variant === 'standard') return { w: Math.min(safeCols, 2), h: 2 };
    if (!isInsideStack && !isMobile && safeCols >= 3) return { w: 3, h: 2 };
    return { w: Math.min(safeCols, 2), h: 4 };
  },
  resolveDisplayVariant({ layout, isInsideStack }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if ((width >= 2 && height >= 4) || (width >= 3 && height >= 2 && !isInsideStack)) {
      return 'full';
    }
    if (width >= 2 && height >= 3) return 'standard';
    if (width <= 1 && height <= 2) return 'mini';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 250 && safeHeight >= 188) || (safeWidth >= 176 && safeHeight >= 212)) {
      return 'full';
    }
    if (safeWidth >= 170 && safeHeight >= 160) return 'standard';
    if (safeWidth >= 132 && safeHeight >= 44) return 'compact';
    return 'mini';
  },
};

export const COVER_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'cover',
  skeleton: 'cover',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.cover.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.cover.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.cover.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 3 },
    xl: { w: 2, h: 3 },
    lg: { w: 2, h: 3 },
    md: { w: 2, h: 3 },
    sm: { w: 1, h: 3 },
    xs: { w: 1, h: 2 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    const isMobile = breakpoint === 'sm' || breakpoint === 'xs';
    if (variant === 'mini') {
      return isMobile ? { w: 1, h: 1 } : { w: Math.min(safeCols, 2), h: 1 };
    }
    if (variant === 'standard') {
      return isMobile
        ? { w: 1, h: 2 }
        : { w: Math.min(safeCols, 2), h: 3 };
    }
    if (!isInsideStack && !isMobile && safeCols >= 3) return { w: 3, h: 3 };
    return { w: Math.min(safeCols, 2), h: 4 };
  },
  resolveDisplayVariant({ breakpoint, layout, isInsideStack }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const isMobile = breakpoint === 'xs' || breakpoint === 'sm';
    if ((width >= 2 && height >= 4) || (width >= 3 && height >= 3 && !isInsideStack)) {
      return 'full';
    }
    if (width >= 2 && height >= 3) return 'standard';
    if (width <= 1 && height <= 1) return 'mini';
    if (!isMobile && width >= 2 && height <= 1) return 'mini';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 350 && safeHeight >= 160) || (safeWidth >= 176 && safeHeight >= 212)) {
      return 'full';
    }
    if (safeWidth >= 170 && safeHeight >= 148) return 'standard';
    if ((safeWidth >= 132 && safeHeight >= 72) || (safeWidth >= 88 && safeHeight >= 112)) {
      return 'compact';
    }
    return 'mini';
  },
};

export const MEDIA_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'media',
  skeleton: 'media',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.media.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.media.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.media.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 3 },
    xl: { w: 2, h: 3 },
    lg: { w: 2, h: 3 },
    md: { w: 2, h: 3 },
    sm: { w: 1, h: 3 },
    xs: { w: 2, h: 3 },
  },
  resolveVariantTarget(variant, { cols, breakpoint }) {
    const safeCols = Math.max(1, Math.round(cols));
    const isMobile = breakpoint === 'sm' || breakpoint === 'xs';
    if (variant === 'mini') return { w: 1, h: 1 };
    if (variant === 'standard') {
      return { w: Math.min(safeCols, isMobile ? 2 : 3), h: 3 };
    }
    return { w: Math.min(safeCols, isMobile ? 2 : 3), h: 4 };
  },
  resolveDisplayVariant({ layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if (width >= 2 && height >= 4) return 'full';
    if (width >= 2 && height >= 3) return 'standard';
    if (width <= 1 && height <= 1) return 'mini';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if (safeWidth >= 270 && safeHeight >= 212) return 'full';
    if (safeWidth >= 220 && safeHeight >= 148) return 'standard';
    if ((safeWidth >= 150 && safeHeight >= 92) || (safeWidth >= 210 && safeHeight >= 72)) {
      return 'compact';
    }
    return 'mini';
  },
};

export const CAMERA_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'camera',
  skeleton: 'camera',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.camera.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.camera.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.camera.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 4, h: 3 },
    xl: { w: 4, h: 3 },
    lg: { w: 4, h: 3 },
    md: { w: 4, h: 3 },
    sm: { w: 1, h: 3 },
    xs: { w: 2, h: 2 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    const isMobile = breakpoint === 'sm' || breakpoint === 'xs';
    if (variant === 'mini') return { w: 1, h: 1 };
    if (variant === 'standard') {
      return { w: Math.min(safeCols, isMobile ? 2 : 3), h: 3 };
    }
    if (!isInsideStack && !isMobile && safeCols >= 4) return { w: 4, h: 4 };
    return { w: Math.min(safeCols, isMobile ? 2 : 3), h: 4 };
  },
  resolveDisplayVariant({ layout, isInsideStack }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if (
      (width >= 4 && height >= 4) ||
      (width >= 5 && height >= 3 && !isInsideStack)
    ) {
      return 'full';
    }
    if (width >= 3 && height >= 3) return 'standard';
    if (width <= 1 && height <= 1) return 'mini';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if (
      (safeWidth >= 360 && safeHeight >= 230) ||
      (safeWidth >= 300 && safeHeight >= 280)
    ) {
      return 'full';
    }
    if (safeWidth >= 260 && safeHeight >= 170) return 'standard';
    if (safeWidth >= 150 && safeHeight >= 108) return 'compact';
    return 'mini';
  },
};

export const VACUUM_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'vacuum',
  skeleton: 'vacuum',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.vacuum.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.vacuum.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.vacuum.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 3 },
    xl: { w: 2, h: 3 },
    lg: { w: 2, h: 3 },
    md: { w: 2, h: 3 },
    sm: { w: 2, h: 3 },
    xs: { w: 2, h: 3 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    const isMobile = breakpoint === 'sm' || breakpoint === 'xs';
    if (variant === 'mini') {
      return isMobile ? { w: 1, h: 1 } : { w: Math.min(safeCols, 2), h: 1 };
    }
    if (variant === 'standard') return { w: Math.min(safeCols, 2), h: 3 };
    if (!isInsideStack && !isMobile && safeCols >= 3) return { w: 3, h: 4 };
    return { w: Math.min(safeCols, 2), h: 5 };
  },
  resolveDisplayVariant({ breakpoint, layout, isInsideStack }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const isMobile = breakpoint === 'xs' || breakpoint === 'sm';
    if ((width >= 3 && height >= 4 && !isInsideStack) || (width >= 2 && height >= 5)) {
      return 'full';
    }
    if (width >= 2 && height >= 3) return 'standard';
    if (width <= 1 && height <= 1) return 'mini';
    if (!isMobile && width >= 2 && height <= 1) return 'mini';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 260 && safeHeight >= 188) || (safeWidth >= 170 && safeHeight >= 235)) {
      return 'full';
    }
    if (safeWidth >= 165 && safeHeight >= 132) return 'standard';
    if ((safeWidth >= 130 && safeHeight >= 88) || (safeWidth >= 82 && safeHeight >= 125)) {
      return 'compact';
    }
    return 'mini';
  },
};

export const MEMBERS_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'members',
  skeleton: 'members',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.members.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.members.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.members.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 3, h: 2 },
    xl: { w: 3, h: 2 },
    lg: { w: 3, h: 2 },
    md: { w: 2, h: 2 },
    sm: { w: 2, h: 2 },
    xs: { w: 2, h: 2 },
  },
  resolveVariantTarget(variant, { cols, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (variant === 'mini') return { w: 1, h: 1 };
    if (variant === 'standard') return { w: Math.min(safeCols, 2), h: 2 };
    if (!isInsideStack && safeCols >= 3) return { w: 3, h: 2 };
    return { w: Math.min(safeCols, 2), h: 3 };
  },
  resolveDisplayVariant({ breakpoint, layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const area = width * height;
    const isMobile = breakpoint === 'xs' || breakpoint === 'sm';
    if (width <= 1 && height <= 1) return 'mini';
    if (height <= 1 || width <= 1 || area <= 2) return 'compact';
    if (isMobile || area <= 4) return 'standard';
    return 'full';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if (safeWidth >= 260 && safeHeight >= 160) return 'full';
    if (safeWidth >= 170 && safeHeight >= 104) return 'standard';
    if ((safeWidth >= 132 && safeHeight >= 44) || (safeWidth >= 88 && safeHeight >= 96)) {
      return 'compact';
    }
    return 'mini';
  },
};

const CARD_CAPABILITY_REGISTRY: Record<WidgetKind, CardCapability> = {
  sensor: SENSOR_CARD_CAPABILITY,
  light: LIGHT_CARD_CAPABILITY,
  switch: SWITCH_CARD_CAPABILITY,
  climate: CLIMATE_CARD_CAPABILITY,
  alarm: ALARM_CARD_CAPABILITY,
  lock: LOCK_CARD_CAPABILITY,
  cover: COVER_CARD_CAPABILITY,
  media: MEDIA_CARD_CAPABILITY,
  camera: CAMERA_CARD_CAPABILITY,
  vacuum: VACUUM_CARD_CAPABILITY,
  members: MEMBERS_CARD_CAPABILITY,
};

export function getCardCapability(kind: WidgetKind): CardCapability {
  return CARD_CAPABILITY_REGISTRY[kind];
}

export function resolveCardDisplayVariant(
  kind: WidgetKind,
  context: CardDisplayVariantContext,
): WidgetDisplayVariant {
  return getCardCapability(kind).resolveDisplayVariant(context);
}
