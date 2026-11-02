import type { GridItem, WidgetKind } from '../../types/dashboardModels';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import type { TranslationKey } from '../../i18n/translations';
import type { MockEntityState } from '../../types/ha';
import { resolveLightCapabilities } from '../dashboard/mainboard/mainBoardLightModel';

export type CardCapabilityBreakpoint = '2xl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';
export type CardLayoutVariant = 'mini' | 'standard' | 'expanded';

export type GridV2WidthClass = 'U' | 'W' | 'X';
export type GridV2CardFormat =
  | 'U×2'
  | 'U×3'
  | 'U×4'
  | 'W×2'
  | 'W×3'
  | 'W×4'
  | 'W×6'
  | 'X×4';

export type GridV2EntityCapability =
  | 'default'
  | 'light-color'
  | 'light-dimmer'
  | 'light-on-off'
  | 'cover-position'
  | 'cover-binary'
  | 'sensor-numeric'
  | 'sensor-binary';

export const GRID_V2_WIDTH_CLASS_COLS: Readonly<Record<
  CardCapabilityBreakpoint,
  Readonly<{ cols: number; U: number; W: number; X: number }>
>> = Object.freeze({
  '2xl': Object.freeze({ cols: 12, U: 2, W: 4, X: 8 }),
  xl: Object.freeze({ cols: 12, U: 2, W: 4, X: 8 }),
  lg: Object.freeze({ cols: 8, U: 2, W: 4, X: 8 }),
  md: Object.freeze({ cols: 6, U: 2, W: 4, X: 6 }),
  sm: Object.freeze({ cols: 4, U: 1, W: 2, X: 4 }),
  xs: Object.freeze({ cols: 2, U: 1, W: 2, X: 2 }),
});

const GRID_V2_FORMATS = Object.freeze([
  'U×2', 'U×3', 'U×4', 'W×2', 'W×3', 'W×4', 'W×6', 'X×4',
] as const satisfies readonly GridV2CardFormat[]);

const v2Formats = (...formats: GridV2CardFormat[]) => Object.freeze(formats);

const GRID_V2_FORMATS_BY_KIND: Readonly<Record<WidgetKind, readonly GridV2CardFormat[]>> = Object.freeze({
  light: GRID_V2_FORMATS,
  switch: v2Formats('U×2', 'W×2'),
  fan: v2Formats('U×2', 'U×3', 'W×2', 'W×3'),
  humidifier: v2Formats('U×2', 'U×3', 'W×2', 'W×3'),
  cover: v2Formats('U×2', 'U×3', 'W×2', 'W×3'),
  climate: GRID_V2_FORMATS,
  sensor: v2Formats('U×2', 'U×3', 'U×4', 'W×2', 'W×3'),
  lock: v2Formats('U×2', 'U×4', 'W×2'),
  camera: v2Formats('U×2', 'W×3', 'W×4', 'X×4'),
  media: v2Formats('U×2', 'W×3', 'W×4', 'X×4'),
  alarm: v2Formats('U×2', 'W×2', 'W×3'),
  vacuum: v2Formats('U×2', 'W×2', 'W×3'),
  calendar: v2Formats('U×2', 'W×3', 'W×4', 'X×4'),
  members: v2Formats('U×2', 'W×2', 'W×3'),
});

export function parseGridV2CardFormat(format: GridV2CardFormat) {
  return {
    widthClass: format[0] as GridV2WidthClass,
    rows: Number(format.slice(2)),
  } as const;
}

export function resolveGridV2SupportedFormats(
  kind: WidgetKind,
  entityCapability: GridV2EntityCapability = 'default',
): readonly GridV2CardFormat[] {
  if (kind === 'light') {
    if (entityCapability === 'light-on-off') return ['U×2', 'W×2'];
    if (entityCapability === 'light-dimmer') return ['U×2', 'U×3', 'W×2', 'W×3'];
  }
  if (kind === 'cover' && entityCapability === 'cover-binary') return ['U×2', 'W×2'];
  if (kind === 'sensor' && entityCapability === 'sensor-binary') return ['U×2', 'W×2'];
  return GRID_V2_FORMATS_BY_KIND[kind];
}

