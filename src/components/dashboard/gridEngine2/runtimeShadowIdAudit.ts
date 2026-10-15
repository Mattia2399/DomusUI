import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardBreakpointLayouts,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';
import type { RuntimeShadowRootElement } from './runtimeShadowBaseline';

export type RuntimeShadowIdCategory =
  | 'widget'
  | 'section'
  | 'stack'
  | 'special-section'
  | 'legacy'
  | 'unclassifiable';

export type RuntimeShadowIdEvidence =
  | 'current-root'
  | 'known-non-root'
  | 'known-legacy'
  | 'id-convention'
  | 'normalization-match'
  | 'unknown';

export type RuntimeShadowIdFinding = {
  readonly fingerprint: string;
  readonly category: RuntimeShadowIdCategory;
  readonly evidence: RuntimeShadowIdEvidence;
  /** Included only behind the explicit development details flag. */
  readonly rawId?: string;
};

export type RuntimeShadowDuplicateId = RuntimeShadowIdFinding & {
  readonly occurrences: number;
};

export type RuntimeShadowIdSetSummary = {
  readonly itemCount: number;
  readonly uniqueIdCount: number;
  readonly ids: readonly RuntimeShadowIdFinding[];
  readonly duplicates: readonly RuntimeShadowDuplicateId[];
};

export type RuntimeShadowNormalizationDifference = {
  readonly left: RuntimeShadowIdFinding;
  readonly right: RuntimeShadowIdFinding;
};

export type RuntimeShadowBreakpointIdAudit = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly hasExplicitStructuralLayout: boolean;
  readonly structuralIds: RuntimeShadowIdSetSummary;
  readonly recognizedRootIds: RuntimeShadowIdSetSummary;
  readonly renderedRootIds: RuntimeShadowIdSetSummary;
  readonly structuralNotRecognized: readonly RuntimeShadowIdFinding[];
  readonly recognizedNotStructural: readonly RuntimeShadowIdFinding[];
  readonly recognizedNotRendered: readonly RuntimeShadowIdFinding[];
  readonly renderedNotRecognized: readonly RuntimeShadowIdFinding[];
  readonly normalizationDifferences: readonly RuntimeShadowNormalizationDifference[];
  readonly unknownIdsCount: number;
  readonly missingIdsCount: number;
  readonly unknownCategories: Readonly<Partial<Record<RuntimeShadowIdCategory, number>>>;
};

export type RuntimeShadowBaselineIdAudit = {
  readonly structuralIds: Readonly<Record<DashboardGridBreakpoint, number>>;
  readonly recognizedRootIds: number;
  readonly renderedRootIds: Readonly<Record<DashboardGridBreakpoint, number>>;
  /** Distinct IDs across all breakpoints. */
  readonly unknownIdsCount: number;
  readonly unknownIdOccurrences: number;
  /** Distinct IDs across all breakpoints. */
  readonly missingIdsCount: number;
  readonly missingIdOccurrences: number;
  readonly unknownCategories: Readonly<Partial<Record<RuntimeShadowIdCategory, number>>>;
  readonly unknownIdGroups: readonly (RuntimeShadowIdFinding & {
    readonly breakpoints: readonly DashboardGridBreakpoint[];
  })[];
  readonly affectedBreakpoints: readonly DashboardGridBreakpoint[];
  readonly breakpoints: Readonly<Record<DashboardGridBreakpoint, RuntimeShadowBreakpointIdAudit>>;
};

export type RuntimeShadowIdAuditInput = {
  readonly rootElements: readonly RuntimeShadowRootElement[];
  /** Known widgets intentionally excluded from the root because they belong to a Stack. */
  readonly knownNonRootElements?: readonly RuntimeShadowRootElement[];
  readonly explicitLayouts?: Readonly<DashboardBreakpointLayouts>;
  /** Effective root geometry supplied to the renderer. */
  readonly rendererLayouts?: Readonly<DashboardBreakpointLayouts>;
  /** Optional, explicit inventory only; no ID is guessed to be legacy. */
  readonly knownLegacyIds?: readonly string[];
  readonly includeRawIds?: boolean;
};

const SPECIAL_SECTION_KINDS = new Set(['greeting', 'weather', 'scenes']);
const STACK_KINDS = new Set(['stack-vertical', 'stack-horizontal', 'stack-grid']);
const WIDGET_ID_PREFIXES = new Set([
  'light',
  'switch',
  'fan',
  'humidifier',
  'climate',
  'camera',
  'sensor',
  'media',
  'alarm',
  'vacuum',
  'lock',
  'cover',
  'calendar',
  'members',
]);