export function resolveGridV2EntityCapability(input: Readonly<{
  kind: WidgetKind;
  entityId?: string;
  state?: string;
  rawAttributes?: Readonly<Record<string, unknown>>;
  /** The whole entity: a light without colour modes is read by its features, as the room cards do. */
  entity?: MockEntityState;
}>): GridV2EntityCapability {
  const attributes = input.rawAttributes;
  if (input.kind === 'light') {
    const rawModes = attributes?.supported_color_modes;
    const modes = Array.isArray(rawModes) ? rawModes.filter((mode): mode is string => typeof mode === 'string') : [];
    if (modes.length === 0) {
      if (!input.entity) return 'default';
      const legacy = resolveLightCapabilities(input.entity);
      if (legacy.supportsColor || legacy.supportsColorTemp) return 'light-color';
      return legacy.supportsBrightness ? 'light-dimmer' : 'light-on-off';
    }
    if (modes.every((mode) => mode === 'onoff')) return 'light-on-off';
    if (modes.every((mode) => mode === 'onoff' || mode === 'brightness' || mode === 'white')) {
      return 'light-dimmer';
    }
    return 'light-color';
  }
  if (input.kind === 'cover') {
    if (typeof attributes?.current_position === 'number') return 'cover-position';
    const supportedFeatures = Number(attributes?.supported_features);
    return Number.isFinite(supportedFeatures) && (supportedFeatures & 4) !== 0
      ? 'cover-position'
      : 'cover-binary';
  }
  if (input.kind === 'sensor') {
    const deviceClass = typeof attributes?.device_class === 'string'
      ? attributes.device_class.toLowerCase()
      : '';
    return input.entityId?.startsWith('binary_sensor.') || deviceClass === 'smoke'
      ? 'sensor-binary'
      : 'sensor-numeric';
  }
  return 'default';
}

export function resolveGridV2DefaultFormat(
  kind: WidgetKind,
  entityCapability: GridV2EntityCapability = 'default',
): GridV2CardFormat {
  const supported = resolveGridV2SupportedFormats(kind, entityCapability);
  const preferred: GridV2CardFormat = kind === 'cover'
    ? entityCapability === 'cover-binary' ? 'U×2' : 'U×3'
    : kind === 'sensor'
      ? entityCapability === 'sensor-binary' ? 'U×2' : 'U×3'
      : kind === 'climate'
        ? 'W×4'
        : kind === 'camera' || kind === 'calendar'
          ? 'W×4'
          : kind === 'media'
            ? 'W×3'
            : kind === 'alarm' || kind === 'vacuum' || kind === 'members'
              ? 'W×2'
              : 'U×2';
  return supported.includes(preferred) ? preferred : supported[0];
}

export function gridV2FormatSpan(
  format: GridV2CardFormat,
  breakpoint: CardCapabilityBreakpoint,
): CardStaticSpan {
  const parsed = parseGridV2CardFormat(format);
  const matrix = GRID_V2_WIDTH_CLASS_COLS[breakpoint];
  return { w: matrix[parsed.widthClass], h: parsed.rows };
}

/**
 * Snaps a proposed structural span to an entity-supported v2 format. Width
 * ties prefer the wider class; height ties prefer the taller format.
 */
export function resolveNearestGridV2Format(input: Readonly<{
  kind: WidgetKind;
  breakpoint: CardCapabilityBreakpoint;
  width: number;
  height: number;
  entityCapability?: GridV2EntityCapability;
  /** Stack canvases narrower than the class: spans are clamped, never dropped. */
  maxCols?: number;
}>): Readonly<{ format: GridV2CardFormat; span: CardStaticSpan }> {
  const supported = resolveGridV2SupportedFormats(input.kind, input.entityCapability);
  const matrix = GRID_V2_WIDTH_CLASS_COLS[input.breakpoint];
  const maxCols = Math.max(1, Math.min(matrix.cols, Math.round(input.maxCols ?? matrix.cols)));
  const candidates = supported
    .map((format) => {
      const span = gridV2FormatSpan(format, input.breakpoint);
      return { format, span: { ...span, w: Math.min(span.w, maxCols) } };
    })
    .filter(({ span }) => span.w <= matrix.cols)
    // X and W intentionally collapse in XS. W wins so repeated resolution is stable.
    .filter(({ format }) => !(
      input.breakpoint === 'xs' &&
      format === 'X×4' &&
      supported.includes('W×4')
    ));
  const safeWidth = Number.isFinite(input.width) ? Math.max(1, input.width) : 1;
  const safeHeight = Number.isFinite(input.height) ? Math.max(1, input.height) : 1;
  const selected = candidates.sort((first, second) => {
    const firstWidthDistance = Math.abs(first.span.w - safeWidth);
    const secondWidthDistance = Math.abs(second.span.w - safeWidth);
    const firstHeightDistance = Math.abs(first.span.h - safeHeight);
    const secondHeightDistance = Math.abs(second.span.h - safeHeight);
    return firstWidthDistance - secondWidthDistance ||
      second.span.w - first.span.w ||
      firstHeightDistance - secondHeightDistance ||
      second.span.h - first.span.h ||
      GRID_V2_FORMATS.indexOf(first.format) - GRID_V2_FORMATS.indexOf(second.format);
  })[0];
  if (!selected) {
    const fallback = resolveGridV2DefaultFormat(input.kind, input.entityCapability);
    return { format: fallback, span: gridV2FormatSpan(fallback, input.breakpoint) };
  }
  return selected;
}

const GRID_V2_CLASSES: readonly GridV2WidthClass[] = ['U', 'W', 'X'];

/**
 * The format a card draws in its box (spec §3.2): the widest class the box
 * holds, then the tallest of its rows that fits; a class without formats for
 * the card falls back to the narrower one. The card always fills the box.
 */
export function resolveGridV2BoxFormat(input: Readonly<{
  kind: WidgetKind;
  breakpoint: CardCapabilityBreakpoint;
  width: number;
  height: number;
  entityCapability?: GridV2EntityCapability;
}>): GridV2CardFormat {
  const supported = resolveGridV2SupportedFormats(input.kind, input.entityCapability);
  const matrix = GRID_V2_WIDTH_CLASS_COLS[input.breakpoint];
  const top = input.width >= matrix.X && matrix.X > matrix.W ? 2 : input.width >= matrix.W ? 1 : 0;
  for (let rank = top; rank >= 0; rank -= 1) {
    const widthClass = GRID_V2_CLASSES[rank];
    const rows = supported
      .filter((format) => format[0] === widthClass)
      .map((format) => parseGridV2CardFormat(format).rows)
      .sort((first, second) => first - second);
    const fitting = rows.filter((value) => value <= input.height);
    // A class whose sizes are all taller than the box gives way to a narrower one.
    if (fitting.length === 0) continue;
    return `${widthClass}×${fitting[fitting.length - 1]}` as GridV2CardFormat;
  }
  const smallest = supported
    .filter((format) => format[0] === 'U')
    .sort((first, second) => parseGridV2CardFormat(first).rows - parseGridV2CardFormat(second).rows)[0];
  return smallest ?? resolveGridV2DefaultFormat(input.kind, input.entityCapability);
}

export function resolveGridV2DisplayVariant(format: GridV2CardFormat): WidgetDisplayVariant {
  if (format === 'U×2' || format === 'W×2') return 'compact';
  if (format === 'U×3' || format === 'U×4' || format === 'W×3') return 'standard';
  return 'full';
}