function compareStrings(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** Stable non-cryptographic identifier used only to correlate diagnostics. */
export function fingerprintRuntimeShadowId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `id-${id.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeComparableId(id: string) {
  return id.normalize('NFKC').trim().toLowerCase();
}

function categoryForElement(element: RuntimeShadowRootElement): RuntimeShadowIdCategory {
  if (element.role === 'widget') return 'widget';
  if (element.role === 'stack' || STACK_KINDS.has(element.kind)) return 'stack';
  if (SPECIAL_SECTION_KINDS.has(element.kind)) return 'special-section';
  return 'section';
}

function categoryFromIdConvention(id: string): RuntimeShadowIdCategory | null {
  if (/^(?:starter-)?section-(?:greeting|weather|scenes)(?:-|$)/.test(id)) return 'special-section';
  if (/^section-stack-(?:vertical|horizontal|grid)(?:-|$)/.test(id)) return 'stack';
  if (/^section-[a-z-]+-\d+$/.test(id)) return 'section';
  if (/^starter-(?:climate|camera|sensor|lock|alarm|media|cover)-v\d+$/.test(id)) return 'widget';
  const customWidgetMatch = /^([a-z_]+)\.custom_\d+$/.exec(id);
  if (customWidgetMatch && WIDGET_ID_PREFIXES.has(customWidgetMatch[1])) return 'widget';
  return null;
}

type Classifier = ReturnType<typeof createClassifier>;

function createClassifier(input: RuntimeShadowIdAuditInput) {
  const currentById = new Map(input.rootElements.map((element) => [element.id, element]));
  const nonRootById = new Map((input.knownNonRootElements ?? []).map((element) => [element.id, element]));
  const legacyIds = new Set(input.knownLegacyIds ?? []);
  const knownElements = [...input.rootElements, ...(input.knownNonRootElements ?? [])];
  const normalizedKnown = new Map<string, RuntimeShadowRootElement[]>();
  knownElements.forEach((element) => {
    const normalized = normalizeComparableId(element.id);
    normalizedKnown.set(normalized, [...(normalizedKnown.get(normalized) ?? []), element]);
  });

  return { currentById, nonRootById, legacyIds, normalizedKnown };
}

function classifyId(id: string, classifier: Classifier) {
  const current = classifier.currentById.get(id);
  if (current) return { category: categoryForElement(current), evidence: 'current-root' as const };
  const nonRoot = classifier.nonRootById.get(id);
  if (nonRoot) return { category: categoryForElement(nonRoot), evidence: 'known-non-root' as const };
  if (classifier.legacyIds.has(id)) return { category: 'legacy' as const, evidence: 'known-legacy' as const };
  const normalizedMatches = classifier.normalizedKnown.get(normalizeComparableId(id));
  if (normalizedMatches?.length === 1) {
    return { category: categoryForElement(normalizedMatches[0]), evidence: 'normalization-match' as const };
  }
  const conventionalCategory = categoryFromIdConvention(id);
  if (conventionalCategory) return { category: conventionalCategory, evidence: 'id-convention' as const };
  return { category: 'unclassifiable' as const, evidence: 'unknown' as const };
}

function findingForId(id: string, classifier: Classifier, includeRawIds: boolean): RuntimeShadowIdFinding {
  return {
    fingerprint: fingerprintRuntimeShadowId(id),
    ...classifyId(id, classifier),
    ...(includeRawIds ? { rawId: id } : null),
  };
}

function summarizeIds(ids: readonly string[], classifier: Classifier, includeRawIds: boolean): RuntimeShadowIdSetSummary {
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const duplicates = [...counts]
    .filter(([, occurrences]) => occurrences > 1)
    .sort(([first], [second]) => compareStrings(first, second))
    .map(([id, occurrences]) => ({ ...findingForId(id, classifier, includeRawIds), occurrences }));
  const uniqueIds = [...counts.keys()]
    .sort(compareStrings)
    .map((id) => findingForId(id, classifier, includeRawIds));
  return { itemCount: ids.length, uniqueIdCount: counts.size, ids: uniqueIds, duplicates };
}

function setDifference(leftIds: readonly string[], rightIds: readonly string[]) {
  const right = new Set(rightIds);
  return [...new Set(leftIds)].filter((id) => !right.has(id)).sort(compareStrings);
}

function findNormalizationDifferences(
  leftIds: readonly string[],
  rightIds: readonly string[],
  classifier: Classifier,
  includeRawIds: boolean,
) {
  const rightExact = new Set(rightIds);
  const rightByNormalized = new Map<string, string[]>();
  [...new Set(rightIds)].forEach((id) => {
    const normalized = normalizeComparableId(id);
    rightByNormalized.set(normalized, [...(rightByNormalized.get(normalized) ?? []), id]);
  });
  const pairs: RuntimeShadowNormalizationDifference[] = [];
  [...new Set(leftIds)].sort(compareStrings).forEach((leftId) => {
    if (rightExact.has(leftId)) return;
    (rightByNormalized.get(normalizeComparableId(leftId)) ?? []).sort(compareStrings).forEach((rightId) => {
      pairs.push({
        left: findingForId(leftId, classifier, includeRawIds),
        right: findingForId(rightId, classifier, includeRawIds),
      });
    });
  });
  return pairs;
}

function categoryCounts(findings: readonly RuntimeShadowIdFinding[]) {
  const counts: Partial<Record<RuntimeShadowIdCategory, number>> = {};
  findings.forEach(({ category }) => {
    counts[category] = (counts[category] ?? 0) + 1;
  });
  return counts;
}

/**
 * Compares persisted structural IDs, GridCanvas roots and effective renderer
 * inputs without repairing, filtering or mutating any source.
 */
export function auditRuntimeShadowIds(input: RuntimeShadowIdAuditInput): RuntimeShadowBaselineIdAudit {
  const includeRawIds = input.includeRawIds === true;
  const classifier = createClassifier(input);
  const recognizedIds = input.rootElements.map((element) => element.id);
  const recognizedSummary = summarizeIds(recognizedIds, classifier, includeRawIds);
  const structuralCounts = {} as Record<DashboardGridBreakpoint, number>;
  const renderedCounts = {} as Record<DashboardGridBreakpoint, number>;
  const breakpoints = {} as Record<DashboardGridBreakpoint, RuntimeShadowBreakpointIdAudit>;
  const affectedBreakpoints: DashboardGridBreakpoint[] = [];
  const unknownBreakpointsById = new Map<string, DashboardGridBreakpoint[]>();
  const missingIds = new Set<string>();
  let unknownIdOccurrences = 0;
  let missingIdOccurrences = 0;

  DASHBOARD_GRID_BREAKPOINT_ORDER.forEach((breakpoint) => {
    const hasExplicitStructuralLayout = Object.prototype.hasOwnProperty.call(input.explicitLayouts ?? {}, breakpoint);
    const structuralIds = (input.explicitLayouts?.[breakpoint] ?? []).map((item) => item.i);
    const renderedIds = (input.rendererLayouts?.[breakpoint] ?? []).map((item) => item.i);
    const structuralNotRecognizedIds = setDifference(structuralIds, recognizedIds);
    const recognizedNotStructuralIds = setDifference(recognizedIds, structuralIds);
    const recognizedNotRenderedIds = setDifference(recognizedIds, renderedIds);
    const renderedNotRecognizedIds = setDifference(renderedIds, recognizedIds);
    const structuralNotRecognized = structuralNotRecognizedIds.map((id) =>
      findingForId(id, classifier, includeRawIds));
    const unknownCategories = categoryCounts(structuralNotRecognized);
    const normalizationDifferences = [
      ...findNormalizationDifferences(structuralIds, recognizedIds, classifier, includeRawIds),
      ...findNormalizationDifferences(recognizedIds, renderedIds, classifier, includeRawIds),
    ];
    const structuralSummary = summarizeIds(structuralIds, classifier, includeRawIds);
    const renderedSummary = summarizeIds(renderedIds, classifier, includeRawIds);
    const audit: RuntimeShadowBreakpointIdAudit = {
      breakpoint,
      hasExplicitStructuralLayout,
      structuralIds: structuralSummary,
      recognizedRootIds: recognizedSummary,
      renderedRootIds: renderedSummary,
      structuralNotRecognized,
      recognizedNotStructural: recognizedNotStructuralIds.map((id) => findingForId(id, classifier, includeRawIds)),
      recognizedNotRendered: recognizedNotRenderedIds.map((id) => findingForId(id, classifier, includeRawIds)),
      renderedNotRecognized: renderedNotRecognizedIds.map((id) => findingForId(id, classifier, includeRawIds)),
      normalizationDifferences,
      unknownIdsCount: structuralNotRecognized.length,
      missingIdsCount: recognizedNotStructuralIds.length,
      unknownCategories,
    };
    structuralCounts[breakpoint] = structuralSummary.itemCount;
    renderedCounts[breakpoint] = renderedSummary.itemCount;
    breakpoints[breakpoint] = audit;
    structuralNotRecognizedIds.forEach((id) => {
      unknownBreakpointsById.set(id, [...(unknownBreakpointsById.get(id) ?? []), breakpoint]);
    });
    recognizedNotStructuralIds.forEach((id) => missingIds.add(id));
    unknownIdOccurrences += audit.unknownIdsCount;
    missingIdOccurrences += audit.missingIdsCount;
    if (
      structuralNotRecognized.length > 0 ||
      recognizedNotStructuralIds.length > 0 ||
      recognizedNotRenderedIds.length > 0 ||
      renderedNotRecognizedIds.length > 0 ||
      structuralSummary.duplicates.length > 0 ||
      recognizedSummary.duplicates.length > 0 ||
      renderedSummary.duplicates.length > 0 ||
      normalizationDifferences.length > 0
    ) {
      affectedBreakpoints.push(breakpoint);
    }
  });

  const unknownIdGroups = [...unknownBreakpointsById]
    .sort(([first], [second]) => compareStrings(first, second))
    .map(([id, breakpointsForId]) => ({
      ...findingForId(id, classifier, includeRawIds),
      breakpoints: breakpointsForId,
    }));

  return {
    structuralIds: structuralCounts,
    recognizedRootIds: recognizedSummary.itemCount,
    renderedRootIds: renderedCounts,
    unknownIdsCount: unknownIdGroups.length,
    unknownIdOccurrences,
    missingIdsCount: missingIds.size,
    missingIdOccurrences,
    unknownCategories: categoryCounts(unknownIdGroups),
    unknownIdGroups,
    affectedBreakpoints,
    breakpoints,
  };
}