export function resolveGridV2PresetFormat(input: Readonly<{
  kind: WidgetKind;
  variant: CardLayoutVariant;
  breakpoint: CardCapabilityBreakpoint;
  entityCapability?: GridV2EntityCapability;
  isInsideStack?: boolean;
}>): GridV2CardFormat {
  const capability = input.entityCapability ?? 'default';
  if (input.variant === 'mini') return 'U×2';
  if (input.kind === 'light') {
    if (capability === 'light-on-off') return 'W×2';
    if (input.variant === 'standard') return 'U×3';
    return capability === 'light-dimmer' ? 'W×3' : 'W×4';
  }
  if (input.kind === 'switch') return 'W×2';
  if (input.kind === 'fan' || input.kind === 'humidifier') {
    return input.variant === 'standard' ? 'U×3' : 'W×3';
  }
  if (input.kind === 'cover') {
    if (capability === 'cover-binary') return 'W×2';
    return input.variant === 'standard' ? 'U×3' : 'W×3';
  }
  if (input.kind === 'climate') {
    if (input.variant === 'standard') return 'W×4';
    const matrix = GRID_V2_WIDTH_CLASS_COLS[input.breakpoint];
    return !input.isInsideStack && matrix.X > matrix.W ? 'X×4' : 'W×6';
  }
  if (input.kind === 'sensor') {
    if (capability === 'sensor-binary') return 'W×2';
    return input.variant === 'standard' ? 'U×3' : 'W×3';
  }
  if (input.kind === 'lock') return input.variant === 'standard' ? 'W×2' : 'U×4';
  if (input.kind === 'camera' || input.kind === 'calendar') {
    if (input.variant === 'standard') return 'W×4';
    const matrix = GRID_V2_WIDTH_CLASS_COLS[input.breakpoint];
    return matrix.X === matrix.W ? 'W×4' : 'X×4';
  }
  if (input.kind === 'media') return input.variant === 'standard' ? 'W×3' : 'W×4';
  if (input.kind === 'alarm' || input.kind === 'vacuum' || input.kind === 'members') {
    return input.variant === 'standard' ? 'W×2' : 'W×3';
  }
  return resolveGridV2DefaultFormat(input.kind, capability);
}

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
    if (!isMobile && width <= 2 && height <= 1) return 'mini';
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
    if (!isMobile && width <= 2 && height <= 1) return 'mini';
    if (height <= 1 || width <= 1 || area <= 2) return 'compact';
    if (isMobile || area <= 4) return 'standard';
    return 'full';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 320 && safeHeight >= 104) || (safeWidth >= 176 && safeHeight >= 160)) {
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

export const FAN_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'fan',
  skeleton: 'fan',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.fan.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.fan.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.fan.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 1 }, xl: { w: 2, h: 1 }, lg: { w: 2, h: 1 },
    md: { w: 2, h: 1 }, sm: { w: 2, h: 1 }, xs: { w: 1, h: 2 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (variant === 'mini') return (breakpoint === 'xl' || breakpoint === '2xl') && safeCols >= 2 ? { w: 2, h: 1 } : { w: 1, h: 1 };
    if (variant === 'standard') return breakpoint === 'xs' || safeCols < 2 ? { w: 1, h: 2 } : { w: 2, h: 2 };
    if (breakpoint === 'xs') return { w: Math.min(safeCols, 2), h: 3 };
    if (breakpoint === 'xl' || breakpoint === '2xl') return { w: Math.min(safeCols, isInsideStack ? 2 : 3), h: isInsideStack ? 4 : 3 };
    return { w: Math.min(safeCols, 2), h: 4 };
  },
  resolveDisplayVariant({ layout, breakpoint }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const isWideDesktop = breakpoint === 'xl' || breakpoint === '2xl';
    if (width <= 1 && height <= 1) return 'mini';
    if (isWideDesktop && width <= 2 && height <= 1) return 'mini';
    if ((width >= 3 && height >= 2) || (width >= 2 && height >= 3)) return 'full';
    if (width >= 2 && height >= 2) return 'standard';
    if (width <= 1 && height >= 2) return 'standard';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    if ((width >= 300 && height >= 176) || (width >= 176 && height >= 250)) return 'full';
    if (width >= 132 && height >= 108) return 'standard';
    if ((width >= 132 && height >= 48) || (width >= 92 && height >= 108)) return 'compact';
    return 'mini';
  },
};

export const HUMIDIFIER_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'humidifier',
  skeleton: 'humidifier',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.humidifier.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.humidifier.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.humidifier.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 1 }, xl: { w: 2, h: 1 }, lg: { w: 2, h: 1 },
    md: { w: 2, h: 1 }, sm: { w: 2, h: 1 }, xs: { w: 1, h: 2 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (variant === 'mini') return (breakpoint === 'xl' || breakpoint === '2xl') && safeCols >= 2 ? { w: 2, h: 1 } : { w: 1, h: 1 };
    if (variant === 'standard') return breakpoint === 'xs' || safeCols < 2 ? { w: 1, h: 2 } : { w: 2, h: 2 };
    if (breakpoint === 'xs') return { w: Math.min(safeCols, 2), h: 3 };
    if (breakpoint === 'xl' || breakpoint === '2xl') return { w: Math.min(safeCols, isInsideStack ? 2 : 3), h: isInsideStack ? 4 : 3 };
    return { w: Math.min(safeCols, 2), h: 4 };
  },
  resolveDisplayVariant({ layout, breakpoint }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    const isWideDesktop = breakpoint === 'xl' || breakpoint === '2xl';
    if (width <= 1 && height <= 1) return 'mini';
    if (isWideDesktop && width <= 2 && height <= 1) return 'mini';
    if ((width >= 3 && height >= 2) || (width >= 2 && height >= 3)) return 'full';
    if (width >= 2 && height >= 2) return 'standard';
    if (width <= 1 && height >= 2) return 'standard';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    if ((width >= 300 && height >= 176) || (width >= 176 && height >= 250)) return 'full';
    if (width >= 132 && height >= 108) return 'standard';
    if ((width >= 132 && height >= 48) || (width >= 92 && height >= 108)) return 'compact';
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

// The lock sizes follow the real grid (48 px rows, 16 px gaps). On a phone the mini
// is one column and one or two rows, the standard is one column by three rows and
// the expanded is two columns by three rows. On tablet and desktop the mini is one
// column by three rows, the standard three columns by three rows and the expanded
// four columns by four rows, or two columns by seven rows where the grid is narrow.
function isPhoneLockBreakpoint(breakpoint: CardCapabilityBreakpoint | undefined) {
  return breakpoint === 'sm' || breakpoint === 'xs';
}

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
    '2xl': { w: 3, h: 3 },
    xl: { w: 3, h: 3 },
    lg: { w: 3, h: 3 },
    md: { w: 3, h: 3 },
    sm: { w: 1, h: 3 },
    xs: { w: 1, h: 3 },
  },
  resolveVariantTarget(variant, { cols, breakpoint, isInsideStack }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (isPhoneLockBreakpoint(breakpoint)) {
      if (variant === 'mini') return { w: 1, h: 2 };
      if (variant === 'standard') return { w: 1, h: 3 };
      return { w: Math.min(safeCols, 2), h: 3 };
    }
    if (variant === 'mini') return { w: 1, h: 3 };
    if (variant === 'standard') return { w: Math.min(safeCols, 3), h: 3 };
    if (!isInsideStack && safeCols >= 6) return { w: 4, h: 4 };
    return { w: Math.min(safeCols, 2), h: 7 };
  },
  resolveDisplayVariant({ breakpoint, layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if (isPhoneLockBreakpoint(breakpoint)) {
      if (height <= 2) return 'mini';
      return width >= 2 ? 'full' : 'compact';
    }
    if (width <= 1) return 'mini';
    if (height >= 6 || (width >= 4 && height >= 4)) return 'full';
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
    if ((width >= 2 && height >= 3) || (width >= 3 && height >= 3 && !isInsideStack)) {
      return 'full';
    }
    if (isMobile && width >= 1 && height >= 2) return 'standard';
    if (width >= 2 && height >= 2) return 'standard';
    if (width <= 1 && height <= 1) return 'mini';
    if (!isMobile && width >= 2 && height <= 1) return 'mini';
    return 'compact';
  },
  resolvePixelDisplayVariant({ width, height }) {
    const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
    const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
    if ((safeWidth >= 300 && safeHeight >= 235) || (safeWidth >= 176 && safeHeight >= 250)) {
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

export const CALENDAR_CARD_CAPABILITY: StaticCardCapability = {
  kind: 'calendar',
  skeleton: 'calendar',
  supportsAutoExpand: false,
  variants: [
    { id: 'mini', previewVariant: 'mini', label: 'Mini', descriptionKey: 'builder.variant.calendar.mini' },
    { id: 'standard', previewVariant: 'standard', label: 'Standard', descriptionKey: 'builder.variant.calendar.standard' },
    { id: 'expanded', previewVariant: 'full', label: 'Expanded', descriptionKey: 'builder.variant.calendar.expanded' },
  ],
  defaultSpans: {
    '2xl': { w: 2, h: 3 },
    xl: { w: 2, h: 3 },
    lg: { w: 2, h: 3 },
    md: { w: 2, h: 3 },
    sm: { w: 2, h: 3 },
    xs: { w: 1, h: 3 },
  },
  resolveVariantTarget(variant, { breakpoint, cols }) {
    const safeCols = Math.max(1, Math.round(cols));
    if (variant === 'mini') return { w: 1, h: 1 };
    if (variant === 'standard' && breakpoint === 'xs') return { w: 1, h: 3 };
    if (variant === 'standard') return { w: Math.min(safeCols, 2), h: 3 };
    if (breakpoint !== 'xs') return { w: Math.min(safeCols, 4), h: 4 };
    return { w: Math.min(safeCols, 2), h: 3 };
  },
  resolveDisplayVariant({ breakpoint, layout }) {
    const width = toGridUnits(layout.w);
    const height = toGridUnits(layout.h);
    if (width <= 1 && height <= 1) return 'mini';
    if (breakpoint !== 'xs') {
      if (width >= 4 && height >= 4) return 'full';
      if (height <= 1) return 'compact';
      return 'standard';
    }
    if (width >= 2 && height >= 3) return 'full';
    if (height <= 1) return 'compact';
    return 'standard';
  },
  resolvePixelDisplayVariant({ width, height }) {
    if (width >= 260 && height >= 180) return 'full';
    if (width >= 165 && height >= 105) return 'standard';
    if (width >= 125 && height >= 72) return 'compact';
    return 'mini';
  },
};

const CARD_CAPABILITY_REGISTRY: Record<WidgetKind, CardCapability> = {
  sensor: SENSOR_CARD_CAPABILITY,
  light: LIGHT_CARD_CAPABILITY,
  switch: SWITCH_CARD_CAPABILITY,
  fan: FAN_CARD_CAPABILITY,
  humidifier: HUMIDIFIER_CARD_CAPABILITY,
  climate: CLIMATE_CARD_CAPABILITY,
  alarm: ALARM_CARD_CAPABILITY,
  lock: LOCK_CARD_CAPABILITY,
  cover: COVER_CARD_CAPABILITY,
  media: MEDIA_CARD_CAPABILITY,
  camera: CAMERA_CARD_CAPABILITY,
  vacuum: VACUUM_CARD_CAPABILITY,
  calendar: CALENDAR_CARD_CAPABILITY,
  members: MEMBERS_CARD_CAPABILITY,
};

export function getCardCapability(kind: WidgetKind | string): CardCapability {
  return CARD_CAPABILITY_REGISTRY[kind as WidgetKind] ?? SENSOR_CARD_CAPABILITY;
}

export function resolveCardDisplayVariant(
  kind: WidgetKind | string,
  context: CardDisplayVariantContext,
): WidgetDisplayVariant {
  return getCardCapability(kind).resolveDisplayVariant(context);
}
